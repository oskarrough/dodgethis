import { afterEach, beforeEach, expect, test } from 'bun:test'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { buildCourt } from '../src/court.js'
import { createRound } from '../src/round.js'
import { createPlayer } from '../src/player.js'
import { spawnPoint } from '../src/arena.js'
import { tune } from '../src/tune.js'

await RAPIER.init({})
const STILL = { x: 0, z: 0 }
const human = (id, team) => ({ id, team, controller: 'human', peerId: `peer-${id}` })
const bot = (id, team) => ({ id, team, controller: 'bot' })
let ctx, round, previous
beforeEach(() => {
	previous = { ai: tune.ai.enabled, ...tune.cheats }
	tune.ai.enabled = true
	tune.cheats.godmode = false
	tune.cheats.infiniteAmmo = false
	const scene = new THREE.Scene()
	const world = new RAPIER.World({ x: 0, y: tune.physics.gravity, z: 0 })
	world.timestep = 1 / 60
	buildCourt(scene, world, RAPIER)
	const events = []
	ctx = {
		scene,
		world,
		RAPIER,
		eventQueue: new RAPIER.EventQueue(true),
		combat: { push() {} },
		present: (event) => events.push(event),
		events,
	}
})
afterEach(() => {
	round?.dispose()
	round = undefined
	ctx.eventQueue.free()
	ctx.world.free()
	tune.ai.enabled = previous.ai
	tune.cheats.godmode = previous.godmode
	tune.cheats.infiniteAmmo = previous.infiniteAmmo
})
function make(roster, localParticipantId = 'a', options = {}) {
	round = createRound(ctx, { roster, localParticipantId, seed: 42, ...options })
	return round
}
function ticks(count, move = STILL, remoteMoves) {
	for (let i = 0; i < count; i++) {
		round.step(1 / 60, move, remoteMoves)
		round.lateUpdate()
	}
}

test('solo defaults preserve unit order, spawn slots, and the initial arrow pool', () => {
	round = createRound(ctx, { seed: 42 })
	expect(round.units.map((u) => u.team)).toEqual(['A', 'B', 'B', 'B'])
	expect(round.localParticipantId).toBe('local')
	expect(round.human).toBe(round.localPlayer)
	expect(round.brains).toHaveLength(3)
	expect(round.arrows).toHaveLength(7)
	expect(round.human.heldArrow).toBe(round.arrows[0])
	expect(round.arrows.slice(1).every((a) => a.state === 'grounded')).toBe(true)
	round.dispose()
	round = createRound(ctx, { enemies: 2, allies: 2 })
	expect(round.units.map((u) => u.team)).toEqual(['A', 'B', 'B', 'A', 'A'])
	for (const team of ['A', 'B']) {
		const teamUnits = round.units.filter((u) => u.team === team)
		teamUnits.forEach((u, index) => {
			const [x, , z] = spawnPoint(team, index, teamUnits.length)
			expect(u.position.x).toBe(x)
			expect(u.position.z).toBe(z)
		})
	}
})

test('two humans have no brains, remain neutral, and both advance gravity each tick', () => {
	make([human('a', 'A'), human('b', 'B')])
	expect(round.brains).toHaveLength(0)
	for (const u of round.units) u.place(u.position.x, 3, u.position.z)
	const before = round.units.map((u) => ({ ...u.body.translation() }))
	ticks(30)
	for (let i = 0; i < 2; i++) {
		const u = round.units[i]
		expect(u.controller).toBe('human')
		expect(u.isHuman).toBe(true)
		expect(u.characterController.computeColliderMovement).toBeFunction()
		expect(u.position.x).toBeCloseTo(before[i].x, 5)
		expect(u.position.z).toBeCloseTo(before[i].z, 5)
		expect(u.position.y).toBeLessThan(before[i].y)
		expect(u.heldArrow).toBe(round.arrows[i])
	}
	expect(ctx.events.map((event) => event.type)).toEqual(['land', 'land'])
})

