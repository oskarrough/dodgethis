import { afterEach, beforeEach, expect, test } from 'bun:test'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { STEP } from '../src/core/app.js'
import { createIntents, neutralFrame } from '../src/core/intents.js'
import { createSim } from '../src/plugins/moba/sim.js'
import { createView } from '../src/plugins/moba/view.js'
import { createFeedback } from '../src/plugins/moba/feedback.js'
import { validFact } from '../src/plugins/moba/index.js'
import { tune } from '../src/plugins/moba/tune.js'

await RAPIER.init({})
let world, scene, intents, sim, facts, oldSpeed
const ticks = (s) => Math.round(s / STEP)
const hero = () => sim.heroes[0]
const dummy = () => sim.dummies[0]
function feed(frame = {}) {
	intents.feed('local', { ...neutralFrame(), ...frame })
}
function step(n = 1) {
	for (let i = 0; i < n; i++) {
		sim.step()
		intents.age(STEP)
	}
}
function shot(damage, owner = 'dummy1', team = 'B', slot = 'slot1') {
	const p = hero().body.position
	sim.shots.push({
		id: 1000 + sim.tick,
		owner,
		team,
		slot,
		x: p.x,
		z: p.z,
		dx: 1,
		dz: 0,
		speed: 24,
		radius: 0.3,
		range: 11,
		travelled: 0,
		passed: [],
		damage,
	})
}
beforeEach(() => {
	oldSpeed = tune.dummies.speed
	tune.dummies.speed = 0
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
	hero().body.place(0, 1.05, 8)
	dummy().body.place(4, 1.05, 8)
	for (const d of sim.dummies) d.sparring = false
	sim.dummies[1].body.place(-15, 1.05, -18)
})
afterEach(() => {
	sim.dispose()
	world.free()
	tune.dummies.speed = oldSpeed
})

test('basic attacks wind up, home to a moving target, deal 90 HP and fire once a second', () => {
	feed({ order: { x: 4, z: 8 } })
	step(ticks(tune.attack.windup) - 1)
	expect(sim.shots).toHaveLength(0)
	step()
	expect(hero().attack.phase).toBe('backswing')
	expect(sim.shots[0]).toMatchObject({ slot: 'primary', target: dummy().id })
	dummy().body.place(4, 1.05, 11)
	step(15)
	expect(dummy().hp).toBe(dummy().maxHp - 90)
	dummy().body.place(4, 1.05, 8)
	step(120)
	const releases = facts.filter((f) => f.type === 'projectile' && f.slot === 'primary')
	expect(releases).toHaveLength(3)
	expect(dummy().hp).toBe(dummy().maxHp - 270)
})

test('moving or casting cuts only the backswing; attack cooldown prevents extra shots', () => {
	feed({ order: { x: 4, z: 8 } })
	step(4)
	feed({ order: { x: -4, z: 8 } })
	step(4)
	expect(hero().body.position.x).toBe(0)
	step(2)
	expect(hero().body.position.x).toBeLessThan(0)
	expect(hero().attack).toBeNull()
	feed({ order: { x: 4, z: 8 } })
	step(5)
	expect(facts.filter((f) => f.type === 'projectile')).toHaveLength(1)
	step(54)
	expect(hero().attack.phase).toBe('backswing')
	feed({ pressed: [{ action: 'slot1', at: { x: 4, z: 8 } }] })
	step()
	expect(hero().attack).toBeNull()
	expect(hero().cast.slot).toBe('slot1')
})

test('attack orders chase into range, and pad primary uses the same windup', () => {
	dummy().body.place(9, 1.05, 8)
	feed({ order: { x: 9, z: 8 } })
	step(20)
	expect(sim.shots).toHaveLength(0)
	expect(hero().body.position.x).toBeGreaterThan(1)
	step(40)
	expect(facts.some((f) => f.type === 'projectile' && f.slot === 'primary')).toBe(true)
	hero().attack = null
	hero().attackTick = 0
	feed({ pressed: [{ action: 'primary', at: { x: 9, z: 8 } }] })
	step()
	expect(hero().order).toMatchObject({ kind: 'attack', target: dummy().id })
	expect(hero().attack.phase).toBe('windup')
})

test('Q hits recharge Vault by two seconds, clamped to zero; Rain and basic attacks do not', () => {
	hero().cd[1] = 150
	feed({ pressed: [{ action: 'slot1', at: { x: 4, z: 8 } }] })
	step(20)
	expect(dummy().hp).toBe(dummy().maxHp - 140)
	expect(hero().cd[1]).toBe(10)
	hero().cd[0] = 0
	hero().cd[1] = 30
	feed({ pressed: [{ action: 'slot1', at: { x: 4, z: 8 } }] })
	step(20)
	expect(hero().cd[1]).toBe(0)
	hero().cd[1] = 200
	feed({ pressed: [{ action: 'slot3', at: { x: 4, z: 8 } }] })
	step(ticks(tune.rain.delay))
	expect(hero().cd[1]).toBe(200 - ticks(tune.rain.delay))
	expect(dummy().hp).toBe(dummy().maxHp - 280 - 180)
})

