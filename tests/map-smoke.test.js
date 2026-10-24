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
// A dungeon is tuned for a party of three or four, and three bots must clear it by either wing.
const PARTY_SECONDS = 900

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
			// Half a metre: in the tile room both teams spawn in reach and kite in place, which is moving, not standing still.
			const walked = sim.heroes.filter((h) => h.body.position.distanceTo(start.get(h.id)) > 0.5)
			expect(walked.length).toBeGreaterThan(0)
		} finally {
			dispose()
		}
	}, 60000)

	// The whole run by each wing in turn, for a party of three, the dungeon's baseline: the other
	// wing sleeps, so the party walks the road, clears that wing and climbs to the last boss
	// carrying its boons.
	const layout = matchRecipe(id).layout
	for (const wing of layout.encounters?.length ? (layout.wings ?? []) : [])
		test(`${id}: a party of three clears the run by the ${wing} wing`, () => {
			const { run, dispose } = match(
				id,
				agentRoster({ seats: [] }).filter((seat) => seat.team === 'A'),
			)
			try {
				const list = run.sim.dungeon.encounters
				for (const e of list)
					if (layout.wings.includes(e.wing) && e.wing !== wing) {
						e.dormant = true
						for (const unit of e.units) unit.dormant = true
					}
				const limit = Math.ceil(PARTY_SECONDS / STEP)
				while (run.sim.tick < limit && !run.sim.lane.match.winner && run.step());
				expect(list.filter((e) => !e.killed && !e.dormant).map((e) => e.id)).toEqual([])
				expect(run.sim.dungeon.run.boons.length).toBeGreaterThanOrEqual(2)
			} finally {
				dispose()
			}
		}, 120000)
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
