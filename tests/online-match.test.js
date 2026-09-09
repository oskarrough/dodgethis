import { test, expect, afterEach } from 'bun:test'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { buildCourt } from '../src/court.js'
import { createOnlineMatch, validInput } from '../src/online-match.js'
import { tune } from '../src/tune.js'
await RAPIER.init({})
const cleanup = []
afterEach(() => {
	for (const fn of cleanup.splice(0).reverse()) fn()
})
const roster = [
	{ id: 'host', peerId: 'host', team: 'A', controller: 'human' },
	{ id: 'guest', peerId: 'guest', team: 'B', controller: 'human' },
]
function fixture(host = true, participants = roster) {
	const scene = new THREE.Scene(),
		world = new RAPIER.World({ x: 0, y: tune.physics.gravity, z: 0 }),
		queue = new RAPIER.EventQueue(true)
	world.timestep = 1 / 60
	buildCourt(scene, world, RAPIER)
	const packets = [],
		events = []
	let time = 0,
		card
	const net = {
		isHost: host,
		id: host ? 'host' : 'guest',
		hostId: 'host',
		send(t, d) {
			packets.push([t, structuredClone(d)])
		},
	}
	const flow = createOnlineMatch({
		ctx: {
			scene,
			world,
			RAPIER,
			eventQueue: queue,
			combat: { push() {} },
			present: (e) => events.push(e),
		},
		net,
		roster: participants,
		matchId: 'match-1',
		overlay: {
			show(c) {
				card = c
			},
			hide() {
				card = null
			},
		},
		clearActions() {},
		resetPresentation() {},
		now: () => time,
	})
	cleanup.push(() => {
		flow.dispose()
		queue.free()
		world.free()
	})
	let sequence = 0
	const input = (overrides = {}) => ({
		matchId: 'match-1',
		roundId: flow.roundId,
		seq: ++sequence,
		move: { x: 0, z: 0 },
		target: { x: 0, z: 8 },
		weapon: 'bow',
		down: false,
		action: null,
		...overrides,
	})
	return {
		flow,
		world,
		packets,
		events,
		input,
		net,
		get card() {
			return card
		},
		tick(n = 1) {
			for (let i = 0; i < n; i++) {
				time += 1 / 60
				flow.step(1 / 60)
				flow.update(1 / 60)
			}
		},
		advance(s) {
			time += s
		},
	}
}
test('wire input rejects malformed movement, weapon, sequence and stale match/round', () => {
	const base = {
		matchId: 'm',
		roundId: 1,
		seq: 1,
		move: { x: 0, z: 0 },
		target: { x: 0, z: 0 },
		weapon: 'bow',
		down: false,
		action: null,
	}
	expect(validInput(base, 'm', 1)).toBe(true)
	for (const change of [
		{ move: { x: NaN, z: 0 } },
		{ move: { x: 2, z: 0 } },
		{ target: { x: Infinity, z: 0 } },
		{ weapon: 'laser' },
		{ seq: -1 },
		{ seq: 1.2 },
		{ roundId: 0 },
		{ matchId: 'old' },
		{ down: 1 },
		{ action: 'score' },
	])
		expect(validInput({ ...base, ...change }, 'm', 1)).toBe(false)
})
test('host maps input only to authenticated sender, releases stale movement, ignores guest scores', () => {
	const f = fixture(),
		local = f.flow.round.localPlayer,
		remote = f.flow.round.units[1]
	const localX = local.position.x,
		remoteX = remote.position.x
	const packet = f.input({ participantId: 'host', move: { x: 1, z: 0 } })
	expect(f.flow.receive('input', packet, 'guest')).toBe(true)
	expect(f.flow.receive('input', packet, 'guest')).toBe(false)
	expect(f.flow.receive('input', f.input(), 'stranger')).toBe(false)
	expect(f.flow.receive('snapshot', { wins: { B: 2 } }, 'guest')).toBe(false)
	f.tick(12)
	expect(remote.position.x).toBeGreaterThan(remoteX + 0.1)
	expect(local.position.x).toBeCloseTo(localX, 3)
	f.advance(1)
	f.tick(90)
	expect(Math.abs(remote.velocity.x)).toBeLessThan(0.01)
	expect(f.flow.match.wins).toEqual({ A: 0, B: 0 })
})
test('host calculates bow charge and projectile ownership, stale release cannot shoot next round', () => {
	const f = fixture(),
		remote = f.flow.round.units[1]
	f.flow.receive(
		'input',
		f.input({ action: 'press', down: true, speed: 9999, perfect: true }),
		'guest',
	)
	f.tick(10)
	f.flow.receive('input', f.input({ action: 'release', speed: 9999, perfect: true }), 'guest')
	f.tick()
	const shot = f.events.find((e) => e.type === 'shot')
	expect(shot.source.id).toBe(remote.id)
	expect(shot.source.team).toBe('B')
	expect(shot.perfect).toBe(false)
	const arrow = f.flow.round.arrows.find((a) => a.id === shot.arrowId)
	expect(arrow.ownerTeam).toBe('B')
	expect(arrow.velocity.length()).toBeLessThan(100)
	expect(remote.heldArrow?.id).not.toBe(shot.arrowId)
})
test('stale held bow cancels without firing; input queue is bounded', () => {
	const f = fixture()
	f.flow.receive('input', f.input({ action: 'press', down: true }), 'guest')
	f.tick(5)
	f.advance(1)
	f.tick()
	f.flow.receive('input', f.input({ action: 'release' }), 'guest')
	f.tick()
	expect(f.events.filter((e) => e.type === 'shot')).toHaveLength(0)
	let accepted = 0
	for (let i = 0; i < 200; i++)
		accepted += Number(f.flow.receive('input', f.input({ action: 'dash' }), 'guest'))
	expect(accepted).toBeLessThanOrEqual(32)
})
test('host outcomes replicate exactly, stale snapshots/events ignored and next round has fresh ids', () => {
	const host = fixture(),
		guest = fixture(false)
	host.flow.broadcast()
	const first = host.packets.at(-1)[1]
	expect(guest.flow.receive('snapshot', first, 'stranger')).toBe(false)
	expect(guest.flow.receive('snapshot', first, 'host')).toBe(true)
	expect(guest.flow.round.brains).toHaveLength(0)
	expect(guest.flow.round.localPlayer.participantId).toBe('guest')
	host.flow.round.units[1].place(0, -20, -8)
	host.tick(100)
	host.flow.broadcast()
	const ended = host.packets.at(-1)[1]
	expect(guest.flow.receive('snapshot', ended, 'host')).toBe(true)
	expect(guest.flow.match.wins).toEqual({ A: 1, B: 0 })
	expect(guest.flow.phase).toBe('roundOver')
	expect(guest.card.title).toBe('ROUND LOST')
	const eventCount = guest.events.length
	expect(guest.flow.receive('snapshot', ended, 'host')).toBe(false)
	expect(guest.events).toHaveLength(eventCount)
	host.card.actions.find((a) => a.label === 'Next round').onSelect()
	host.flow.broadcast()
	const next = host.packets.at(-1)[1]
	expect(guest.flow.receive('snapshot', next, 'host')).toBe(true)
	expect(guest.flow.roundId).toBe(2)
	expect(guest.flow.receive('snapshot', ended, 'host')).toBe(false)
	expect(
		host.flow.receive('input', { ...host.input(), roundId: 1, action: 'release' }, 'guest'),
	).toBe(false)
	host.flow.round.units[1].place(0, -20, -8)
	host.tick(100)
	host.flow.broadcast()
	guest.flow.receive('snapshot', host.packets.at(-1)[1], 'host')
	expect(guest.flow.phase).toBe('matchOver')
	expect(guest.flow.match.wins).toEqual(host.flow.match.wins)
	expect(guest.card.title).toBe('YOU LOSE')
	expect(
		guest.flow.receive(
			'snapshot',
			{ ...host.packets.at(-1)[1], seq: 99999, events: [null] },
			'host',
		),
	).toBe(false)
})

