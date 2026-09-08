// No browser/GPU: measures real Rapier + AI fixed steps, not displayed FPS.
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { createRound } from '../src/round.js'
import { buildCourt } from '../src/court.js'
import { tune } from '../src/tune.js'
import { PRESETS, scenario } from '../src/scenario.js'

await RAPIER.init({})
const name = process.argv[2] ?? '20v20'
if (!PRESETS[name]) throw new Error(`Unknown preset: ${name}`)
const setup = scenario({ ...PRESETS[name], seed: Number(process.argv[3] ?? 42) })
const scene = new THREE.Scene()
const world = new RAPIER.World({ x: 0, y: tune.physics.gravity, z: 0 })
world.timestep = 1 / 60
buildCourt(scene, world, RAPIER)
const eventQueue = new RAPIER.EventQueue(true)
const times = []
const windows = []
// Repeated fresh rounds prevent an almost empty late match from passing as 20v20.
for (let run = 0; run < 3; run++) {
	const round = createRound(
		{ scene, world, RAPIER, eventQueue, combat: { push() {} } },
		{
			enemies: setup.teamB,
			allies: setup.teamA - 1,
			arrowCount: setup.arrows,
			seed: setup.seed + run,
		},
	)
	const startAlive = round.units.filter((u) => u.alive).length
	for (let i = 0; i < 10 * 60; i++) {
		const start = performance.now()
		round.step(world.timestep, { x: 0, z: 0 })
		round.lateUpdate()
		times.push(performance.now() - start)
	}
	windows.push({
		seed: setup.seed + run,
		startAlive,
		endAlive: round.units.filter((u) => u.alive).length,
	})
	round.dispose()
}
times.sort((a, b) => a - b)
console.log(
	JSON.stringify(
		{
			preset: name,
			windows,
			ticks: times.length,
			budgetMs: 1000 / 144,
			simulationMs: {
				mean: times.reduce((a, b) => a + b) / times.length,
				p95: times[Math.ceil(times.length * 0.95) - 1],
				max: times.at(-1),
			},
			note: 'Simulation only. Use game.benchmark() on a 144 Hz display to measure the complete frame.',
		},
		null,
		2,
	),
)
eventQueue.free()
world.free()
