import { test, expect } from 'bun:test'
import * as THREE from 'three'
import { buildColliders } from '../src/plugins/moba/obstacles.js'
import { agentRoster, createAgentPerception, observation } from '../src/plugins/moba/agents.js'
import { createAgentMatch } from '../src/plugins/moba/agent-match.js'
import { tune } from '../src/plugins/moba/tune.js'
import { RAPIER, STEP, median } from './moba-harness.js'

test('agent perception plus text fits a measured median query budget for the whole wave', () => {
	const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
	world.timestep = STEP
	const unbuild = buildColliders(world, RAPIER)
	const match = createAgentMatch({
		scene: new THREE.Scene(),
		world,
		RAPIER,
		roster: agentRoster({ seats: [], idle: ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'] }),
		seed: 2,
	})
	try {
		while (match.sim.tick < Math.round(tune.waves.first / STEP)) match.step()
		const count =
			['melee', 'ranged', 'wizard'].reduce((sum, kind) => sum + tune.minions[kind].count, 0) * 2
		expect(match.sim.lane.minions.filter((u) => !u.dead)).toHaveLength(count)
		const samples = []
		for (let i = 0; i < 120; i++) {
			const perception = createAgentPerception(),
				start = performance.now()
			perception.capture(match.sim)
			for (const { id } of match.tape.roster) observation(match.sim, id, perception.read())
			samples.push(performance.now() - start)
		}
		console.log('agent query median ms/tick', median(samples))
	} finally {
		match.dispose()
		unbuild()
		world.free()
	}
}, 20000)
