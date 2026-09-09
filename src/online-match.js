import { createRound } from './round.js'
import { createChargeMeter } from './weapons.js'
import { aimArrowSpeed } from './arrow.js'
import { snapshotRound, createReplicaRound } from './replica.js'
import { tune } from './tune.js'

export const INPUT_TIMEOUT = 0.5
export const SNAPSHOT_INTERVAL = 1 / 20
const neutral = () => ({
	move: { x: 0, z: 0 },
	target: { x: 0, z: 0 },
	weapon: 'bow',
	down: false,
	action: null,
})
const point = (p) =>
	p && Number.isFinite(p.x) && Number.isFinite(p.z) && Math.abs(p.x) <= 100 && Math.abs(p.z) <= 100
const safeInt = (n) => Number.isSafeInteger(n) && n >= 0
export function validInput(input, matchId, roundId) {
	return (
		!!input &&
		input.matchId === matchId &&
		input.roundId === roundId &&
		safeInt(input.seq) &&
		point(input.move) &&
		Math.hypot(input.move.x, input.move.z) <= 1.001 &&
		point(input.target) &&
		['bow', 'bowl'].includes(input.weapon) &&
		typeof input.down === 'boolean' &&
		[null, 'press', 'release', 'dash', 'jump', 'cancel'].includes(input.action)
	)
}