test('mixed roster: only bots get brains and move, remote human defaults to neutral', () => {
	make([bot('ally', 'A'), human('a', 'A'), human('b', 'B'), bot('enemy', 'B')])
	expect(round.brains.map((b) => b.unit.participantId)).toEqual(['ally', 'enemy'])
	const before = round.units.map((u) => u.position.clone())
	ticks(20)
	for (const index of [0, 3]) {
		const u = round.units[index]
		expect(
			Math.hypot(u.position.x - before[index].x, u.position.z - before[index].z),
		).toBeGreaterThan(0.1)
	}
	for (const index of [1, 2]) {
		expect(round.units[index].position.x).toBeCloseTo(before[index].x, 5)
		expect(round.units[index].position.z).toBeCloseTo(before[index].z, 5)
	}
})

test('local identity may be on B and movement maps address participant ids, not peers or unit ids', () => {
	make([human('a', 'A'), human('b', 'B')], 'b')
	const [remote, local] = round.units
	expect(round.human).toBe(local)
	expect(round.localPlayer).toBe(local)
	expect(local.team).toBe('B')
	expect(local.peerId).toBe('peer-b')
	ticks(
		15,
		{ x: 1, z: 0 },
		new Map([
			['a', { x: -1, z: 0 }],
			['b', STILL],
		]),
	)
	expect(local.position.x).toBeGreaterThan(0.2)
	expect(remote.position.x).toBeLessThan(-0.2)
	// Missing input applies friction, rather than retaining the last move command.
	ticks(60)
	expect(Math.abs(remote.velocity.x)).toBeLessThan(0.001)
	expect(Math.abs(local.velocity.x)).toBeLessThan(0.001)
})

test('local convenience actions target B, not the first human in the roster', () => {
	make([human('a', 'A'), human('b', 'B')], 'b')
	const [remote, local] = round.units
	const shot = local.heldArrow
	round.looseHuman({ x: 0, z: 1 }, 15)
	expect(local.heldArrow).toBeNull()
	expect(remote.heldArrow).toBe(round.arrows[0])
	expect(shot.snapshotImpact().source).toEqual({ id: local.id, team: 'B', isHuman: true })
	expect(round.dashHuman({ x: 1, z: 0 })).toBe(true)
	expect(local.dashing).toBe(true)
	expect(remote.dashing).toBe(false)
})

test('a remote teammate continues playing after the local human is eliminated', () => {
	make([human('a', 'A'), human('b', 'A'), bot('enemy', 'B')])
	tune.ai.enabled = false
	round.localPlayer.eliminate()
	const remote = round.units[1]
	const before = remote.position.z
	ticks(15, STILL, new Map([['b', { x: 0, z: -1 }]]))
	expect(remote.position.z).toBeLessThan(before - 0.2)
	expect(round.over).toBe(false)
	remote.eliminate()
	ticks(1)
	expect(round.winner).toBe('B')
})

test('remote callback is keyed by participant id and undefined means neutral', () => {
	make([human('a', 'A'), human('b', 'B')])
	const ids = []
	ticks(15, STILL, (id) => {
		ids.push(id)
		return { x: 1, z: 0 }
	})
	expect(ids).toEqual(Array(15).fill('b'))
	expect(round.units[1].position.x).toBeGreaterThan(0.2)
	ticks(60, STILL, () => undefined)
	expect(Math.abs(round.units[1].velocity.x)).toBeLessThan(0.001)
})

test('initial allocation and participant identity are independent of local player and fresh unit ids', () => {
	const roster = [bot('bot', 'A'), human('a', 'A'), human('b', 'B')]
	make(roster, 'a', { arrowCount: 1 })
	const ids = round.units.map((u) => u.id)
	const snapshot = round.roster
	expect(round.units[1].heldArrow).toBe(round.arrows[0])
	round.dispose()
	make(roster, 'b', { arrowCount: 1 })
	expect(round.roster).toEqual(snapshot)
	expect(round.units.map((u) => u.id)).not.toEqual(ids)
	expect(round.units[1].heldArrow).toBe(round.arrows[0])
	expect(round.localPlayer.heldArrow).toBeNull()
	roster[1].team = 'B'
	expect(round.units[1].participant.team).toBe('A')
	expect(Object.isFrozen(round.roster[1])).toBe(true)
})

