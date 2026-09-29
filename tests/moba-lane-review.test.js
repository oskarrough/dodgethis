import { afterEach, beforeEach, expect, test } from 'bun:test'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { STEP } from '../src/core/app.js'
import { createIntents, neutralFrame } from '../src/core/intents.js'
import { createPathPlanner, pursue } from '../src/plugins/moba/path.js'
import { createSim } from '../src/plugins/moba/sim.js'
import { createFeedback } from '../src/plugins/moba/feedback.js'
import { createView } from '../src/plugins/moba/view.js'
import { buildMap } from '../src/plugins/moba/map.js'
import { validFact } from '../src/plugins/moba/index.js'
import { walkable, segmentClear, PILLARS } from '../src/plugins/moba/obstacles.js'
import { stepShot } from '../src/plugins/moba/skillshot.js'
import { tune } from '../src/plugins/moba/tune.js'

await RAPIER.init({})
const options = { radius: tune.hero.radius, ...tune.orders }
let scene, world, intents, sim, facts, unbuild
beforeEach(() => {
	scene = new THREE.Scene()
	world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
	world.timestep = STEP
	intents = createIntents()
	intents.use('pointClick')
	facts = []
})
afterEach(() => {
	sim?.dispose()
	sim = null
	unbuild?.()
	unbuild = null
	world.free()
})
function start(heroes = [{ id: 'local', team: 'A' }]) {
	unbuild = buildMap(scene, world, RAPIER)
	sim = createSim({
		scene,
		world,
		RAPIER,
		intents,
		heroes,
		present: (fact) => facts.push(fact),
		rng: () => 0.5,
	})
	for (const d of sim.dummies) d.sparring = false
	return sim.heroes[0]
}
function feed(frame) {
	intents.feed('local', { ...neutralFrame(), ...frame })
}
function step(n = 1) {
	for (let i = 0; i < n; i++) {
		sim.step()
		intents.age(STEP)
	}
}

test('cached plans fit the fixed-step budget for hedge detours and cross-map throat routes', () => {
	const plan = createPathPlanner(options)
	const routes = [
		[
			{ x: -48, z: 0 },
			{ x: 48, z: 7 },
		],
		[
			{ x: 18, z: 4 },
			{ x: 18, z: 10 },
		],
	]
	// Warm the JIT; grid construction belongs to mode start, not the order budget.
	for (let i = 0; i < 10; i++) for (const [from, to] of routes) plan(from, to)
	const elapsed = []
	for (let i = 0; i < 30; i++)
		for (const [from, to] of routes) {
			const before = process.cpuUsage()
			const path = plan(from, to)
			const used = process.cpuUsage(before)
			elapsed.push((used.user + used.system) / 1000)
			expect(path.length).toBeGreaterThan(1)
		}
	elapsed.sort((a, b) => a - b)
	// Repeated median CPU time is insensitive to scheduling delays from parallel builds.
	expect(elapsed[Math.floor(elapsed.length / 2)]).toBeLessThan((STEP * 1000) / 2)
})

test('shortcuts preserve live clearance, with a radius-only first leg out of a tight start', () => {
	const plan = createPathPlanner(options)
	const from = { x: 18, z: 4 },
		to = { x: 18, z: 10 }
	for (const clearance of [0.1, 0.4]) {
		let at = from
		for (const point of plan(from, to, { ...options, clearance })) {
			expect(segmentClear(at, point, options.radius + clearance)).toBe(true)
			at = point
		}
		expect(at).toEqual(to)
	}
	const tight = { x: 18, z: 6 - options.radius - 0.01 }
	expect(walkable(tight.x, tight.z, options.radius)).toBe(true)
	expect(walkable(tight.x, tight.z, options.radius, options.clearance)).toBe(false)
	const path = plan(tight, to)
	expect(path.length).toBeGreaterThan(1)
	expect(segmentClear(tight, path[0], options.radius)).toBe(true)
	let at = path[0]
	for (const point of path.slice(1)) {
		expect(segmentClear(at, point, options.radius + options.clearance)).toBe(true)
		at = point
	}
	expect(at).toEqual(to)
})

test('blocked Q emits its impact point, its own once-per-tick sound and ink burst, without an expiry fizzle', () => {
	const h = start()
	h.body.place(18, 1.05, 4)
	feed({ pressed: [{ action: 'slot1', at: { x: 18, z: 10 } }] })
	step(40)
	const blocked = facts.filter((fact) => fact.type === 'blocked')
	expect(blocked).toHaveLength(1)
	const fact = blocked[0]
	expect(fact).toMatchObject({ source: 'local', slot: 'slot1' })
	expect(fact.point.z).toBeCloseTo(6 - tune.loose.radius)
	expect(validFact(fact)).toBe(true)
	expect(sim.shots).toHaveLength(0)
	const documentBefore = globalThis.document
	globalThis.document = { querySelector: () => null }
	const view = createView(scene, () => () => {})
	const bursts = [],
		cues = []
	try {
		view.bolt(
			{
				id: fact.projectile,
				x: fact.point.x,
				z: fact.point.z,
				dx: 0,
				dz: 1,
				slot: 'slot1',
				team: 'A',
			},
			fact.point,
		)
		const feedback = createFeedback({
			juice: { burst: (...args) => bursts.push(args) },
			sfx: { blocked: (...args) => cues.push(args) },
			view,
			sim,
			local: 'local',
		})
		feedback.present(fact)
		feedback.present({ ...fact, projectile: -1 })
		expect(cues).toHaveLength(1)
		expect(cues[0][0]).toEqual(fact.point)
		expect(bursts).toHaveLength(2)
		expect(bursts[0][2]).toEqual(tune.juice.blocked)
		const gone = view.update(0, { live: new Set(), hero: h.body.mesh.position, locate: () => null })
		expect(gone).toEqual([])
		feedback.fizzle(gone)
		expect(bursts).toHaveLength(2)
	} finally {
		view.dispose()
		if (documentBefore === undefined) delete globalThis.document
		else globalThis.document = documentBefore
	}
})