// Host runs the ordinary Round. Guest has presentation objects only. All humans,
// including the host, go through the same input and weapon rules.
export function createOnlineMatch({
	ctx,
	net,
	roster,
	matchId,
	overlay,
	clearActions,
	resetPresentation,
	onChange = () => {},
	onLobby = () => {},
	now = () => performance.now() / 1000,
}) {
	let round = null
	let phase = 'playing'
	let winner = null
	let roundId = 0
	let seq = 0
	let inputSeq = 0
	let lastSeq = -1
	let lastEvent = 0
	let eventId = 0
	let events = []
	let sendClock = 0
	let lastInputSend = -Infinity
	let lastInputKey = ''
	let disposed = false
	const stats = { snapshots: 0, bytes: 0, received: 0, inputs: 0 }
	let lastHostPacket = now()
	const seats = new Map()
	const match = {
		bestOf: 3,
		needed: 2,
		wins: { A: 0, B: 0 },
		round: 0,
		enemies: roster.filter((p) => p.team === 'B').length,
		allies: roster.filter((p) => p.team === 'A').length - 1,
		arrowCount: Math.max(7, roster.filter((p) => p.controller === 'human').length),
	}
	function present(event) {
		if (net.isHost) events.push({ id: ++eventId, event: structuredClone(event) })
		ctx.present(event)
	}
	function spawn() {
		round?.dispose()
		resetPresentation()
		clearActions()
		roundId++
		match.round++
		phase = 'playing'
		winner = null
		events = []
		seats.clear()
		for (const p of roster.filter((p) => p.controller === 'human'))
			seats.set(p.peerId, {
				participantId: p.id,
				input: neutral(),
				queue: [],
				seq: -1,
				seen: -Infinity,
				meter: createChargeMeter(),
				rateAt: now(),
				count: 0,
			})
		round = createRound(
			{ ...ctx, present },
			{
				roster,
				localParticipantId: net.id,
				arrowCount: match.arrowCount,
				roundNum: match.round,
				onOver: endRound,
			},
		)
		for (const u of round.units) u.weapon = 'bow'
		round.lateUpdate()
		overlay.hide()
		onChange()
	}
	function showResult() {
		const won = winner === round.localPlayer.team
		overlay.show({
			title:
				winner === null
					? 'DRAW'
					: phase === 'matchOver'
						? won
							? 'YOU WIN'
							: 'YOU LOSE'
						: won
							? 'ROUND WON'
							: 'ROUND LOST',
			subtitle: `${match.wins.A}–${match.wins.B}${net.isHost ? '' : ' · Waiting for host'}`,
			actions: [
				...(net.isHost
					? [
							{
								label: phase === 'matchOver' ? 'Back to lobby' : 'Next round',
								keyLabel: 'Enter',
								onSelect: () => {
									if (phase === 'matchOver') onLobby()
									else {
										spawn()
										broadcast()
									}
								},
							},
						]
					: []),
				{ label: 'Leave match', onSelect: () => onLobby(true) },
			],
		})
	}
	function endRound(result) {
		if (phase !== 'playing') return
		winner = result
		if (result) match.wins[result]++
		phase = result && match.wins[result] >= match.needed ? 'matchOver' : 'roundOver'
		clearActions()
		showResult()
		onChange()
		broadcast()
	}
	function broadcast() {
		if (!net.isHost || !round || disposed) return
		const packet = {
			matchId,
			roundId,
			seq: ++seq,
			phase,
			winner,
			match: { ...match, wins: { ...match.wins } },
			world: snapshotRound(round),
			events,
		}
		events = []
		stats.snapshots++
		stats.bytes += JSON.stringify(packet).length
		net.send('snapshot', packet)
	}
	function receiveInput(input, from) {
		if (!net.isHost || phase !== 'playing' || !validInput(input, matchId, roundId)) return false
		const seat = seats.get(from)
		if (!seat || input.seq <= seat.seq) return false
		const time = now()
		if (time - seat.rateAt >= 1) {
			seat.rateAt = time
			seat.count = 0
		}
		if (++seat.count > 120 || seat.queue.length >= 32) return false
		stats.inputs++
		seat.seq = input.seq
		seat.seen = time
		seat.input = structuredClone(input)
		if (input.action) seat.queue.push(structuredClone(input))
		return true
	}
	function fire(unit, seat, input) {
		if (!unit.alive || !unit.heldArrow || round.over) {
			seat.meter.cancel()
			return
		}
		aim(unit, input)
		if (input.weapon === 'bowl')
			round.looseArrow(unit, unit.aim, tune.weapons.bowlSpeed, { kind: 'bowl' })
		else {
			const shot = seat.meter.release()
			if (!shot) return
			const distance = Math.max(
				0,
				Math.hypot(input.target.x - unit.position.x, input.target.z - unit.position.z) - 0.6,
			)
			round.looseArrow(unit, unit.aim, aimArrowSpeed(distance, unit.handPosition().y, shot.speed), {
				kind: 'arrow',
				perfect: shot.perfect,
			})
		}
	}
	function aim(unit, input) {
		unit.aim.set(input.target.x - unit.position.x, 0, input.target.z - unit.position.z)
		if (unit.aim.lengthSq() < 1e-6) unit.aim.set(0, 0, -1)
		unit.aim.normalize()
	}
	function step(dt) {
		if (disposed || !net.isHost || phase !== 'playing') return
		const moves = new Map()
		for (const seat of seats.values()) {
			const unit = round.units.find((u) => u.participantId === seat.participantId)
			if (now() - seat.seen > INPUT_TIMEOUT) {
				seat.input = neutral()
				seat.queue = []
				seat.meter.cancel()
			}
			for (const input of seat.queue) {
				if (unit.weapon !== input.weapon) seat.meter.cancel()
				unit.weapon = input.weapon
				if (input.action === 'cancel') seat.meter.cancel()
				else if (input.action === 'press' && unit.heldArrow) {
					if (input.weapon === 'bow') seat.meter.press()
					else fire(unit, seat, input)
				} else if (input.action === 'release' && input.weapon === 'bow') fire(unit, seat, input)
				else if (input.action === 'jump' && !round.over) unit.jump()
				else if (input.action === 'dash' && !round.over) round.dashUnit(unit, input.move)
			}
			seat.queue = []
			const input = seat.input
			if (unit.weapon !== input.weapon) seat.meter.cancel()
			unit.weapon = input.weapon
			aim(unit, input)
			if (!unit.alive || !unit.heldArrow || !input.down) seat.meter.cancel()
			else seat.meter.update(dt)
			unit.windup = seat.meter.charging ? seat.meter.value : 0
			moves.set(unit.participantId, input.move)
		}
		round.step(dt, moves.get(net.id), moves)
		if (!disposed) round.lateUpdate()
	}
	function validPacket(packet) {
		if (
			!packet ||
			packet.matchId !== matchId ||
			!safeInt(packet.seq) ||
			packet.seq <= lastSeq ||
			!safeInt(packet.roundId) ||
			packet.roundId < roundId ||
			packet.roundId < 1
		)
			return false
		if (
			!['playing', 'roundOver', 'matchOver'].includes(packet.phase) ||
			![null, 'A', 'B'].includes(packet.winner)
		)
			return false
		const m = packet.match
		if (
			!m ||
			!safeInt(m.round) ||
			m.round !== packet.roundId ||
			m.needed !== 2 ||
			!m.wins ||
			!['A', 'B'].every((t) => safeInt(m.wins[t]) && m.wins[t] <= 2)
		)
			return false
		if (!Array.isArray(packet.events) || packet.events.length > 256) return false
		const identity = (value) =>
			value &&
			safeInt(value.id) &&
			['A', 'B'].includes(value.team) &&
			typeof value.isHuman === 'boolean'
		return packet.events.every((entry) => {
			if (!entry || !safeInt(entry.id)) return false
			const event = entry.event
			if (
				!event ||
				!['shot', 'pickup', 'dash', 'land', 'impact', 'fall'].includes(event.type) ||
				!point(event.point) ||
				!Number.isFinite(event.point.y)
			)
				return false
			if (
				['shot', 'pickup', 'dash', 'land', 'impact'].includes(event.type) &&
				!identity(event.source)
			)
				return false
			if (
				event.type !== 'pickup' &&
				(!point(event.direction) || !Number.isFinite(event.direction.y))
			)
				return false
			if (event.outcome === 'eliminated' && !identity(event.target)) return false
			return true
		})
	}
	function receiveSnapshot(packet, from) {
		if (disposed || net.isHost || from !== net.hostId || !validPacket(packet)) return false
		let next = round
		const newRound = packet.roundId !== roundId
		if (newRound) next = createReplicaRound(ctx, { roster, localParticipantId: net.id })
		if (next.push(packet.world, now()) === false) {
			if (newRound) next.dispose()
			return false
		}
		if (newRound) {
			round.dispose()
			round = next
			resetPresentation()
			clearActions()
			roundId = packet.roundId
			overlay.hide()
		}
		stats.received++
		lastSeq = packet.seq
		lastHostPacket = now()
		const oldPhase = phase
		phase = packet.phase
		winner = packet.winner
		Object.assign(match, packet.match, { wins: { ...packet.match.wins } })
		for (const { id, event } of packet.events) {
			if (id <= lastEvent) continue
			lastEvent = id
			ctx.present(event)
		}
		if (phase !== 'playing' && (oldPhase !== phase || newRound)) {
			clearActions()
			showResult()
		}
		onChange()
		return true
	}
	if (net.isHost) spawn()
	else round = createReplicaRound(ctx, { roster, localParticipantId: net.id })
	return {
		get round() {
			return round
		},
		get phase() {
			return phase
		},
		get winner() {
			return winner
		},
		match,
		get roundId() {
			return roundId
		},
		matchId,
		stats,
		transitioning: false,
		portals: [],
		setInput(value, action = null, force = false) {
			if (disposed || phase !== 'playing' || roundId === 0) return
			const time = now(),
				key = JSON.stringify(value)
			if (!force && !action && key === lastInputKey && time - lastInputSend < 1 / 30) return
			if (!force && !action && time - lastInputSend < 1 / 60) return
			lastInputSend = time
			lastInputKey = key
			const input = { ...value, action, seq: ++inputSeq, matchId, roundId }
			if (net.isHost) receiveInput(input, net.id)
			else net.send('input', input)
		},
		receive(type, data, from) {
			return type === 'input'
				? receiveInput(data, from)
				: type === 'snapshot'
					? receiveSnapshot(data, from)
					: false
		},
		step,
		update(dt) {
			if (disposed) return
			if (net.isHost) {
				sendClock += dt
				if (sendClock >= SNAPSHOT_INTERVAL) {
					sendClock %= SNAPSHOT_INTERVAL
					broadcast()
				}
			} else {
				round.lateUpdate(now())
				if (now() - lastHostPacket > 10) {
					lastHostPacket = Infinity
					onLobby(true, 'The host stopped responding. Session ended.')
				}
			}
		},
		broadcast,
		dispose() {
			disposed = true
			round.dispose()
			seats.clear()
			events = []
			overlay.hide()
		},
	}
}
