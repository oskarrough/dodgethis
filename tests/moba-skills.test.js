import { afterEach, beforeEach, expect, test } from 'bun:test'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { STEP } from '../src/core/app.js'
import { createIntents, neutralFrame } from '../src/core/intents.js'
import { createSim } from '../src/plugins/moba/sim.js'
import { createSkillsView } from '../src/plugins/moba/skills-view.js'
import { createFeedback } from '../src/plugins/moba/feedback.js'
import { tune } from '../src/plugins/moba/tune.js'

await RAPIER.init({})
let world, scene, intents, sim, facts
beforeEach(() => {
	world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
	world.timestep = STEP
	world.createCollider(RAPIER.ColliderDesc.cuboid(20, 0.5, 20).setTranslation(0, -0.5, 0))
	scene = new THREE.Scene()
	intents = createIntents()
	intents.use('pointClick')
	facts = []
	sim = createSim({
		scene,
		world,
		RAPIER,
		intents,
		heroes: [{ id: 'local', team: 'A' }],
		present: (f) => facts.push(f),
		rng: () => 0.5,
	})
	sim.heroes[0].body.place(0, 1.05, 8)
	for (const d of sim.dummies) {
		d.sparring = false
		d.body.place(-15, 1.05, 18)
	}
})
afterEach(() => {
	sim.dispose()
	world.free()
})
function step(n = 1) {
	for (let i = 0; i < n; i++) {
		sim.step()
		intents.age(STEP)
	}
}
function feed(overrides) {
	intents.feed('local', { ...neutralFrame(), ...overrides })
}
function press(action, at) {
	feed({ pressed: [{ action, at }] })
}
const h = () => sim.heroes[0]

test('Rain freezes and range-clamps its target, telegraphs before hitting, then slows and recovers', () => {
	const d = sim.dummies[0]
	d.body.place(0, 1.05, -2)
	press('slot3', { x: 0, z: -99 })
	step()
	expect(sim.zones).toHaveLength(1)
	expect(sim.zones[0]).toMatchObject({ x: 0, z: -2 })
	expect(h().cast).toBeNull()
	expect(h().cd[2]).toBe(Math.round(tune.rain.cooldown / STEP))
	feed({ aim: { x: 99, z: 99 } })
	step(Math.round(tune.rain.delay / STEP) - 2)
	expect(facts.filter((f) => f.type === 'hit')).toHaveLength(0)
	// Walk out of the circle and back before impact: this is an area at impact, not a latched target.
	d.body.place(0, 1.05, -2)
	step()
	expect(sim.zones).toHaveLength(0)
	expect(facts.filter((f) => f.type === 'hit')).toHaveLength(1)
	expect(d.slow).toEqual({
		until: sim.tick + Math.round(tune.rain.duration / STEP),
		factor: 1 - tune.rain.slow,
	})
	step()
	expect(d.body.speedMul).toBeCloseTo((tune.dummies.speed / tune.hero.speed) * 0.7)
	step(Math.round(tune.rain.duration / STEP))
	expect(d.body.speedMul).toBeCloseTo(tune.dummies.speed / tune.hero.speed)
})

test('Rain can be dodged during the tell; cooldown denial names E, not Q', () => {
	const d = sim.dummies[0]
	d.body.place(0, 1.05, 0)
	press('slot3', { x: 0, z: 0 })
	step()
	d.body.place(10, 1.05, 0)
	press('slot3', { x: 10, z: 0 })
	step(Math.round(tune.rain.delay / STEP))
	expect(facts.filter((f) => f.type === 'hit')).toHaveLength(0)
	expect(facts.find((f) => f.type === 'denied')).toMatchObject({ slot: 'slot3' })
	expect(h().cd[0]).toBe(0)
})

test('Vault commits to its heading, resumes a queued order, and cannot pass a solid blocker or floor edge', () => {
	press('slot2', { x: 10, z: 8 })
	step()
	feed({ order: { x: -10, z: 8 } })
	step(Math.ceil(tune.vault.time / STEP) - 1)
	expect(h().body.position.x).toBeCloseTo(tune.vault.range, 0)
	expect(h().body.dashing).toBe(false)
	step(120)
	expect(h().body.position.x).toBeLessThan(-4)

	h().body.place(0, 1.05, 8)
	h().order = null
	h().cd[1] = 0
	world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 2, 2).setTranslation(2, 1, 8))
	press('slot2', { x: 10, z: 8 })
	step(15)
	expect(h().body.position.x).toBeLessThan(1.1)

	h().body.place(tune.map.halfX - 1, 1.05, 0)
	h().cd[1] = 0
	press('slot2', { x: 99, z: 0 })
	step(15)
	expect(h().body.position.x).toBeLessThanOrEqual(tune.map.halfX - tune.hero.radius + 0.001)
})

test('held pad slots only show aim: no cast until the device supplies its release edge; ranges follow the slot', () => {
	feed({ held: { slot3: true }, aim: { x: 0, z: 0 } })
	step(12)
	expect(sim.zones).toHaveLength(0)
	expect(h().cd[2]).toBe(0)
	press('slot3', { x: 0, z: 0 }) // pointClick translates pad release into this press edge
	step()
	expect(sim.zones).toHaveLength(1)
	expect(sim.stickAim('local', { x: 1, z: 0 }, 1, 'slot3').x).toBeCloseTo(tune.rain.range)
	expect(sim.stickAim('local', { x: 1, z: 0 }, 1, 'slot2').x).toBeCloseTo(tune.vault.range)
	expect(JSON.parse(JSON.stringify(sim.snapshot()))).toEqual(sim.snapshot())
})

