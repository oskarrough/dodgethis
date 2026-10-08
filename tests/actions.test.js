import { afterEach, beforeEach, expect, test } from 'bun:test'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { buildCourt } from '../src/plugins/dodgeball/court.js'
import { createRound } from '../src/plugins/dodgeball/round.js'
import { createActions } from '../src/plugins/dodgeball/actions.js'
import { neutralFrame } from '../src/core/intents.js'
import { tune } from '../src/plugins/dodgeball/tune.js'
import { tune as coreTune } from '../src/core/tune.js'

// Dodgeball's actions on a real round: the solo human's frames take the same path as every online seat.
await RAPIER.init({})
const DT = 1 / 60
let world, queue, facts, ai
beforeEach(() => {
	ai = tune.ai.enabled
	tune.ai.enabled = false
	world = new RAPIER.World({ x: 0, y: coreTune.physics.gravity, z: 0 })
	world.timestep = DT
	queue = new RAPIER.EventQueue(true)
	facts = []
})
afterEach(() => {
	tune.ai.enabled = ai
	queue.free()
	world.free()
})
function round(options = {}) {
	const scene = new THREE.Scene()
	buildCourt(scene, world, RAPIER)
	const ctx = { scene, world, RAPIER, eventQueue: queue, combat: { push() {} } }
	return createRound(
		{ ...ctx, present: (f) => facts.push(f) },
		{ enemies: 1, arrowCount: 3, seed: 7, ...options },
	)
}
const frame = (overrides = {}) => ({ ...neutralFrame(), aim: { x: 0, z: -8 }, ...overrides })
const press = (action) => ({ action, at: { x: 0, z: -8 } })
function run(r, actions, f, consumed = []) {
	const id = r.localParticipantId
	const moves = actions.step(r, new Map([[id, f]]), DT, (who, action) => consumed.push(action))
	r.step(DT, moves.get(id))
	return consumed
}
const shots = () => facts.filter((f) => f.type === 'shot')

test('the bow charges while held and fires on release, toward the aim point', () => {
	const r = round()
	const actions = createActions()
	const human = r.localPlayer
	run(r, actions, frame({ held: { primary: true }, pressed: [press('primary')] }))
	for (let i = 0; i < 10; i++) run(r, actions, frame({ held: { primary: true } }))
	expect(actions.seat(human.participantId).meter.charging).toBe(true)
	expect(human.windup).toBeGreaterThan(0)
	expect(human.aim.z).toBeLessThan(-0.9)
	run(r, actions, frame({ released: ['primary'] }))
	expect(shots()).toHaveLength(1)
	expect(shots()[0].direction.z).toBeLessThan(0)
	expect(human.heldArrow).toBeNull()
	expect(human.windup).toBe(0)
	r.dispose()
})

test('a tap inside one step still shoots, because held says the release came last', () => {
	const r = round()
	const actions = createActions()
	run(r, actions, frame({ pressed: [press('primary')], released: ['primary'] }))
	expect(shots()).toHaveLength(1)
	r.dispose()
})

test('slots switch weapons in a match but not in the lobby; the bowl fires on press', () => {
	const lobby = round({ enemies: 0, arrowCount: 0, lobby: true })
	const actions = createActions()
	run(lobby, actions, frame({ pressed: [press('slot2')] }))
	expect(actions.seat('local').weapon).toBe('bow')
	lobby.dispose()
	const r = round()
	run(r, actions, frame({ pressed: [press('slot2')] }))
	expect(actions.seat('local').weapon).toBe('bowl')
	expect(r.localPlayer.weapon).toBe('bowl')
	run(r, actions, frame({ pressed: [press('primary')] }))
	expect(shots().map((s) => s.kind)).toEqual(['bowl'])
	r.dispose()
})

test('a dash is consumed when it fires and left buffered while on cooldown', () => {
	const r = round()
	const actions = createActions()
	expect(run(r, actions, frame({ move: { x: 1, z: 0 }, pressed: [press('dash')] }))).toEqual([
		'dash',
	])
	expect(run(r, actions, frame({ pressed: [press('dash')] }))).toEqual([])
	expect(facts.filter((f) => f.type === 'dash')).toHaveLength(1)
	r.dispose()
})
