import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { STEP } from '../src/core/app.js'
import { createIntents, neutralFrame } from '../src/core/intents.js'
import { createSim } from '../src/plugins/moba/sim.js'
import { buildColliders } from '../src/plugins/moba/obstacles.js'
import { maps, DEFAULT_MAP, matchRecipe } from '../src/plugins/moba/maps/index.js'

// One headless MOBA sim the way the tests use it: a Rapier world, point-click intents, and every fact kept.
await RAPIER.init({})
export { RAPIER, STEP }
export const ticks = (seconds) => Math.round(seconds / STEP)
export const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

// `map`: 'overthrow' builds the map's colliders, 'floor' a bare 40 m slab, 'none' nothing, or a builder `(scene, world, RAPIER) => unbuild`.
export function bootMoba({
	map = DEFAULT_MAP,
	heroes = [
		{ id: 'A', team: 'A' },
		{ id: 'B', team: 'B' },
	],
	...options
} = {}) {
	const scene = new THREE.Scene()
	const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
	world.timestep = STEP
	let unbuild = () => {}
	const recipe = Object.hasOwn(maps, map) ? matchRecipe(map) : null
	if (recipe) unbuild = buildColliders(world, RAPIER, recipe.layout.obstacles, recipe.layout.bounds)
	if (typeof map === 'function') unbuild = map(scene, world, RAPIER)
	if (map === 'floor')
		world.createCollider(RAPIER.ColliderDesc.cuboid(20, 0.5, 20).setTranslation(0, -0.5, 0))
	const intents = createIntents()
	intents.use('pointClick')
	const facts = []
	const sim = createSim({
		scene,
		world,
		RAPIER,
		intents,
		heroes,
		...recipe,
		present: (fact) => facts.push(fact),
		...options,
	})
	const feed = (id, frame = {}) => intents.feed(id, { ...neutralFrame(), ...frame })
	return {
		sim,
		scene,
		world,
		intents,
		facts,
		feed,
		press: (id, action, at = null) => feed(id, { pressed: [{ action, at }] }),
		step(n = 1, after = null) {
			for (let i = 0; i < n; i++) {
				sim.step()
				intents.age(STEP)
				after?.()
			}
		},
		dispose() {
			sim.dispose()
			unbuild()
			world.free()
		},
	}
}

// A bare projectile on a unit, for damage-routing tests that don't care how it flew.
export function shot(sim, unit, damage, fields = {}) {
	const p = unit.body.position
	sim.shots.push({
		id: 100000 + sim.tick,
		owner: 'A',
		team: 'A',
		slot: 'primary',
		x: p.x,
		z: p.z,
		dx: 1,
		dz: 0,
		speed: 24,
		radius: 0.12,
		range: 200,
		travelled: 0,
		passed: [],
		damage,
		...fields,
	})
}