test('repeated move and attack clicks emit facts while reusing plans; stick displacement permits a new plan', () => {
	const h = start()
	h.body.place(0, 1.05, 4)
	const goal = { x: 0, z: -4 }
	feed({ order: goal })
	step()
	const path = h.order.path
	feed({ order: goal })
	step()
	expect(h.order.path).toBe(path)
	expect(facts.filter((fact) => fact.type === 'order')).toHaveLength(2)
	expect(facts.at(-1)).toMatchObject({ type: 'order', repeat: true })
	feed({ move: { x: 1, z: 0 } })
	step(15)
	expect(h.order).toBeNull()
	feed({ order: goal })
	step()
	expect(h.order.path).not.toBe(path)
	expect(h.order.path.points[0].x).toBeGreaterThan(0.3)
	// A moving body can also be pushed off a live path by another body.
	const rejoined = h.order.path
	h.body.place(h.body.position.x + 1, h.body.position.y, h.body.position.z)
	feed({ order: goal })
	step()
	expect(h.order.path).not.toBe(rejoined)
	const d = sim.dummies[0]
	d.body.place(18, 1.05, 9)
	h.body.place(18, 1.05, 4)
	feed({ order: { x: 18, z: 9 } })
	step()
	const attack = h.order,
		attackPath = attack.path
	feed({ order: { x: d.body.position.x, z: d.body.position.z } })
	step()
	expect(h.order).toBe(attack)
	expect(h.order.path).toBe(attackPath)
	expect(facts.at(-1)).toMatchObject({ type: 'order', kind: 'attack', repeat: true })
})

test('look-ahead pursuit advances around a corner without reaching its vertex exactly', () => {
	const path = {
		points: [
			{ x: 18, z: 5.25 },
			{ x: 25.25, z: 5.25 },
			{ x: 24.25, z: 9.75 },
		],
		leg: 0,
	}
	const next = pursue(path, { x: 25.1, z: 5.95 }, tune.orders.carrot)
	expect(path.leg).toBe(1)
	expect(next.carrot.z).toBeGreaterThan(5.95)
})

test('a homing basic cannot be dodged behind released-shot cover, but a Q still stops there', () => {
	for (const target of [null, 'enemy']) {
		const p = PILLARS[0]
		const shot = {
			x: p.x - 4,
			z: p.z,
			dx: 1,
			dz: 0,
			speed: 100,
			radius: 0.12,
			range: 20,
			travelled: 0,
			passed: [],
			target,
			slot: target ? 'primary' : 'slot1',
		}
		const result = stepShot(
			shot,
			0.1,
			[{ id: 'enemy', x: p.x + 4, z: p.z, radius: 0.45 }],
			-Infinity,
		)
		if (target) expect(result.hit.id).toBe('enemy')
		else expect(result.blocked).toBe(true)
	}
})

test('road, plaza, centreline, kerbs and seams have explicit separated print heights', () => {
	start()
	const map = scene.getObjectByName('moba-map')
	for (const name of ['moba-centreline', 'moba-kerbs--1', 'moba-kerbs-1']) {
		const mesh = map.getObjectByName(name)
		mesh.geometry.computeBoundingBox()
		expect(mesh.position.y).toBe(0)
		expect(mesh.geometry.boundingBox.min.y).toBeCloseTo(tune.map.printLayers.marks)
		expect(mesh.geometry.boundingBox.max.y).toBeCloseTo(tune.map.printLayers.marks)
	}
	expect(tune.map.printLayers.marks).toBeGreaterThan(tune.map.printLayers.plaza)
	expect(tune.map.printLayers.seams).toBeGreaterThan(tune.map.printLayers.marks)
	const plaza = map.children.find(
		(mesh) =>
			mesh.geometry.type === 'CircleGeometry' &&
			mesh.geometry.parameters.radius === tune.map.plazaRadius,
	)
	expect(plaza.position.y).toBe(tune.map.printLayers.plaza)
})

test('six interleaved seats spawn symmetrically by team, clear of the throat walls', () => {
	start(
		['A', 'B', 'A', 'B', 'A', 'B'].map((team, index) => ({
			id: index === 0 ? 'local' : `hero${index}`,
			team,
		})),
	)
	for (const team of ['A', 'B']) {
		const heroes = sim.heroes.filter((h) => h.team === team)
		expect(heroes.map((h) => h.spawn.z)).toEqual([-tune.map.spawnSpacing, 0, tune.map.spawnSpacing])
		for (const h of heroes) {
			expect(h.spawn.x).toBe(team === 'A' ? -tune.map.spawnX : tune.map.spawnX)
			expect(walkable(h.spawn.x, h.spawn.z, tune.hero.radius, tune.orders.clearance)).toBe(true)
		}
	}
})
