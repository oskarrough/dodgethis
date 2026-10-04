import { expect, test } from 'bun:test'
import { bootMoba } from './moba-harness.js'
import { buildMap } from '../src/plugins/moba/map.js'
import { tune } from '../src/plugins/moba/tune.js'
import {
	BOXES,
	FLOOR,
	PILLARS,
	clampWalkable,
	walkable,
	segmentClear,
	sweepObstacles,
	projectMap,
} from '../src/plugins/moba/obstacles.js'
import { createPathPlanner } from '../src/plugins/moba/path.js'
import { stepShot } from '../src/plugins/moba/skillshot.js'
import { edgePip } from '../src/plugins/moba/pips.js'
import { createFollow, clampView } from '../src/plugins/moba/follow.js'

const options = { radius: tune.hero.radius, ...tune.orders }

function shot(x, z, dx, dz, slot = 'slot1') {
	return {
		id: 1,
		owner: 'local',
		team: 'A',
		slot,
		x,
		z,
		dx,
		dz,
		speed: 100,
		radius: 0.3,
		range: 100,
		travelled: 0,
		passed: [],
	}
}

test('layout is 104 × 26, with four hedges, four base walls and six pillars', () => {
	expect(FLOOR).toMatchObject({ id: 'lane', halfX: 52, halfZ: 13 })
	expect(BOXES.filter((b) => b.kind === 'hedge')).toHaveLength(4)
	expect(BOXES.filter((b) => b.kind === 'wall')).toHaveLength(4)
	expect(PILLARS).toHaveLength(6)
	for (const p of [
		{ x: 18, z: 7 },
		{ x: -18, z: -7 },
		{ x: 40, z: 10 },
		{ x: 99, z: -99 },
	]) {
		expect(walkable(p.x, p.z, options.radius)).toBe(false)
		const at = clampWalkable(p, options.radius, options.clearance)
		expect(walkable(at.x, at.z, options.radius, options.clearance)).toBe(true)
	}
	for (const p of [
		{ x: 48, z: 0 },
		{ x: -48, z: 0 },
		{ x: 18, z: 10 },
	])
		expect(walkable(p.x, p.z, options.radius)).toBe(true)
})

test('non-homing shots stop at each hedge before a target beyond it', () => {
	for (const b of BOXES.filter((b) => b.kind === 'hedge'))
		for (const slot of ['slot1', 'primary']) {
			const s = shot(b.x, b.z - b.halfZ - 2, 0, 1, slot)
			const r = stepShot(s, 0.1, [{ id: 'enemy', x: b.x, z: b.z + 3, radius: 0.45 }], 0.8)
			expect(r).toMatchObject({ hit: null, blocked: true, expired: true, nearMisses: [] })
			expect(s.z).toBeCloseTo(b.z - b.halfZ - s.radius)
		}
	const edge = shot(50, 0, 1, 0)
	expect(stepShot(edge, 0.1, [], 0.8).blocked).toBe(true)
	expect(edge.x).toBeCloseTo(FLOOR.halfX - edge.radius)
	const s = shot(18, 3, 0, 1)
	expect(stepShot(s, 0.1, [{ id: 'near', x: 18, z: 4, radius: 0.45 }], 0.8).hit.id).toBe('near')
})

test('rounded box corners and pillars use swept discs, including tangencies and a zero-length shot', () => {
	const box = [{ x: 0, z: 0, halfX: 1, halfZ: 1 }]
	expect(sweepObstacles({ x: 1.4, z: 1.4 }, { x: 1.4, z: 1.4 }, 0.5, box)).toBeNull()
	expect(sweepObstacles({ x: 1.3, z: 1.3 }, { x: 1.3, z: 1.3 }, 0.5, box)).toBe(0)
	const p = PILLARS[0]
	expect(sweepObstacles({ x: p.x - 4, z: p.z }, { x: p.x + 4, z: p.z }, 0.3)).toBeCloseTo(
		(4 - p.r - 0.3) / 8,
	)
})