test('hero damage, death and respawn use HP and tick timers, clear input and remove dead targets', () => {
	expect(hero().hp).toBe(1400)
	shot(140)
	step()
	expect(hero().hp).toBe(1260)
	hero().cd[0] = 100
	feed({ order: { x: -10, z: 8 }, pressed: [{ action: 'slot1', at: { x: 4, z: 8 } }] })
	shot(2000)
	step()
	expect(hero().hp).toBe(0)
	expect(hero().dead).toBe(true)
	expect(hero().body.retired).toBe(true)
	expect(hero().cast).toBeNull()
	expect(hero().order).toBeNull()
	expect(intents.get('local').pressed.some((e) => e.action.startsWith('slot'))).toBe(false)
	const deathTick = sim.tick
	expect(hero().respawnTick).toBe(deathTick + ticks(8))
	expect(sim.pick('B', hero().body.position)).toBeNull()
	feed({ move: { x: 1, z: 0 }, pressed: [{ action: 'slot2', at: { x: 9, z: 8 } }] })
	step(ticks(8) - 1)
	expect(hero().dead).toBe(true)
	expect(hero().cd[0]).toBe(0)
	step()
	expect(hero().dead).toBe(false)
	expect(hero().hp).toBe(1400)
	expect(hero().body.position.x).toBe(hero().spawn.x)
	expect(hero().attack).toBeNull()
	expect(facts.filter((f) => f.type === 'death')).toHaveLength(1)
	expect(facts.filter((f) => f.type === 'spawn')).toHaveLength(1)
	expect(facts.every(validFact)).toBe(true)
	expect(JSON.parse(JSON.stringify(sim.snapshot()))).toEqual(sim.snapshot())
})

test('the sparring dummy freezes a dodgeable Q aim, roots during the tell and damages the hero', () => {
	dummy().sparring = true
	dummy().castTick = 1
	step()
	expect(dummy().cast).toMatchObject({ slot: 'slot1', target: { x: 0, z: 8 } })
	const tell = facts.find((f) => f.type === 'cast')
	expect(tell.hero).toBe(dummy().id)
	step(20)
	expect(hero().hp).toBe(1260)
	expect(facts.find((f) => f.type === 'hit')).toMatchObject({
		source: dummy().id,
		target: 'local',
		damage: 140,
	})
	dummy().castTick = sim.tick + 1
	step()
	hero().body.place(0, 1.05, 12)
	step(30)
	expect(hero().hp).toBe(1260)
})

test('health bars tick every 200, follow rendered positions and hide while dead', () => {
	const view = createView(scene, () => () => {})
	const group = scene.children.at(-1)
	const update = () =>
		view.update(STEP, {
			live: new Set(),
			hero: hero().body.mesh.position,
			held: false,
			locate: () => null,
			units: [hero(), dummy()],
		})
	update()
	const bar = group.children.find((m) => m.children.length === 8)
	expect(bar).toBeDefined()
	expect(bar.children[1].scale.x).toBe(1.8)
	hero().hp = 700
	update()
	expect(bar.children[1].scale.x).toBe(0.9)
	hero().dead = true
	update()
	expect(bar.visible).toBe(false)
	hero().dead = false
	view.dispose()
	expect(scene.children).not.toContain(group)
})

test('feedback tiers distinguish remote pokes, local hits, damage taken and takedowns', () => {
	const previous = globalThis.document
	globalThis.document = { querySelector: () => null }
	const shakes = [],
		rumbles = [],
		kicks = [],
		flashes = [],
		sounds = []
	try {
		const feedback = createFeedback({
			sim,
			local: 'local',
			juice: { flash: (...a) => flashes.push(a), burst() {}, retire() {} },
			sfx: {
				hit: () => sounds.push('hit'),
				deflect: () => sounds.push('attack'),
				loose: () => sounds.push('loose'),
				roll: () => sounds.push('rain'),
			},
			camera: { shake: (n) => shakes.push(n), kick: (n) => kicks.push(n) },
			input: { rumble: (...a) => rumbles.push(a) },
			view: { unbolt() {} },
		})
		const hit = {
			type: 'hit',
			source: 'other',
			target: dummy().id,
			point: { x: 4, y: 1, z: 8 },
			direction: { x: 1, y: 0, z: 0 },
		}
		feedback.present({
			type: 'projectile',
			hero: 'local',
			id: -1,
			slot: 'primary',
			point: hit.point,
		})
		feedback.present({ type: 'projectile', hero: 'local', id: -1, slot: 'slot1', point: hit.point })
		expect(sounds).toEqual(['attack', 'loose'])
		sounds.length = 0
		feedback.present({ type: 'impact', hit: true, point: hit.point })
		feedback.present({ ...hit, slot: 'slot3' })
		feedback.present({ ...hit, slot: 'slot3' })
		expect(sounds).toEqual(['rain'])
		flashes.length = 0
		feedback.present(hit)
		expect(flashes[0][1]).toBe(0.07)
		expect(rumbles).toHaveLength(0)
		feedback.present({ ...hit, source: 'local' })
		expect(rumbles.at(-1)).toEqual([0.1, 0.2, 40])
		feedback.present({ ...hit, target: 'local' })
		expect(shakes.at(-1)).toBe(0.15)
		expect(rumbles.at(-1)).toEqual([0.2, 0.3, 60])
		feedback.present({ ...hit, type: 'death', source: 'local' })
		expect(kicks).toEqual([2])
		expect(feedback.beat(0.02)).toBeCloseTo(0.1)
		feedback.reset()
		feedback.present({ ...hit, type: 'death', target: 'local' })
		expect(feedback.beat(0.02)).toBe(1)
		expect(kicks).toEqual([2])
	} finally {
		if (previous === undefined) delete globalThis.document
		else globalThis.document = previous
	}
})
