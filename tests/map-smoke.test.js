import { expect, test } from 'bun:test'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { STEP } from '../src/core/app.js'
import { tune as coreTune } from '../src/core/tune.js'
import { agentRoster } from '../src/modes/moba/agents.js'
import { buildColliders } from '../src/modes/moba/obstacles.js'
import { createAgentMatch } from '../src/modes/moba/agent-match.js'
import { playableMaps, matchRecipe } from '../src/modes/moba/maps/all-maps.js'

// Every playable map, bots only, for a short stretch: a layout number gone NaN (a tune key
// dropped under a computed read) or a map whose bots stand still in the first seconds fails here, not in a playtest.
await RAPIER.init({})
const SECONDS = 3
// A dungeon's first encounter must fall to one bot alone: its jobs latch, so no fight needs a full party.
const SOLO_SECONDS = 60

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
		test(`${id}: one bot alone wins the first encounter`, () => {
			const { run, dispose } = match(
				id,
				agentRoster({ seats: [] }).filter((seat) => seat.id === 'A1'),
			)
			try {
				const first = run.sim.boss.encounters[0]
				const limit = Math.ceil(SOLO_SECONDS / STEP)
				while (run.sim.tick < limit && !first.killed && run.step());
				expect(first.killed).toBe(true)
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
