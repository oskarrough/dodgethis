import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { createHash } from 'node:crypto'
import { STEP } from '../src/core/app.js'
import { createIntents } from '../src/core/intents.js'
import { createSim } from '../src/plugins/moba/sim.js'
import { buildColliders } from '../src/plugins/moba/obstacles.js'

// Every tick's complete legacy state AND facts enter the running digest. Checkpoints
// bound fixture size; a mismatch on any tick changes every subsequent checkpoint.
export async function heroTrace() {
	await RAPIER.init({})
	const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
	world.timestep = STEP
	const unbuild = buildColliders(world, RAPIER)
	const intents = createIntents()
	intents.use('pointClick')
	const seats = ['A', 'B'].flatMap((team) => [1, 2, 3].map((i) => ({ id: `${team}${i}`, team })))
	let facts = []
	const sim = createSim({
		scene: new THREE.Scene(),
		world,
		RAPIER,
		intents,
		heroes: seats,
		lane: true,
		scripted: seats.map((s) => s.id),
		present: (f) => facts.push(f),
	})
	const digest = createHash('sha256')
	const checkpoints = []
	try {
		for (let tick = 1; tick <= 43200; tick++) {
			sim.step()
			intents.age(STEP)
			const state = sim.snapshot()
			for (const hero of state.heroes) {
				delete hero.heroId
				delete hero.abilityState
			}
			digest.update(JSON.stringify([state, facts]))
			facts = []
			if (tick % 60 === 0 || sim.lane.match.winner)
				checkpoints.push([tick, digest.copy().digest('hex')])
			if (sim.lane.match.winner) break
		}
		return {
			source: 'b5f7e7b + Loose castPoint=0.3, speed=20 (before hero table)',
			checkpoints,
			winner: sim.lane.match.winner,
			tick: sim.tick,
		}
	} finally {
		sim.dispose()
		unbuild()
		world.free()
	}
}
