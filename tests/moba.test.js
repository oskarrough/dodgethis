import { afterEach, beforeEach, expect, test } from 'bun:test'
import { STEP, bootMoba } from './moba-harness.js'
import { tune } from '../src/plugins/moba/tune.js'
import { PILLARS, clampWalkable, walkable } from '../src/plugins/moba/map.js'
import { segmentClear } from '../src/plugins/moba/obstacles.js'
import { createPathPlanner } from '../src/plugins/moba/path.js'
import { closest, stepShot, sweepHit } from '../src/plugins/moba/skillshot.js'

// The feel slice's headless checks (docs/moba-plan.md, M1): no overshoot on arrival, reversal time, buffer timing, order resumption, swept hits.
let harness, facts, sim
const ID = 'local'
beforeEach(() => {
	let seed = 1
	harness = bootMoba({
		map: 'floor',
		heroes: [{ id: ID, team: 'A' }],
		rng: () => (seed = (seed * 16807) % 2147483647) / 2147483647,
	})
	;({ facts, sim } = harness)
	for (const d of sim.dummies) {
		d.sparring = false
		d.body.place(-15 + d.post.x * 0.1, 1.05, 18)
	} // parked out of the way unless a test wants them
})
afterEach(() => harness.dispose())

const hero = () => sim.heroes[0]
const pos = () => ({ x: hero().body.position.x, z: hero().body.position.z })
const feed = (overrides) => harness.feed(ID, overrides)
const step = (n) => harness.step(n)
const place = (x, z) => hero().body.place(x, hero().body.position.y, z)
const press = (action, at) => harness.press(ID, action, at)
const casts = () => facts.filter((f) => f.type === 'cast')

test('an order arrives exactly: full speed until the last step, no overshoot, stopped dead', () => {
	place(0, 4)
	const goal = { x: 0, z: 4 - 7.31 }
	feed({ order: goal })
	let farthest = -Infinity
	let steps = 0
	do {
		step()
		steps++
		farthest = Math.max(farthest, 4 - pos().z)
	} while (hero().order && steps < 200)
	expect(Math.hypot(pos().x - goal.x, pos().z - goal.z)).toBeLessThan(tune.orders.arrival)
	expect(farthest).toBeLessThanOrEqual(7.31 + 1e-3)
	expect(steps).toBeLessThanOrEqual(Math.ceil((7.31 / tune.hero.speed) * 60) + 3) // no easing into the point
	step(5)
	expect(Math.hypot(hero().body.velocity.x, hero().body.velocity.z)).toBe(0)
	expect(4 - pos().z).toBeLessThanOrEqual(7.31 + 1e-3)
})

test('orders path around pillars and clicks off the walkable area clamp to it', () => {
	const pillar = PILLARS[0]
	place(pillar.x - 4, pillar.z)
	const goal = { x: pillar.x + 4, z: pillar.z }
	feed({ order: goal })
	const inflate = tune.hero.radius
	let steps = 0
	do {
		step()
		steps++
		expect(Math.hypot(pos().x - pillar.x, pos().z - pillar.z)).toBeGreaterThan(
			pillar.r + inflate - 0.02,
		)
	} while (hero().order && steps < 400)
	expect(Math.hypot(pos().x - goal.x, pos().z - goal.z)).toBeLessThan(tune.orders.arrival)
	expect(steps).toBeLessThan(((8 + Math.PI * pillar.r) / tune.hero.speed) * 60 + 10)

	const planPath = createPathPlanner({ radius: 0.45, clearance: 0.1, grid: 0.5 })
	const path = planPath({ x: -10, z: -4 }, { x: 0, z: -4 })
	for (let i = 0, from = { x: -10, z: -4 }; i < path.length; from = path[i++])
		expect(segmentClear(from, path[i], 0.5)).toBe(true)
	expect(planPath({ x: 0, z: 10 }, { x: 5, z: 12 })).toEqual([{ x: 5, z: 12 }])
	expect(walkable(...Object.values(clampWalkable({ x: pillar.x, z: pillar.z }, 0.45)), 0.45)).toBe(
		true,
	)
	expect(clampWalkable({ x: 99, z: -99 }, 0.45)).toEqual({ x: 51.549, z: -7.549 })
})

