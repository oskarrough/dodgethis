import * as THREE from 'three'
import { createPlayer } from './player.js'
import { createArrow } from './arrow.js'
import { validateRoster } from './roster.js'
import { spawnPoint } from './arena.js'
import { PALETTE } from './style.js'

const DELAY = 0.08
const MAX_SNAPSHOTS = 6
const MAX_ARROWS = 1000
const vector = (v) => ({ x: v.x, y: v.y, z: v.z })
const numericId = (id) => Number.isSafeInteger(id) && id >= 0
const finite = (n, limit = 10000) => Number.isFinite(n) && Math.abs(n) <= limit
const validVector = (v) => !!v && finite(v.x) && finite(v.y) && finite(v.z)
const validQuaternion = (q) =>
	!!q &&
	validVector(q) &&
	finite(q.w) &&
	Math.abs(q.x ** 2 + q.y ** 2 + q.z ** 2 + q.w ** 2 - 1) < 0.001

// Dead players already removed their bodies. Never touch those Rapier handles.
export function snapshotRound(round) {
	return {
		units: round.units.map((unit) => ({
			id: unit.id,
			participant: { ...unit.participant },
			position: vector(unit.alive && unit.body ? unit.body.translation() : unit.position),
			aim: vector(unit.aim),
			yaw: unit.mesh.rotation.y,
			alive: unit.alive,
			velocity: unit.alive ? vector(unit.velocity) : { x: 0, y: 0, z: 0 },
			grounded: unit.grounded,
			dashTime: unit.dashTime,
			dashCooldown: unit.dashCooldown,
			dashDirection: unit.dashDirection,
			dashing: unit.dashing,
			dashReady: unit.dashReady,
			windup: unit.windup ?? 0,
			weapon: unit.weapon ?? 'bow',
			heldArrow: unit.heldArrow?.id ?? null,
		})),
		arrows: round.arrows.map((arrow) => arrow.snapshot()),
	}
}

