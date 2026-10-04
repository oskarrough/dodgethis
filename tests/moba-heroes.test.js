import { expect, test } from 'bun:test'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { STEP } from '../src/core/app.js'
import { createIntents, neutralFrame } from '../src/core/intents.js'
import { createBody } from '../src/core/body.js'
import { createSim } from '../src/plugins/moba/sim.js'
import { buildColliders } from '../src/plugins/moba/obstacles.js'
import { HEROES, freshAbilityState } from '../src/plugins/moba/heroes.js'
import { dressHero } from '../src/plugins/moba/hero-view.js'
import { dressPortrait } from '../src/plugins/moba/front/portrait.js'
import { tune } from '../src/plugins/moba/tune.js'

await RAPIER.init({})
function boot(seats) {
	const scene = new THREE.Scene()
	const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
	world.timestep = STEP
	const unbuild = buildColliders(world, RAPIER)
	const intents = createIntents()
	intents.use('pointClick')
	const facts = []
	const sim = createSim({
		scene,
		world,
		RAPIER,
		intents,
		lane: true,
		heroes: seats,
		present: (f) => facts.push(f),
	})
	return {
		sim,
		intents,
		facts,
		step(n = 1) {
			for (let i = 0; i < n; i++) {
				sim.step()
				intents.age(STEP)
			}
		},
		dispose() {
			sim.dispose()
			unbuild()
			world.free()
		},
	}
}

test('definitions keep tuning live, abilities own their properties, other heroes have no kits', () => {
	expect(HEROES.fletcher.abilities.slot1).toMatchObject({
		id: 'loose',
		kind: 'shot',
		pierce: false,
		heal: false,
		bounce: false,
		catchable: true,
	})
	const previous = tune.loose.speed
	try {
		tune.loose.speed = 18
		expect(HEROES.fletcher.abilities.slot1.stats.speed).toBe(18)
	} finally {
		tune.loose.speed = previous
	}
	for (const id of ['carom', 'skip']) {
		expect(HEROES[id].basic).toBeNull()
		expect(Object.values(HEROES[id].abilities).every((a) => a === null)).toBe(true)
		expect(HEROES[id].traits).toEqual({})
	}
	const source = { cd: [0, 150], dead: false }
	HEROES.fletcher.traits.onHit({
		source,
		shot: { ability: 'other-q' },
		target: { hero: true },
		ticks: (s) => s / STEP,
	})
	expect(source.cd[1]).toBe(150)
	HEROES.fletcher.traits.onHit({
		source,
		shot: { ability: 'loose' },
		target: { hero: true },
		ticks: (s) => s / STEP,
	})
	expect(source.cd[1]).toBe(30)
})

test('mixed base HP scales per hero; unavailable stand-in casts deny; state is copied and reset on death and respawn', () => {
	const run = boot(Object.keys(HEROES).map((heroId) => ({ id: heroId, heroId, team: 'A' })))
	const other = boot([{ id: 'second', team: 'A' }])
	try {
		const { sim, intents } = run
		sim.lane.teams.A.xp = tune.levels.first
		run.step(1800)
		for (const h of sim.heroes) {
			expect(h.level).toBeGreaterThan(1)
			expect(h.maxHp).toBeCloseTo(
				HEROES[h.heroId].base.hp * (1 + tune.levels.growth * (h.level - 1)),
			)
			expect(h.body.radius).toBe(tune.hero.radius)
		}
		const h = sim.heroes[1]
		intents.feed(h.id, { ...neutralFrame(), pressed: [{ action: 'slot4', at: { x: 0, z: 0 } }] })
		run.step()
		expect(h.cast).toBeNull()
		expect(run.facts.at(-1)).toMatchObject({ type: 'denied', hero: h.id, slot: 'slot4' })
		h.abilityState = {
			pocket: { damage: 140, left: 20 },
			bag: [{ speed: 20 }],
		}
		const state = sim.snapshot()
		expect(JSON.parse(JSON.stringify(state))).toEqual(state)
		state.heroes[1].abilityState.bag[0].speed = 0
		expect(h.abilityState.bag[0].speed).toBe(20)
		expect(other.sim.heroes[0].abilityState).toEqual(freshAbilityState())
		const p = h.body.position
		sim.shots.push({
			id: -1,
			owner: 'enemy',
			team: 'B',
			slot: 'primary',
			target: h.id,
			x: p.x,
			z: p.z,
			dx: 1,
			dz: 0,
			speed: 20,
			radius: 0.12,
			range: 20,
			travelled: 0,
			passed: [],
			damage: h.hp,
		})
		run.step()
		expect(h.dead).toBe(true)
		expect(h.abilityState).toEqual(freshAbilityState())
		run.step(h.respawnTick - sim.tick)
		expect(h.dead).toBe(false)
		expect(h.abilityState).toEqual(freshAbilityState())
		expect(h.body.mesh.name).toBe('moba-mitts')
	} finally {
		run.dispose()
		other.dispose()
	}
})

test('lane and replica share geometry; four stand-ins have distinct bodies and props; dressing disposes once', () => {
	const scene = new THREE.Scene()
	const signatures = []
	for (const id of Object.keys(HEROES)) {
		const body = createBody(scene, null, null, { profile: tune.hero, replica: true })
		const original = body.visual.geometry
		const undress = dressHero(body, id)
		signatures.push(body.visual.geometry.type)
		expect(body.mesh.children).toHaveLength(3)
		expect(body.visual.getObjectByName('shoes').visible).toBe(false)
		expect(body.visual.children.length).toBeGreaterThan(2)
		if (id === 'fletcher') {
			const replica = createBody(scene, null, null, { profile: tune.hero, replica: true })
			const unportrait = dressPortrait(replica)
			expect(replica.visual.geometry.parameters).toEqual(body.visual.geometry.parameters)
			expect(replica.visual.children.map((p) => p.geometry?.type)).toEqual(
				body.visual.children.map((p) => p.geometry?.type),
			)
			unportrait()
			replica.dispose()
		}
		undress()
		undress()
		expect(body.visual.geometry).toBe(original)
		body.dispose()
	}
	expect(signatures).toEqual([
		'CapsuleGeometry',
		'ExtrudeGeometry',
		'ExtrudeGeometry',
		'BoxGeometry',
	])
	expect(scene.children).toHaveLength(0)
})
