import { expect, test } from 'bun:test'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { STEP } from '../src/core/app.js'
import { tune as coreTune } from '../src/core/tune.js'
import { agentRoster } from '../src/modes/moba/agents.js'
import { buildColliders } from '../src/modes/moba/obstacles.js'
import { createAgentMatch } from '../src/modes/moba/agent-match.js'
import { playableMaps, matchRecipe } from '../src/modes/moba/maps/all-maps.js'
import encounters from '../src/modes/moba/encounters/all-encounters.js'

// Every playable map, bots only, for a short stretch: a layout number gone NaN (a tune key
// dropped under a computed read) or a map whose bots stand still in the first seconds fails here, not in a playtest.
await RAPIER.init({})
const SECONDS = 3
// A dungeon's road to its wings, and every wing fight built so far, must fall to one bot alone:
// jobs latch and bosses leave a way through, so no fight needs a full party.
const SOLO_SECONDS = 200
// And a party of three must clear it, carrying a whole wing's boons to the last boss.
const PARTY_SECONDS = 240

function nonFinite(value, path = 'layout', out = [], seen = new Set()) {
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) out.push(`${path} = ${value}`)
	} else if (value && typeof value === 'object' && !seen.has(value)) {
		seen.add(value)
		for (const [key, child] of Object.entries(value)) nonFinite(child, `${path}.${key}`, out, seen)
	}
	return out
}

for (const id of playableMaps) {
	test(`${id}: layout numbers are finite`, () => {
		expect(nonFinite(matchRecipe(id).layout)).toEqual([])
	})

	test(`${id}: a bot match stays finite and the bots move`, () => {
		const { run, dispose } = match(id, agentRoster({ seats: [] }))
		try {
			const { sim } = run
			const start = new Map(sim.heroes.map((h) => [h.id, h.body.position.clone()]))
			const limit = Math.ceil(SECONDS / STEP)
			while (sim.tick < limit && run.step());
			const units = [...sim.heroes, ...(sim.lane?.structures ?? []), ...(sim.lane?.minions ?? [])]
			const bad = units
				.filter((u) => u.body?.position)
				.filter(({ body: { position: p } }) => ![p.x, p.y, p.z].every(Number.isFinite))
				.map((u) => u.id)
			expect(bad).toEqual([])
			const walked = sim.heroes.filter((h) => h.body.position.distanceTo(start.get(h.id)) > 1)
			expect(walked.length).toBeGreaterThan(0)
		} finally {
			dispose()
		}
	}, 60000)

	if (matchRecipe(id).layout.encounters?.length)
		test(`${id}: one bot alone wins the road and every built wing fight`, () => {
			const { run, dispose } = match(
				id,
				agentRoster({ seats: [] }).filter((seat) => seat.id === 'A1'),
			)
			try {
				const { wings } = run.sim.layout
				const road = run.sim.dungeon.encounters.filter(
					(e) => !e.last && (!wings.includes(e.wing) || encounters[e.id].create),
				)
				const limit = Math.ceil(SOLO_SECONDS / STEP)
				while (run.sim.tick < limit && !road.every((e) => e.killed) && run.step());
				expect(road.filter((e) => !e.killed).map((e) => e.id)).toEqual([])
			} finally {
				dispose()
			}
		}, 60000)

	if (matchRecipe(id).layout.encounters?.some((spot) => spot.wing))
		test(`${id}: a party of three clears it with a wing's boons`, () => {
			const { run, dispose } = match(
				id,
				agentRoster({ seats: [] }).filter((seat) => seat.team === 'A'),
			)
			try {
				const limit = Math.ceil(PARTY_SECONDS / STEP)
				while (run.sim.tick < limit && !run.sim.lane.match.winner && run.step());
				expect(run.sim.lane.match.winner).toBe('A')
				expect(run.sim.dungeon.run.boons.length).toBeGreaterThanOrEqual(2)
			} finally {
				dispose()
			}
		}, 60000)
}

function match(id, roster) {
	const recipe = matchRecipe(id)
	const world = new RAPIER.World({ x: 0, y: coreTune.physics.gravity, z: 0 })
	world.timestep = STEP
	const { obstacles, bounds, settings } = recipe.layout
	const unbuild = buildColliders(world, RAPIER, obstacles, bounds, settings?.scale ?? 1)
	const run = createAgentMatch({
		recipe,
		scene: new THREE.Scene(),
		world,
		RAPIER,
		roster,
		seed: 2,
		recordInputs: false,
		capturePerception: false,
		onLog() {},
	})
	return {
		run,
		dispose() {
			run.dispose()
			unbuild()
			world.free()
		},
	}
}