export function createReplicaRound(ctx, { roster, localParticipantId }) {
	const participants = validateRoster(roster)
	if (!participants.some((p) => p.id === localParticipantId && p.controller === 'human'))
		throw new Error('localParticipantId must identify a human in the roster')
	const counts = { A: 0, B: 0 },
		indices = { A: 0, B: 0 }
	for (const p of participants) counts[p.team]++
	// Same meshes and spawn slots, deliberately no world/Rapier services at all.
	const units = participants.map((participant) =>
		createPlayer(ctx.scene, null, null, {
			participant,
			replica: true,
			position: spawnPoint(participant.team, indices[participant.team]++, counts[participant.team]),
			color: participant.team === 'A' ? PALETTE.teamA : PALETTE.teamB,
		}),
	)
	const byParticipant = new Map(units.map((unit) => [unit.participantId, unit]))
	const localPlayer = byParticipant.get(localParticipantId)
	const arrows = []
	const byArrow = new Map()
	const history = []
	let initialized = false
	let disposed = false
	const position = new THREE.Vector3()
	const aim = new THREE.Vector3()
	const quaternion = new THREE.Quaternion()
	const targetQuaternion = new THREE.Quaternion()

	function valid(snapshot) {
		if (
			!snapshot ||
			!Array.isArray(snapshot.units) ||
			snapshot.units.length !== units.length ||
			!Array.isArray(snapshot.arrows) ||
			snapshot.arrows.length > MAX_ARROWS
		)
			return false
		const seenParticipants = new Set(),
			seenUnits = new Map(),
			held = new Set()
		for (const state of snapshot.units) {
			const unit = byParticipant.get(state?.participant?.id)
			if (
				!unit ||
				seenParticipants.has(unit.participantId) ||
				!numericId(state.id) ||
				seenUnits.has(state.id)
			)
				return false
			const p = state.participant
			if (p.team !== unit.team || p.controller !== unit.controller || p.peerId !== unit.peerId)
				return false
			if (initialized && (unit.id !== state.id || (!unit.alive && state.alive))) return false
			if (
				!validVector(state.position) ||
				!validVector(state.aim) ||
				!validVector(state.velocity) ||
				!validVector(state.dashDirection) ||
				!finite(state.yaw)
			)
				return false
			if (
				typeof state.alive !== 'boolean' ||
				typeof state.grounded !== 'boolean' ||
				!finite(state.dashTime, 60) ||
				state.dashTime < 0 ||
				!finite(state.dashCooldown, 60) ||
				state.dashCooldown < 0
			)
				return false
			if (state.dashing !== state.dashTime > 0 || state.dashReady !== (state.dashCooldown === 0))
				return false
			if (!finite(state.windup, 1) || state.windup < 0 || !['bow', 'bowl'].includes(state.weapon))
				return false
			if (state.heldArrow !== null) {
				if (!state.alive || !numericId(state.heldArrow) || held.has(state.heldArrow)) return false
				held.add(state.heldArrow)
			}
			seenParticipants.add(unit.participantId)
			seenUnits.set(state.id, state)
		}
		const seenArrows = new Set()
		for (const arrow of snapshot.arrows) {
			if (!arrow || !numericId(arrow.id) || seenArrows.has(arrow.id)) return false
			if (
				!['held', 'flying', 'grounded'].includes(arrow.state) ||
				!['arrow', 'bowl'].includes(arrow.kind) ||
				typeof arrow.perfect !== 'boolean'
			)
				return false
			if (arrow.state !== 'flying' && arrow.kind !== 'arrow') return false
			if (
				!validVector(arrow.position) ||
				!validQuaternion(arrow.quaternion) ||
				!validVector(arrow.velocity)
			)
				return false
			if (![null, 'A', 'B'].includes(arrow.ownerTeam)) return false
			if (arrow.source !== null) {
				const source = seenUnits.get(arrow.source?.id)
				if (
					!source ||
					arrow.source.team !== source.participant.team ||
					arrow.ownerTeam !== arrow.source.team ||
					arrow.source.isHuman !== (source.participant.controller === 'human')
				)
					return false
			} else if (arrow.ownerTeam !== null || arrow.state === 'flying') return false
			if ((arrow.state === 'held') !== held.has(arrow.id)) return false
			seenArrows.add(arrow.id)
		}
		for (const id of held) if (!seenArrows.has(id)) return false
		// A round's scarce pool can grow (infinite-ammo fixtures) but never loses ids.
		for (const arrow of arrows) if (!seenArrows.has(arrow.id)) return false
		return true
	}

	function push(snapshot, nowSeconds) {
		if (
			disposed ||
			!Number.isFinite(nowSeconds) ||
			(history.length && nowSeconds < history.at(-1).time)
		)
			return false
		let copy
		try {
			copy = structuredClone(snapshot)
		} catch {
			return false
		}
		if (!valid(copy)) return false
		// No scene/entity mutations above this point: invalid packets are atomic no-ops.
		for (const state of copy.arrows) {
			let arrow = byArrow.get(state.id)
			if (!arrow) {
				arrow = createArrow(ctx.scene, null, null, { replica: true, id: state.id })
				byArrow.set(state.id, arrow)
				arrows.push(arrow)
			}
			arrow.applyReplicaState(state)
		}
		for (const state of copy.units) {
			const unit = byParticipant.get(state.participant.id)
			unit.id = state.id
			if (!initialized || !state.alive) {
				unit.place(state.position.x, state.position.y, state.position.z)
				unit.mesh.rotation.y = state.yaw
			}
			if (!initialized || unit !== localPlayer) unit.aim.copy(state.aim)
			unit.applyReplicaState(state)
			unit.heldArrow = byArrow.get(state.heldArrow) ?? null
		}
		const frame = {
			time: nowSeconds,
			units: new Map(copy.units.map((unit) => [unit.id, unit])),
			arrows: new Map(copy.arrows.map((arrow) => [arrow.id, arrow])),
		}
		if (history.at(-1)?.time === nowSeconds) history.pop()
		history.push(frame)
		if (history.length > MAX_SNAPSHOTS) history.shift()
		initialized = true
		return true
	}

	function lateUpdate(nowSeconds) {
		if (disposed || !history.length || !Number.isFinite(nowSeconds)) return
		const renderTime = nowSeconds - DELAY
		let before = history[0],
			after = history.at(-1)
		for (const frame of history) {
			if (frame.time <= renderTime) before = frame
			if (frame.time >= renderTime) {
				after = frame
				break
			}
		}
		const blend =
			before.time === after.time
				? 1
				: THREE.MathUtils.clamp((renderTime - before.time) / (after.time - before.time), 0, 1)
		const latest = history.at(-1)
		for (const unit of units) {
			if (!unit.alive) continue // death presentation owns its detached visual
			const a = before.units.get(unit.id),
				b = after.units.get(unit.id)
			unit.mesh.position.copy(a.position).lerp(b.position, blend)
			const angle = b.yaw - a.yaw
			unit.mesh.rotation.y = a.yaw + Math.atan2(Math.sin(angle), Math.cos(angle)) * blend
			if (unit !== localPlayer) {
				aim.copy(a.aim).lerp(b.aim, blend)
				unit.aim.copy(aim.lengthSq() > 1e-6 ? aim.normalize() : b.aim)
			}
		}
		for (const arrow of arrows) {
			const state = latest.arrows.get(arrow.id)
			const a = before.arrows.get(arrow.id),
				b = after.arrows.get(arrow.id)
			// State changes snap: a newly grounded bowl must not remain visibly flying.
			const continuous =
				a &&
				b &&
				[a, b].every(
					(sample) =>
						sample.state === state.state &&
						sample.kind === state.kind &&
						sample.source?.id === state.source?.id,
				)
			if (continuous) {
				position.copy(a.position).lerp(b.position, blend)
				quaternion.copy(a.quaternion).slerp(targetQuaternion.copy(b.quaternion), blend)
				arrow.setReplicaPose(position, quaternion)
			} else arrow.setReplicaPose(state.position, state.quaternion)
		}
		for (const unit of units) {
			if (unit.alive && unit.heldArrow) unit.heldArrow.setHeldPose(unit.handPosition(), unit.aim)
		}
	}

	function dispose() {
		if (disposed) return
		disposed = true
		for (const unit of units) unit.dispose()
		for (const arrow of arrows) arrow.dispose()
		units.length = 0
		arrows.length = 0
		byParticipant.clear()
		byArrow.clear()
		history.length = 0
	}

	return {
		units,
		arrows,
		brains: [],
		roster: participants,
		localPlayer,
		human: localPlayer,
		localParticipantId,
		push,
		lateUpdate,
		dispose,
	}
}