test('shared release/dash and fixed-tick auto-pickup work identically for both humans', () => {
	make([human('a', 'A'), human('b', 'B')])
	const held = round.units.map((u) => u.heldArrow)
	for (const u of round.units) {
		round.looseArrow(u, { x: 1, z: 0 }, 15, { kind: 'bowl' })
		expect(u.heldArrow).toBeNull()
	}
	for (let i = 0; i < 2; i++) {
		expect(held[i].snapshotImpact().source).toEqual({
			id: round.units[i].id,
			team: round.units[i].team,
			isHuman: true,
		})
		held[i].ground()
	}
	round.lateUpdate()
	expect(round.units.every((u) => u.heldArrow === null)).toBe(true)
	ticks(2)
	for (let i = 0; i < 2; i++) expect(round.units[i].heldArrow).toBe(held[i])
	expect(ctx.events.filter((e) => e.type === 'pickup')).toHaveLength(2)
	for (const u of round.units) {
		expect(round.dashUnit(u, { x: 1, z: 0 })).toBe(true)
		expect(round.dashUnit(u, { x: 1, z: 0 })).toBe(false)
	}
	ticks(30)
	for (const u of round.units) expect(u.dashing).toBe(false)
})

test('infinite ammo and void rescue apply to remote humans too, on their own team', () => {
	make([human('a', 'A'), human('b', 'B')], 'a', { arrowCount: 1 })
	tune.cheats.infiniteAmmo = true
	tune.cheats.godmode = true
	round.units[1].place(0, -20, 0)
	ticks(1)
	expect(round.arrows).toHaveLength(2)
	expect(round.units.every((u) => !!u.heldArrow)).toBe(true)
	expect(round.units[1].alive).toBe(true)
	expect(round.units[1].position.z).toBe(spawnPoint('B')[2])
})

test('live bot editing updates roster and brains without removing either human or reusing ids', () => {
	make([human('a', 'A'), human('b', 'B'), bot('bot-added-1', 'B')])
	const added = round.addUnit('B')
	expect(added.participantId).toBe('bot-added-2')
	expect(round.roster.at(-1)).toEqual(added.participant)
	expect(round.brains.at(-1).unit).toBe(added)
	round.removeUnit('B')
	round.removeUnit('B')
	round.removeUnit('B')
	expect(round.units).toHaveLength(2)
	expect(round.brains).toHaveLength(0)
	expect(round.over).toBe(false)
	expect(round.addUnit('B').participantId).toBe('bot-added-3')
})

test.each([
	['empty', []],
	['not an array', {}],
	['sparse array', [human('a', 'A')].concat(Array(1))],
	['null participant', [human('a', 'A'), null]],
	['duplicate id', [human('a', 'A'), bot('a', 'B')]],
	['empty id', [human('a', 'A'), bot(' ', 'B')]],
	['invalid team', [human('a', 'A'), bot('b', 'C')]],
	['invalid controller', [human('a', 'A'), { id: 'b', team: 'B', controller: 'remote' }]],
	['missing human owner', [{ id: 'a', team: 'A', controller: 'human' }]],
	['invalid human owner', [{ ...human('a', 'A'), peerId: 5 }]],
	['empty human owner', [{ ...human('a', 'A'), peerId: ' ' }]],
	['duplicate owner', [human('a', 'A'), { ...human('b', 'B'), peerId: 'peer-a' }]],
	['bot owner', [human('a', 'A'), { ...bot('b', 'B'), peerId: 'peer-b' }]],
])('rejects %s before any physics or scene allocation', (_name, roster) => {
	const bodies = ctx.world.bodies.len()
	const colliders = ctx.world.colliders.len()
	const children = ctx.scene.children.length
	expect(() => createRound(ctx, { roster, localParticipantId: 'a' })).toThrow()
	expect(ctx.world.bodies.len()).toBe(bodies)
	expect(ctx.world.colliders.len()).toBe(colliders)
	expect(ctx.scene.children).toHaveLength(children)
})

test.each([undefined, 'missing', 'bot'])(
	'rejects invalid local identity %s before allocation',
	(id) => {
		const bodies = ctx.world.bodies.len()
		expect(() =>
			createRound(ctx, { roster: [human('a', 'A'), bot('bot', 'B')], localParticipantId: id }),
		).toThrow('localParticipantId')
		expect(ctx.world.bodies.len()).toBe(bodies)
	},
)

test('standalone player validates participant before allocating physics objects', () => {
	const bodies = ctx.world.bodies.len()
	expect(() =>
		createPlayer(ctx.scene, ctx.world, RAPIER, {
			participant: { ...human('a', 'A'), team: 'C' },
		}),
	).toThrow()
	expect(ctx.world.bodies.len()).toBe(bodies)
})
