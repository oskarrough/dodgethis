import { expect, test } from 'bun:test'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as THREE from 'three'
import { neutralFrame } from '../src/core/intents.js'
import { tune } from '../src/plugins/moba/tune.js'
import { buildColliders } from '../src/plugins/moba/obstacles.js'
import { agentRoster } from '../src/plugins/moba/agents.js'
import { createAgentMatch, replayHash } from '../src/plugins/moba/agent-match.js'
import { farm, farmRoster, runFarmMatch } from '../scripts/farm.js'
import { RAPIER, STEP, median } from './moba-harness.js'

test('farm rotates both sides and mirrors without changing seat/controller assignments', () => {
	const pairs = []
	for (let index = 0; index < 4; index++) {
		const roster = farmRoster(['fletcher', 'mitts'], 'hard', index)
		expect(roster.map((seat) => seat.id)).toEqual(['A1', 'A2', 'A3', 'B1', 'B2', 'B3'])
		expect(roster.every((seat) => seat.controller === 'bot' && seat.difficulty === 'hard')).toBe(
			true,
		)
		pairs.push([roster[0].heroId, roster[3].heroId])
	}
	expect(pairs).toEqual([
		['fletcher', 'fletcher'],
		['fletcher', 'mitts'],
		['mitts', 'fletcher'],
		['mitts', 'mitts'],
	])
	expect(farmRoster(['fletcher'], 'easy', 99).every((seat) => seat.heroId === 'fletcher')).toBe(
		true,
	)
})

test('farm rejects invalid counts, seeds, kits and time limits before starting workers', async () => {
	for (const argv of [
		['--matches', '0'],
		['--jobs', 'NaN'],
		['--seed', '-1'],
		['--heroes', 'unknown'],
		['--difficulty', 'impossible'],
		['--max-seconds', '0'],
	])
		await expect(farm(argv)).rejects.toThrow()
})

test('rows expose every ordinary fact, preserve feedback details and finalize once without changing sim', () => {
	const roster = agentRoster({ seats: ['A1'], idle: ['A2', 'A3', 'B1', 'B2', 'B3'] })
	const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
	world.timestep = STEP
	const unbuild = buildColliders(world, RAPIER)
	const seen = []
	const match = createAgentMatch({
		scene: new THREE.Scene(),
		world,
		RAPIER,
		roster,
		seed: 9,
		matchId: 'exposed',
		present: (fact) => seen.push(fact),
	})
	try {
		const cast = {
			...neutralFrame(),
			aim: { x: -35, z: 0 },
			pressed: [{ action: 'slot1', at: { x: -35, z: 0 } }],
		}
		match.step([['A1', cast]])
		for (let tick = 0; tick < 30; tick++) match.step()
		match.step([['A1', structuredClone(cast)]])
		expect(match.logRows.map((row) => row.fact)).toEqual(seen)
		expect(match.logRows.some((row) => row.kind === 'denied')).toBe(true)
		expect(match.logRows.find((row) => row.kind === 'cast')).toMatchObject({
			seat: 'A1',
			hero: 'fletcher',
			team: 'A',
			ability_id: 'loose',
		})
		const snapshot = JSON.stringify(match.sim.snapshot())
		match.finish('limit')
		match.finish('limit')
		expect(JSON.stringify(match.sim.snapshot())).toBe(snapshot)
		expect(match.logRows.filter((row) => row.kind === 'match')).toHaveLength(1)
		expect(match.logRows.at(-1)).toMatchObject({
			winner: null,
			duration: match.sim.tick * STEP,
			seed: 9,
			map: 'lane',
		})
	} finally {
		match.dispose()
		unbuild()
		world.free()
	}
})

