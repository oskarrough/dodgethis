import { afterEach, beforeEach, expect, test } from 'bun:test'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { createApp, STEP } from '../src/core/app.js'
import { createJuice } from '../src/core/juice.js'
import { makeStyleMaterial, styleId } from '../src/core/stylepass.js'
import { createFollow } from '../src/plugins/moba/follow.js'
import { createIntents, neutralFrame } from '../src/core/intents.js'
import { createSim } from '../src/plugins/moba/sim.js'
import { tune } from '../src/plugins/moba/tune.js'
import { PILLARS, clampWalkable, walkable } from '../src/plugins/moba/map.js'
import { buildColliders } from '../src/plugins/moba/obstacles.js'
import { planPath, segmentClear } from '../src/plugins/moba/path.js'
import { closest, stepShot, sweepHit } from '../src/plugins/moba/skillshot.js'

// The feel slice's headless checks (docs/moba-plan.md, M1): no overshoot on arrival, reversal time, buffer timing, order resumption, swept hits.
await RAPIER.init({})
let scene, world, intents, facts, sim
const ID = 'local'
beforeEach(() => {
	scene = new THREE.Scene()
	world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
	world.timestep = STEP
	const floor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
	world.createCollider(RAPIER.ColliderDesc.cuboid(20, 0.5, 20).setTranslation(0, -0.5, 0), floor)
	intents = createIntents()
	intents.use('pointClick')
	facts = []
	let seed = 1
	sim = createSim({
		scene,
		world,
		RAPIER,
		intents,
		heroes: [{ id: ID, team: 'A' }],
		present: (f) => facts.push(f),
		rng: () => (seed = (seed * 16807) % 2147483647) / 2147483647,
	})
	for (const d of sim.dummies) {
		d.sparring = false
		d.body.place(-15 + d.post.x * 0.1, 1.05, 18)
	} // parked out of the way unless a test wants them
})
afterEach(() => {
	sim.dispose()
	world.free()
})

const hero = () => sim.heroes[0]
const pos = () => ({ x: hero().body.position.x, z: hero().body.position.z })
function feed(overrides = {}) {
	intents.feed(ID, { ...neutralFrame(), ...overrides })
}
function step(n = 1) {
	for (let i = 0; i < n; i++) {
		sim.step(STEP)
		intents.age(STEP)
	}
}
const place = (x, z) => hero().body.place(x, hero().body.position.y, z)
const press = (action, at = null) => feed({ pressed: [{ action, at }] })
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

	const path = planPath(
		{ x: -10, z: -4 },
		{ x: 0, z: -4 },
		{ radius: 0.45, clearance: 0.1, grid: 0.5 },
	)
	for (let i = 0, from = { x: -10, z: -4 }; i < path.length; from = path[i++])
		expect(segmentClear(from, path[i], 0.5)).toBe(true)
	expect(
		planPath({ x: 0, z: 10 }, { x: 5, z: 12 }, { radius: 0.45, clearance: 0.1, grid: 0.5 }),
	).toEqual([{ x: 5, z: 12 }])
	expect(walkable(...Object.values(clampWalkable({ x: pillar.x, z: pillar.z }, 0.45)), 0.45)).toBe(
		true,
	)
	expect(clampWalkable({ x: 99, z: -99 }, 0.45)).toEqual({ x: 51.549, z: -7.549 })
})

test('a full-speed reversal takes at most 8 steps', () => {
	place(-8, 8)
	feed({ order: { x: 12, z: 8 } })
	step(30)
	expect(hero().body.velocity.x).toBeGreaterThan(tune.hero.speed * 0.99)
	feed({ order: { x: -18, z: 8 } })
	let steps = 0
	while (hero().body.velocity.x > -tune.hero.speed * 0.95 && steps < 30) {
		step()
		steps++
	}
	expect(steps).toBeLessThanOrEqual(8)
})