test('Rain fills smoothly between ticks and reaches full size on the impact tick', () => {
	const view = createSkillsView(scene)
	const group = scene.children.at(-1)
	const update = (alpha = 0) =>
		view.update(STEP / 2, {
			hero: h().body.position,
			aim: null,
			held: {},
			zones: sim.zones,
			alpha,
		})
	press('slot3', { x: 0, z: 0 })
	step()
	update()
	const fill = group.children[3]
	const first = fill.scale.x
	update(0.5)
	expect(fill.scale.x - first).toBeCloseTo((tune.rain.radius * 0.5) / sim.zones[0].total)
	step(sim.zones[0].left - 1)
	update(0.99)
	expect(fill.scale.x).toBeLessThan(tune.rain.radius)
	expect(facts.some((f) => f.type === 'impact')).toBe(false)
	step()
	update()
	expect(facts.some((f) => f.type === 'impact')).toBe(true)
	expect(fill.scale.x).toBe(tune.rain.radius)
	expect(group.children).toContain(fill)
	update()
	expect(group.children).not.toContain(fill)
	view.dispose()
})

test('Rain briefly marks the frozen cast point independently of the pointer', () => {
	const view = createSkillsView(scene)
	const group = scene.children.at(-1)
	press('slot3', { x: 0, z: -99 })
	step()
	const cast = facts.find((f) => f.type === 'cast')
	expect(cast.target).toEqual({ x: 0, z: -2 })
	view.rain(cast.target)
	const circle = group.children.at(-1)
	view.update(0.05, { hero: h().body.position, aim: { x: 99, z: 99 }, held: {}, zones: [] })
	expect(circle.position.z).toBe(-2)
	expect(circle.visible).toBe(true)
	view.update(0.15, { hero: h().body.position, aim: null, held: {}, zones: [] })
	expect(circle.visible).toBe(false)
	view.dispose()
})

test('Vault keeps its path during the dash and replans once from its landing point', () => {
	feed({ order: { x: 10, z: 8 } })
	step()
	press('slot2', { x: 10, z: 8 })
	step()
	const path = h().order.path
	while (h().body.dashTime > STEP) {
		step()
		expect(h().order.path).toBe(path)
	}
	step()
	expect(h().body.dashing).toBe(false)
	const landingPath = h().order.path
	expect(landingPath).not.toBe(path)
	expect(landingPath.points[0].x).toBeCloseTo(h().body.position.x)
	step()
	expect(h().order.path).toBe(landingPath)
})

test('Vault has its own cue and streaks; Rain sounds once for a hit or a miss', () => {
	const previousDocument = globalThis.document
	globalThis.document = { querySelector: () => null }
	const sounds = []
	const bursts = []
	try {
		const feedback = createFeedback({
			sim,
			local: 'observer',
			juice: { burst: (...args) => bursts.push(args), flash() {} },
			sfx: {
				vault: () => sounds.push('vault'),
				loose: () => sounds.push('loose'),
				looseHit: () => sounds.push('hit'),
				rain: () => sounds.push('rain'),
			},
			view: { unbolt() {} },
			skillsView: { vault() {} },
		})
		press('slot2', { x: 10, z: 8 })
		step()
		for (const fact of facts.splice(0)) feedback.present(fact)
		expect(sounds).toEqual(['vault'])
		expect(bursts[0][2].streak).toBe(true)
		step(15)
		sounds.length = 0
		press('slot3', { x: 10, z: 8 })
		step(Math.round(tune.rain.delay / STEP))
		expect(facts.find((f) => f.type === 'impact').hit).toBe(false)
		for (const fact of facts.splice(0)) feedback.present(fact)
		expect(sounds).toEqual(['rain'])
		sounds.length = 0
		h().cd[2] = 0
		press('slot3', { x: 10, z: 8 })
		step(Math.round(tune.rain.delay / STEP) - 1)
		sim.dummies[0].body.place(10, 1.05, 8)
		step()
		expect(facts.find((f) => f.type === 'impact').hit).toBe(true)
		for (const fact of facts.splice(0)) feedback.present(fact)
		expect(sounds).toEqual(['rain'])
	} finally {
		if (previousDocument === undefined) delete globalThis.document
		else globalThis.document = previousDocument
	}
})

test('skill tells have distinct shapes, fill toward impact, and dispose their scene objects', () => {
	const view = createSkillsView(scene)
	const group = scene.children.at(-1)
	const zones = [{ id: 1, x: 2, z: 3, left: 30, total: 42 }]
	view.update(STEP, { hero: { x: 0, z: 8 }, aim: { x: 0, z: 0 }, held: { slot3: true }, zones })
	expect(group.children[0].visible).toBe(true)
	expect(group.children[1].visible).toBe(false)
	const fill = group.children[3]
	const small = fill.scale.x
	zones[0].left = 1
	view.update(STEP, { hero: { x: 0, z: 8 }, aim: { x: 0, z: 0 }, held: { slot2: true }, zones })
	expect(group.children[1].visible).toBe(true)
	expect(group.children[1].geometry.type).toBe('ShapeGeometry')
	expect(fill.scale.x).toBeGreaterThan(small)
	view.dispose()
	expect(scene.children).not.toContain(group)
})