test('streaming and retained logs leave two live sims identical and fit a median tick budget', () => {
	const streamed = []
	function boot(options) {
		const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
		world.timestep = STEP
		const unbuild = buildColliders(world, RAPIER)
		const match = createAgentMatch({
			scene: new THREE.Scene(),
			world,
			RAPIER,
			seed: 2,
			roster: farmRoster(['fletcher'], 'hard', 0),
			matchId: 'same-inputs',
			...options,
		})
		return {
			match,
			close() {
				match.dispose()
				unbuild()
				world.free()
			},
		}
	}
	const retained = boot({}),
		sink = boot({ recordInputs: false, onLog: (row) => streamed.push(row) })
	try {
		while (retained.match.sim.tick < Math.round(tune.waves.first / STEP)) {
			retained.match.step()
			sink.match.step()
		}
		const samples = []
		for (let tick = 0; tick < 120; tick++) {
			const start = performance.now()
			sink.match.step()
			samples.push(performance.now() - start)
			retained.match.step()
		}
		expect(replayHash(sink.match.sim.snapshot())).toBe(replayHash(retained.match.sim.snapshot()))
		expect(streamed).toEqual(retained.match.logRows)
		expect(sink.match.logRows).toHaveLength(0)
		expect(sink.match.tape.inputs).toHaveLength(0)
		expect(retained.match.tape.inputs.length).toBeGreaterThan(0)
		expect(median(samples)).toBeLessThan(tune.proof.queryBudgetMs)
	} finally {
		retained.close()
		sink.close()
	}
}, 20000)

test('a fast bot match writes valid JSONL, capped effective damage and exactly one natural winner row', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'moba-combat-log-'))
	const saved = ['tower', 'fort', 'core'].map((kind) => [kind, tune[kind].hp])
	// Only the test's structure durability is reduced; bots still travel, attack
	// and break the normal vulnerability chain. No fabricated shots or winner.
	for (const [kind] of saved) tune[kind].hp = 1
	try {
		const result = await runFarmMatch({
			directory,
			matchId: 'fast',
			seed: 2,
			roster: farmRoster(['fletcher'], 'hard', 0),
			maxSeconds: tune.agents.maxSeconds,
		})
		expect(result.reason).toBe('matchOver')
		expect(['A', 'B']).toContain(result.winner)
		const rows = (await readFile(result.filename, 'utf8'))
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line))
		for (const row of rows) {
			expect(Number.isSafeInteger(row.tick)).toBe(true)
			expect(row).toMatchObject({ match_id: 'fast', seed: 2 })
			expect(Number.isFinite(row.effective_damage)).toBe(true)
			expect(row.effective_damage).toBeGreaterThanOrEqual(0)
			if (row.position)
				for (const axis of ['x', 'y', 'z']) expect(Number.isFinite(row.position[axis])).toBe(true)
			if (row.seat) expect(row.hero).toBe('fletcher')
		}
		const matches = rows.filter((row) => row.kind === 'match')
		expect(matches).toHaveLength(1)
		expect(matches[0]).toMatchObject({
			winner: result.winner,
			duration: result.duration,
			map: 'lane',
			difficulty: 'hard',
		})
		expect(matches[0].roster).toHaveLength(6)
		expect(rows.some((row) => row.kind === 'matchOver')).toBe(true)
		const structureHits = rows.filter(
			(row) => row.kind === 'hit' && /^(tower|fort|core)-/.test(row.target),
		)
		expect(structureHits.length).toBeGreaterThanOrEqual(3)
		const damageByTarget = new Map()
		for (const row of structureHits) {
			expect(row.effective_damage).toBeLessThanOrEqual(1)
			damageByTarget.set(row.target, (damageByTarget.get(row.target) ?? 0) + row.effective_damage)
		}
		for (const damage of damageByTarget.values())
			expect(damage).toBeLessThanOrEqual(1 + Number.EPSILON)
		expect(structureHits.every((row) => row.fact.damage === row.effective_damage)).toBe(true)
		expect(await readdir(directory)).toEqual(['fast.jsonl', 'fast.tape.json'])
	} finally {
		for (const [kind, hp] of saved) tune[kind].hp = hp
		await rm(directory, { recursive: true, force: true })
	}
}, 120000)