test('a slot press buffers for tune.cast.buffer: it fires on the first legal step, or is denied at once', () => {
	place(0, 8)
	press('slot1', { x: 0, z: 0 })
	step()
	expect(casts()).toHaveLength(1)
	const cooldown = Math.round(tune.loose.cooldown * 60)
	step(cooldown - 1 - 6) // 0.1 s of cooldown left
	expect(hero().cd[0]).toBe(7)
	press('slot1', { x: 1, z: 0 })
	let steps = 0
	while (casts().length < 2 && steps < 30) {
		step()
		steps++
	}
	expect(casts()).toHaveLength(2)
	expect(steps).toBe(7) // the step the cooldown hits zero
	expect(hero().cd[0]).toBe(cooldown)

	step(cooldown - Math.round((tune.cast.buffer + 0.1) * 60)) // 0.1 s past the buffer
	press('slot1', { x: 0, z: 0 })
	step()
	expect(facts.at(-1)).toMatchObject({ type: 'denied', hero: ID, slot: 'slot1' })
	step(20)
	expect(casts()).toHaveLength(2)

	// Latest press wins, and stop clears the buffer.
	step(cooldown)
	feed({
		pressed: [
			{ action: 'slot1', at: { x: -5, z: 8 } },
			{ action: 'slot1', at: { x: 5, z: 8 } },
		],
	})
	step()
	expect(casts().at(-1).direction.x).toBeCloseTo(1, 6)
	step(cooldown - 3)
	press('slot1', { x: 0, z: 0 })
	press('stop')
	step(20)
	expect(casts()).toHaveLength(3)
})

test('a cast roots for its cast point, then the order resumes; an order given meanwhile wins', () => {
	place(-10, 8)
	step(60) // Settle on the floor before measuring a longer rooted cast.
	const goal = { x: 10, z: 8 }
	feed({ order: goal })
	step(20)
	press('slot1', { x: 0, z: 0 })
	step()
	const rooted = pos()
	const castPoint = Math.round(tune.loose.castPoint * 60)
	for (let i = 1; i < castPoint; i++) {
		step()
		expect(pos().x).toBeCloseTo(rooted.x, 5)
		expect(pos().z).toBeCloseTo(rooted.z, 5)
	}
	expect(facts.filter((f) => f.type === 'projectile')).toHaveLength(1)
	step()
	expect(pos().x).toBeGreaterThan(rooted.x)
	while (hero().order) step()
	expect(Math.hypot(pos().x - goal.x, pos().z - goal.z)).toBeLessThan(tune.orders.arrival)

	step(Math.round(tune.loose.cooldown * 60))
	press('slot1', { x: 10, z: 0 })
	step(2)
	const other = { x: 0, z: 12 }
	feed({ order: other })
	step()
	expect(hero().cast).not.toBeNull()
	while (hero().order) step()
	expect(Math.hypot(pos().x - other.x, pos().z - other.z)).toBeLessThan(tune.orders.arrival)
})

test('skillshots sweep: a thin target between two sampled positions is hit, a close pass is a near miss', () => {
	// At 24 m/s a step covers 0.4 m; a 0.05 m target sitting between samples still gets hit.
	const R = 0.3 + 0.05
	expect(sweepHit(0, 0, 0.4, 0, 0.2, 0.3, R)).toBeCloseTo((0.2 - Math.sqrt(R * R - 0.09)) / 0.4, 6)
	expect(sweepHit(0, 0, 0.4, 0, 0.2, 0.36, R)).toBeNull()
	expect(closest(0, 0, 1, 0, 0.5, 1)).toEqual({ t: 0.5, d: 1 })

	const shot = () => ({
		x: 0,
		z: 0,
		dx: 1,
		dz: 0,
		speed: 24,
		radius: 0.3,
		range: 11,
		travelled: 0,
		passed: [],
	})
	const thin = { id: 't', x: 3.02, z: 0.33, radius: 0.05 }
	let s = shot()
	let r
	do r = stepShot(s, STEP, [thin], 0.8)
	while (!r.hit && !r.expired)
	expect(r.hit).toBe(thin)
	expect(r.point.x).toBeLessThan(thin.x)

	const wide = { id: 'w', x: 5, z: 0.45 + 0.3 + 0.5, radius: 0.45 }
	s = shot()
	const near = []
	do {
		r = stepShot(s, STEP, [wide], 0.8)
		near.push(...r.nearMisses)
	} while (!r.hit && !r.expired)
	expect(r.hit).toBeNull()
	expect(s.travelled).toBeCloseTo(11, 9)
	expect(near).toHaveLength(1)
	expect(near[0].distance).toBeCloseTo(0.5, 6)
	expect(near[0].point.x).toBeCloseTo(5, 6)
})