test('every grid edge and shortcut stays outside every box, including routes into the base throat', () => {
	const journeys = BOXES.filter((b) => b.kind === 'hedge').flatMap((b) => [
		[
			{ x: b.x, z: b.z - 3 },
			{ x: b.x, z: b.z + 3 },
		],
		[
			{ x: b.x - b.halfX - 2, z: b.z },
			{ x: b.x + b.halfX + 2, z: b.z },
		],
	])
	journeys.push(
		[
			{ x: -48, z: 0 },
			{ x: 48, z: 0 },
		],
		[
			{ x: 26, z: 11 },
			{ x: 48, z: 0 },
		],
	)
	const planPath = createPathPlanner(options)
	for (const [start, goal] of journeys) {
		const path = planPath(start, goal)
		expect(path.length).toBeGreaterThan(0)
		let from = start
		for (const to of path) {
			expect(segmentClear(from, to, options.radius + options.clearance)).toBe(true)
			for (let i = 0; i <= 100; i++) {
				const u = i / 100
				expect(
					walkable(
						from.x + (to.x - from.x) * u,
						from.z + (to.z - from.z) * u,
						options.radius,
						options.clearance,
					),
				).toBe(true)
			}
			from = to
		}
		expect(from.x).toBeCloseTo(goal.x)
		expect(from.z).toBeCloseTo(goal.z)
	}
	// An illegal start cannot be rescued by returning a straight line through solid cover.
	expect(planPath({ x: 18, z: 7 }, { x: 18, z: 10 })).toEqual([])
})

test('intent movement, ordered paths and Vault all respect the same hedge colliders; basics walk around cover', () => {
	const harness = bootMoba({
		map: buildMap,
		heroes: [
			{ id: 'local', team: 'A' },
			{ id: 'remote', team: 'B' },
		],
		rng: () => 0.5,
	})
	const { sim, scene, facts, step } = harness
	const h = sim.heroes[0]
	const enemy = sim.heroes[1]
	const feed = (frame) => harness.feed(h.id, frame)
	try {
		expect(h.spawn).toEqual({ x: -48, z: 0 })
		expect(enemy.spawn).toEqual({ x: 48, z: 0 })
		for (const d of sim.dummies) {
			d.sparring = false
			d.body.place(-10, 1.05, 12)
		}
		h.body.place(18, 1.05, 4)
		enemy.body.place(18, 1.05, 9)
		feed({ move: { x: 0, z: 1 } })
		step(60)
		expect(h.body.position.z).toBeLessThan(6 - tune.hero.radius)
		feed({ pressed: [{ action: 'slot2', at: { x: 18, z: 12 } }] })
		step(15)
		expect(h.body.position.z).toBeLessThan(6 - tune.hero.radius)
		feed({ order: { x: 18, z: 9 } }) // enemy in range, but the hedge denies the basic windup
		step(1)
		expect(h.attack).toBeNull()
		const attackPath = h.order.path
		step(3)
		expect(h.order.path).toBe(attackPath) // A stationary target does not trigger per-tick planning.
		expect(facts.some((f) => f.type === 'cast' && f.slot === 'primary')).toBe(false)
		feed({ order: { x: 18, z: 10.5 } })
		for (let i = 0; i < 600 && h.order; i++) {
			step(1)
			expect(walkable(h.body.position.x, h.body.position.z, tune.hero.radius - 0.02)).toBe(true)
		}
		expect(Math.hypot(h.body.position.x - 18, h.body.position.z - 10.5)).toBeLessThan(
			tune.orders.arrival,
		)
		const meshes = scene.getObjectByName('moba-map').children
		expect(meshes.every((mesh) => !mesh.material.transparent)).toBe(true)
	} finally {
		harness.dispose()
		expect(scene.children).toHaveLength(0)
	}
})

test('camera follow and pad look-ahead clamp to the rectangular map; edge pips distinguish visible and behind-camera heroes', () => {
	const follow = createFollow()
	const camera = follow.frame(0, { x: 52, z: 13 }, { x: 99, z: 99 }, { pad: true })
	const bounded = clampView({ x: 52, z: 13 }, tune.follow)
	expect(camera.target).toMatchObject({ x: bounded.x, z: bounded.z })
	expect(projectMap({ x: 50, z: 0 }, { x: 60, z: 10 })).toEqual({ x: 52, z: 2 })
	expect(edgePip({ x: 0.2, y: 0.1, z: 0.5 })).toBeNull()
	expect(edgePip({ x: 4, y: 2, z: 0.5 })).toEqual({ x: tune.pips.inset, y: tune.pips.inset / 2 })
	expect(edgePip({ x: 4, y: 2, z: 2 }, true)).toEqual({
		x: -tune.pips.inset,
		y: -tune.pips.inset / 2,
	})
})