test('a slot press buffers for 0.15 s: it fires on the first legal step, or is denied at once', () => {
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

	step(cooldown - 13) // 0.2 s left: outside the buffer
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

test('Q deals HP damage to a strafing dummy, takes it down at zero, and it respawns', () => {
	const d = sim.dummies[0]
	d.body.place(d.post.x, 1.05, d.post.z)
	d.dir = 1
	d.flipIn = 99
	place(d.post.x - 6, d.post.z)
	const hitCount = Math.ceil(tune.dummies.hp / tune.loose.damage)
	for (let n = 0; n < hitCount; n++) {
		const target = d.body.position
		press('slot1', { x: target.x + tune.dummies.speed * 0.35, z: target.z })
		step(Math.round(tune.loose.cooldown * 60) + 1)
		d.body.place(d.post.x, 1.05, d.post.z)
	}
	expect(facts.filter((f) => f.type === 'hit')).toHaveLength(hitCount)
	expect(facts.find((f) => f.type === 'death')?.target).toBe(d.id)
	expect(d.dead || facts.some((f) => f.type === 'spawn')).toBe(true)
	step(Math.round(tune.dummies.respawn * 60) + 1)
	expect(d.dead).toBe(false)
	expect(facts.at(-1).type === 'spawn' || facts.some((f) => f.type === 'spawn')).toBe(true)
	const snap = sim.snapshot()
	expect(JSON.parse(JSON.stringify(snap))).toEqual(snap)
})

test('pad aim: remapped reach, a 10° assist toward an enemy on Q, and a resting stick falls back to the nearest enemy', () => {
	place(0, 8)
	const d = sim.dummies[0]
	d.body.place(0, 1.05, 0)
	const full = sim.stickAim(ID, { x: 1, z: 0 }, 1, null)
	expect(full.x).toBeCloseTo(tune.loose.range, 6)
	const low = sim.stickAim(ID, { x: 1, z: 0 }, 0.2, null)
	expect(low.x).toBeCloseTo(tune.loose.range * tune.stickAim.outMin, 6)
	const off = (8 * Math.PI) / 180
	const dir = { x: Math.sin(Math.PI + off), z: Math.cos(Math.PI + off) } // 8° off the dummy, straight up the screen
	const bent = sim.stickAim(ID, dir, 1, 'slot1')
	const angle = Math.atan2(bent.x, bent.z - 8)
	expect(Math.cos(angle - (Math.PI + off * (1 - tune.stickAim.assistBend)))).toBeCloseTo(1, 9)
	expect(sim.stickAim(ID, dir, 1, 'slot2').x).toBeCloseTo(dir.x * tune.vault.range, 6)
	expect(sim.stickAim(ID, dir, 1, 'slot3').x).toBeCloseTo(dir.x * tune.rain.range, 6)
	expect(sim.stickAim(ID, null, 0, null)).toEqual({ x: 0, z: 0 })
})

test('W vaults in the aimed direction, with its own cooldown and no projectile', () => {
	place(0, 8)
	press('slot2', { x: 10, z: 8 })
	step()
	expect(hero().body.dashing).toBe(true)
	expect(hero().cd[1]).toBe(Math.round(tune.vault.cooldown / STEP))
	expect(sim.shots).toHaveLength(0)
	expect(sim.zones).toHaveLength(0)
	step(Math.ceil(tune.vault.time / STEP) + 2)
	expect(pos().x).toBeCloseTo(tune.vault.range, 1)
	expect(pos().z).toBeCloseTo(8, 3)
})

test('E shows a delayed control zone, clamps its range, then hits and slows enemies', () => {
	place(0, 8)
	const d = sim.dummies[0]
	d.body.place(0, 1.05, 0)
	press('slot3', { x: 0, z: 0 })
	step()
	expect(sim.zones).toHaveLength(1)
	expect(sim.zones[0]).toMatchObject({ x: 0, z: 0 })
	expect(hero().cd[2]).toBe(Math.round(tune.rain.cooldown / STEP))
	expect(d.hp).toBe(d.maxHp)
	// Park the dummy in the zone until the tell completes.
	for (let i = 1; i < Math.round(tune.rain.delay / STEP); i++) {
		d.body.place(0, 1.05, 0)
		step()
	}
	expect(sim.zones).toHaveLength(0)
	expect(d.hp).toBe(d.maxHp - tune.rain.damage)
	expect(d.slow.until).toBeGreaterThan(sim.tick)
	expect(facts.find((f) => f.type === 'hit')?.slot).toBe('slot3')
	expect(facts.some((f) => f.type === 'impact')).toBe(true)
	step()
	expect(d.body.speedMul).toBeCloseTo((tune.dummies.speed / tune.hero.speed) * (1 - tune.rain.slow))
	hero().cd[2] = 0
	press('slot3', { x: 0, z: -100 })
	step()
	expect(sim.zones[0].z).toBeCloseTo(8 - tune.rain.range)
})

// The bar is feel at 144 Hz: the rendered hero and the follow camera must move the same distance every frame.
test('at 144 Hz an ordered hero and the follow camera advance evenly', () => {
	const app = createApp()
	const w = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
	w.timestep = STEP
	buildColliders(w, RAPIER)
	const own = createSim({
		scene: new THREE.Scene(),
		world: w,
		RAPIER,
		intents: app.intents,
		heroes: [{ id: ID, team: 'A' }],
		smooth: app.smooth,
	})
	app.system('simulate', (dt) => own.step(dt))
	const h = own.heroes[0]
	for (const d of own.dummies) {
		d.sparring = false
		d.body.place(-20, d.body.position.y, 12)
	}
	h.body.place(8, h.body.position.y, 0)
	const follow = createFollow()
	const rendered = []
	const framed = []
	app.system('present', ({ dt }) => {
		rendered.push(h.body.mesh.position.x)
		framed.push(follow.frame(dt, h.body.mesh.position, null).target.x)
	})
	app.intents.feed(ID, { ...neutralFrame(), order: { x: -12, z: 0 } })
	for (let i = 0; i < 144 * 3; i++) app.frame(1 / 144)
	const even = (zs, from, to) => {
		const steps = zs.slice(from + 1, to).map((z, i) => z - zs[from + i])
		const mean = steps.reduce((a, b) => a + b, 0) / steps.length
		expect(mean).toBeCloseTo(-tune.hero.speed / 144, 3)
		for (const d of steps) expect(Math.abs(d - mean)).toBeLessThan(Math.abs(mean) * 0.05)
	}
	even(rendered, 30, 144 * 3 - 1) // after acceleration, before arrival
	even(framed, 144, 144 * 3 - 1) // once the spring has caught up
	own.dispose()
	w.free()
})

test('follow framing leans a quarter of the way to the aim, capped at 3 m, and snaps on recentre', () => {
	const follow = createFollow()
	expect(follow.goal({ x: 0, z: 0 }, { x: 4, z: 0 })).toEqual({ x: 1, z: 0 })
	const far = follow.goal({ x: 0, z: 0 }, { x: 0, z: -40 })
	expect(Math.hypot(far.x, far.z)).toBeCloseTo(tune.follow.lookCap, 9)
	const first = follow.frame(1 / 144, { x: 5, z: 3 }, null)
	expect(first.target).toMatchObject({ x: 5, z: 3 })
	expect(first.eye).toMatchObject({ x: 5, y: tune.follow.height, z: 3 + tune.follow.back })
	const moved = follow.frame(1 / 144, { x: 10, z: 5 }, null, { pad: true }).target.x
	expect(moved).toBeGreaterThan(5)
	expect(moved).toBeLessThan(6)
	follow.snap()
	expect(follow.frame(1 / 144, { x: 10, z: 5 }, null).target.x).toBe(10)
})

test('the juice kit flashes a style mesh cream, then restores it', () => {
	const juiceScene = new THREE.Scene()
	const juice = createJuice(juiceScene)
	const mesh = new THREE.Mesh(new THREE.BoxGeometry(), makeStyleMaterial('teamB'))
	const { uStyleId, uFlat } = mesh.material.uniforms
	juice.flash(mesh, 0.07)
	expect(uStyleId.value).toBe(styleId('cream'))
	expect(uFlat.value).toBe(1)
	juice.update(0.05)
	expect(uStyleId.value).toBe(styleId('cream'))
	juice.update(0.05)
	expect(uStyleId.value).toBe(styleId('teamB'))
	expect(uFlat.value).toBe(0)
	juice.dispose()
	expect(juiceScene.children).toHaveLength(0)
})