test('gameplay event ids deduplicate even when repeated in a newer snapshot', () => {
	const host = fixture(),
		guest = fixture(false)
	host.flow.receive('input', host.input({ weapon: 'bowl', action: 'press' }), 'guest')
	host.tick()
	host.flow.broadcast()
	const packet = host.packets.at(-1)[1]
	expect(packet.events.some((x) => x.event.type === 'shot')).toBe(true)
	expect(guest.flow.receive('snapshot', packet, 'host')).toBe(true)
	const count = guest.events.length
	expect(count).toBeGreaterThan(0)
	expect(guest.flow.receive('snapshot', { ...packet, seq: packet.seq + 1 }, 'host')).toBe(true)
	expect(guest.events).toHaveLength(count)
	expect(
		guest.flow.receive('snapshot', { ...packet, seq: packet.seq + 2, matchId: 'old' }, 'host'),
	).toBe(false)
})

test('remote jump runs on the host and landing snapshots reach the guest', () => {
	const host = fixture()
	const guest = fixture(false)
	host.tick(30)
	const remote = host.flow.round.units[1]
	const before = remote.position.y
	expect(host.flow.receive('input', host.input({ action: 'jump' }), 'guest')).toBe(true)
	host.tick(5)
	expect(remote.position.y).toBeGreaterThan(before)
	host.tick(90)
	const landingPacket = host.packets.find(
		([type, packet]) =>
			type === 'snapshot' &&
			packet.events.some(({ event }) => event.type === 'land' && event.source.id === remote.id),
	)
	expect(landingPacket).toBeDefined()
	expect(guest.flow.receive('snapshot', landingPacket[1], 'host')).toBe(true)
	expect(guest.events.some((event) => event.type === 'land')).toBe(true)
})
