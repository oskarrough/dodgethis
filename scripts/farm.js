import { mkdir, rename, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { openSync, writeSync, closeSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { Worker, isMainThread, workerData, parentPort } from 'node:worker_threads'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { STEP } from '../src/core/app.js'
import { tune as coreTune } from '../src/core/tune.js'
import { tune } from '../src/plugins/moba/tune.js'
import { HEROES } from '../src/plugins/moba/heroes.js'
import { agentRoster } from '../src/plugins/moba/agents.js'
import { buildColliders } from '../src/plugins/moba/obstacles.js'
import { createAgentMatch } from '../src/plugins/moba/agent-match.js'

export function farmRoster(heroes, difficulty, index) {
	// All ordered team-kit pairs, including mirrors; seat files stay symmetric.
	const a = heroes[Math.floor(index / heroes.length) % heroes.length]
	const b = heroes[index % heroes.length]
	return agentRoster({ seats: [], difficulty }).map((seat) => ({
		...seat,
		heroId: seat.team === 'A' ? a : b,
	}))
}

// RAPIER.init() belongs to the caller, once per worker. No rendering or injected damage.
export async function runFarmMatch({
	directory,
	matchId,
	seed,
	roster,
	maxSeconds,
	runId = matchId,
	commit = null,
}) {
	await mkdir(directory, { recursive: true })
	const filename = join(directory, `${matchId}.jsonl`)
	const partial = filename + '.partial'
	const tapeFilename = join(directory, `${matchId}.tape.json`)
	const tuneHash = createHash('sha256').update(JSON.stringify(tune)).digest('hex')
	const file = openSync(partial, 'wx')
	let buffer = ''
	const flush = () => {
		if (!buffer) return
		const bytes = Buffer.from(buffer)
		let offset = 0
		while (offset < bytes.length) offset += writeSync(file, bytes, offset)
		buffer = ''
	}
	const world = new RAPIER.World({ x: 0, y: coreTune.physics.gravity, z: 0 })
	world.timestep = STEP
	let match, unbuild, result
	try {
		unbuild = buildColliders(world, RAPIER)
		match = createAgentMatch({
			scene: new THREE.Scene(),
			world,
			RAPIER,
			roster,
			seed,
			matchId,
			runId,
			commit,
			tuneHash,
			recordInputs: false,
			onLog(row) {
				buffer += JSON.stringify(row) + '\n'
				if (buffer.length >= 64 * 1024) flush()
			},
		})
		while (match.sim.tick < Math.ceil(maxSeconds / STEP) && match.step()) {}
		const reason = match.sim.lane.match.winner ? 'matchOver' : 'limit'
		const tape = match.finish(reason)
		tape.botReplay = true
		tape.run_id = runId
		tape.commit = commit
		tape.tune_hash = tuneHash
		await writeFile(tapeFilename + '.partial', JSON.stringify(tape) + '\n', { flag: 'wx' })
		result = {
			matchId,
			seed,
			winner: tape.result.winner,
			duration: tape.result.ticks * STEP,
			reason,
			filename,
			tapeFilename,
		}
		flush()
	} finally {
		closeSync(file)
		match?.dispose()
		unbuild?.()
		world.free()
	}
	// A queryable log always has its complete replay alongside it.
	await rename(tapeFilename + '.partial', tapeFilename)
	await rename(partial, filename)
	return result
}

export async function farm(argv = process.argv.slice(2)) {
	const { values } = parseArgs({
		args: argv,
		options: {
			help: { type: 'boolean' },
			matches: { type: 'string', default: '20' },
			heroes: { type: 'string', default: 'fletcher,mitts' },
			difficulty: { type: 'string', default: 'hard' },
			jobs: { type: 'string', default: '10' },
			seed: { type: 'string', default: String(tune.bots.seed) },
			'max-seconds': { type: 'string', default: String(tune.agents.maxSeconds * 4) },
			out: { type: 'string', default: `runs/${new Date().toISOString().slice(0, 10)}` },
		},
	})
	if (values.help) {
		console.log(
			'bun scripts/farm.js --matches 20 --heroes fletcher,mitts --difficulty hard --jobs 10\nCounts round up to full matchup rotations; each rotation shares a seed.\nOptional: --seed uint32 --max-seconds N --out directory; timeouts are logged, not wins.',
		)
		return
	}
	const requestedMatches = Number(values.matches),
		jobs = Number(values.jobs),
		seed = Number(values.seed),
		maxSeconds = Number(values['max-seconds'])
	for (const [name, value] of [
		['matches', requestedMatches],
		['jobs', jobs],
	])
		if (!Number.isSafeInteger(value) || value < 1)
			throw new Error(`${name} must be a positive integer`)
	if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)
		throw new Error('seed must be uint32')
	if (!Number.isFinite(maxSeconds) || maxSeconds < STEP)
		throw new Error('max-seconds must be at least one step')
	if (!['easy', 'normal', 'hard'].includes(values.difficulty))
		throw new Error('difficulty must be easy, normal or hard')
	const requested = [
		...new Set(
			values.heroes
				.split(',')
				.map((hero) => hero.trim())
				.filter(Boolean),
		),
	]
	const heroes = requested.filter((hero) => Object.hasOwn(HEROES, hero))
	for (const hero of requested.filter((hero) => !heroes.includes(hero))) {
		if (hero !== 'mitts') throw new Error(`Unknown hero: ${hero}`)
		console.warn('Mitts is not available in this checkout; skipping her matchups.')
	}
	if (!heroes.length) throw new Error('No available heroes requested')
	const pairs = heroes.length ** 2
	const matches = Math.ceil(requestedMatches / pairs) * pairs
	if (!Number.isSafeInteger(matches) || seed + matches / pairs - 1 > 0xffffffff)
		throw new Error('Match count exceeds the available uint32 seeds')
	if (matches !== requestedMatches)
		console.log(
			`Rounded ${requestedMatches} matches up to ${matches} for complete ${pairs}-match rotations.`,
		)
	const revision = spawnSync('jj', ['log', '-r', '@', '--no-graph', '-T', 'commit_id'], {
		encoding: 'utf8',
	})
	const commit = revision.stdout?.trim()
	if (revision.status !== 0 || !/^[0-9a-f]{40}$/.test(commit ?? ''))
		throw new Error('Cannot record the farm commit: jj log failed')
	const runId = crypto.randomUUID()
	console.log(`run=${runId} commit=${commit} matches=${matches}`)
	const workers = []
	let completed = 0,
		wins = 0
	try {
		await Promise.all(
			Array.from(
				{ length: Math.min(jobs, matches) },
				(_, job) =>
					new Promise((resolve, reject) => {
						const worker = new Worker(new URL(import.meta.url), {
							workerData: {
								job,
								jobs: Math.min(jobs, matches),
								matches,
								heroes,
								difficulty: values.difficulty,
								seed,
								maxSeconds,
								directory: values.out,
								runId,
								commit,
							},
						})
						workers.push(worker)
						worker.on('message', (result) => {
							completed++
							if (result.winner) wins++
							console.log(
								`${completed}/${matches} ${result.matchId} seed=${result.seed} winner=${result.winner ?? 'none'} ${result.duration.toFixed(1)}s ${result.reason}`,
							)
						})
						worker.on('error', reject)
						worker.on('exit', (code) =>
							code === 0 ? resolve() : reject(new Error(`Farm worker exited ${code}`)),
						)
					}),
			),
		)
	} finally {
		await Promise.all(workers.map((worker) => worker.terminate()))
	}
	console.log(`${completed} matches: ${wins} winners, ${completed - wins} timeouts; ${values.out}`)
}

if (!isMainThread) {
	await RAPIER.init({})
	for (let index = workerData.job; index < workerData.matches; index += workerData.jobs) {
		parentPort.postMessage(
			await runFarmMatch({
				...workerData,
				seed: workerData.seed + Math.floor(index / workerData.heroes.length ** 2),
				matchId: `${workerData.runId}-${String(index + 1).padStart(5, '0')}`,
				roster: farmRoster(
					workerData.heroes,
					workerData.difficulty,
					index % workerData.heroes.length ** 2,
				),
			}),
		)
	}
} else if (import.meta.main) {
	farm().catch((error) => {
		console.error(error.message)
		process.exitCode = 1
	})
}
