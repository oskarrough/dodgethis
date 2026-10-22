import { expect, test } from 'bun:test'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { STEP } from '../src/core/app.js'
import { agentRoster } from '../src/modes/moba/agents.js'
import { buildColliders } from '../src/modes/moba/obstacles.js'
import { createAgentMatch, readReplay, replayHash } from '../src/modes/moba/agent-match.js'
import { runFarmMatch } from '../scripts/farm.js'

await RAPIER.init({})

async function farmTape(roster, player = null) {
	const directory = await mkdtemp(tmpdir() + '/farm-replay-')
	try {
		const result = await runFarmMatch({
			directory,
			matchId: 'test',
			seed: 2,
			roster,
			maxSeconds: 15,
			player,
		})
		return readReplay(JSON.parse(await readFile(result.tapeFilename, 'utf8')))
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
}

function replayHashOf(tape) {
	const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
	world.timestep = STEP
	const unbuild = buildColliders(world, RAPIER)
	const run = createAgentMatch({
		scene: new THREE.Scene(),
		world,
		RAPIER,
		roster: tape.roster,
		seed: tape.seed,
		replay: tape,
	})
	try {
		while (run.step());
		return replayHash(run.sim.snapshot())
	} finally {
		run.dispose()
		unbuild()
		world.free()
	}
}

test('all-bot farm tape is a botReplay with no inputs and round-trips', async () => {
	const tape = await farmTape(agentRoster({ seats: [] }))
	expect(tape.botReplay).toBe(true)
	expect(tape.inputs).toHaveLength(0)
	expect(replayHashOf(tape)).toBe(tape.result.hash)
}, 120000)

test('--player farm tape records inputs and round-trips', async () => {
	const roster = agentRoster({ seats: ['A1'] })
	const tape = await farmTape(roster, { id: 'A1', lane: null })
	expect(tape.botReplay).toBeUndefined()
	expect(tape.inputs.length).toBeGreaterThan(0)
	expect(tape.roster.some((seat) => seat.controller === 'agent')).toBe(true)
	expect(replayHashOf(tape)).toBe(tape.result.hash)
}, 120000)

test('--idle farm tape records inputs and round-trips', async () => {
	const roster = agentRoster({ seats: [], idle: ['A1'] })
	const tape = await farmTape(roster)
	expect(tape.botReplay).toBeUndefined()
	expect(tape.inputs.length).toBeGreaterThan(0)
	expect(tape.roster.some((seat) => seat.controller === 'idle')).toBe(true)
	expect(replayHashOf(tape)).toBe(tape.result.hash)
}, 120000)

test('stamping botReplay on a non-bot tape is rejected by readReplay', async () => {
	const roster = agentRoster({ seats: ['A1'] })
	const tape = await farmTape(roster, { id: 'A1', lane: null })
	const buggy = structuredClone(tape)
	buggy.botReplay = true
	expect(() => readReplay(buggy)).toThrow(
		'Bot replays require an all-bot roster and no recorded inputs',
	)
}, 120000)
