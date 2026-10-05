import { mkdir, rename, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { openSync, writeSync, closeSync } from 'node:fs'
import { availableParallelism } from 'node:os'
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

// Ordered team-kit pairs in rotation order; mirrors say nothing about a matchup, so a probe can drop them.
export function farmPairs(heroes, crossOnly = false) {
	return heroes.flatMap((a) => heroes.map((b) => [a, b])).filter(([a, b]) => !crossOnly || a !== b)
}

export function farmRoster(heroes, difficulty, index, crossOnly = false) {
	// All ordered team-kit pairs, including mirrors unless crossOnly; seat files stay symmetric.
	const pairs = farmPairs(heroes, crossOnly)
	const [a, b] = pairs[index % pairs.length]
	return agentRoster({ seats: [], difficulty }).map((seat) => ({
		...seat,
		heroId: seat.team === 'A' ? a : b,
	}))
}

// `--set mitts.speed=5.6`: a path into tune, or under tune.heroes when the first key isn't one.
function tuneSlot(path) {
	for (const keys of [path.split('.'), ['heroes', ...path.split('.')]]) {
		let node = tune
		for (const key of keys.slice(0, -1)) node = Object.hasOwn(node ?? {}, key) ? node[key] : null
		const last = keys.at(-1)
		if (node && typeof node[last] === 'number') return [node, last]
	}
	throw new Error(`--set ${path}: no numeric tune value at that path`)
}

export function parseSets(sets) {
	const axes = sets.map((set) => {
		const [path, list = ''] = set.split('=')
		const values = list.split(',').map((value) => (value.trim() === '' ? NaN : Number(value)))
		if (!path || !values.length || !values.every(Number.isFinite))
			throw new Error(`--set ${set}: expected path=number[,number...]`)
		tuneSlot(path)
		return values.map((value) => [path, value])
	})
	// Several --set flags sweep as a grid.
	return axes.reduce(
		(grid, axis) => grid.flatMap((row) => axis.map((cell) => [...row, cell])),
		[[]],
	)
}

export const variantLabel = (variant) =>
	variant.map(([path, value]) => `${path}=${value}`).join(' ') || 'default'

const baseline = new Map()
export function applyVariant(variant) {
	for (const [node, key, value] of baseline.values()) node[key] = value
	for (const [path, value] of variant) {
		const [node, key] = tuneSlot(path)
		if (!baseline.has(path)) baseline.set(path, [node, key, node[key]])
		node[key] = value
	}
}

// Per-team hero deaths and hero damage, counted from the combat log as it streams. A team's kills are the other's deaths.
function summaryStats(roster) {
	const team = new Map(roster.map((seat) => [seat.id, seat.team]))
	const totals = { A: { deaths: 0, damage: 0 }, B: { deaths: 0, damage: 0 } }
	return {
		totals,
		add(row) {
			const actor = team.get(row.seat)
			if (row.kind === 'hit' && actor) totals[actor].damage += row.effective_damage
			if (row.kind === 'death' && team.has(row.target)) totals[team.get(row.target)].deaths++
		},
	}
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
	summary = false,
}) {
	// A summary keeps only per-team counts: no log, no tape, nothing on disk.
	const stats = summary ? summaryStats(roster) : null
	if (!summary) await mkdir(directory, { recursive: true })
	const filename = join(directory ?? '', `${matchId}.jsonl`)
	const partial = filename + '.partial'
	const tapeFilename = join(directory ?? '', `${matchId}.tape.json`)
	const tuneHash = createHash('sha256').update(JSON.stringify(tune)).digest('hex')
	const file = summary ? null : openSync(partial, 'wx')
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
				if (summary) return stats.add(row)
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
		if (!summary)
			await writeFile(tapeFilename + '.partial', JSON.stringify(tape) + '\n', { flag: 'wx' })
		result = {
			matchId,
			seed,
			winner: tape.result.winner,
			duration: tape.result.ticks * STEP,
			reason,
			filename,
			tapeFilename,
			stats: stats?.totals,
		}
		flush()
	} finally {
		if (file !== null) closeSync(file)
		match?.dispose()
		unbuild?.()
		world.free()
	}
	if (summary) return result
	// A queryable log always has its complete replay alongside it.
	await rename(tapeFilename + '.partial', tapeFilename)
	await rename(partial, filename)
	return result
}

function rollupMatch(rows, result) {
	const key = result.pair.join(' v ')
	const row = rows.get(key) ?? {
		n: 0,
		decided: 0,
		aWins: 0,
		seconds: 0,
		A: { deaths: 0, damage: 0 },
		B: { deaths: 0, damage: 0 },
	}
	rows.set(key, row)
	row.n++
	row.seconds += result.duration
	if (result.winner) row.decided++
	if (result.winner === 'A') row.aWins++
	for (const team of ['A', 'B']) {
		row[team].deaths += result.stats[team].deaths
		row[team].damage += result.stats[team].damage
	}
}

// One row per variant and ordered matchup: team A's win rate, kills (the other team's deaths), deaths and hero damage per match.
function summaryTable(variants, rollup) {
	const header = [
		'variant',
		'matchup (A v B)',
		'matches',
		'decided',
		'A win %',
		'kills A-B',
		'dmg A-B',
		'minutes',
	]
	const lines = []
	variants.forEach((variant, i) => {
		for (const [key, r] of [...rollup[i]].sort()) {
			const avg = (value) => Math.round(value / r.n)
			lines.push([
				variantLabel(variant),
				key,
				r.n,
				r.decided,
				r.decided ? ((100 * r.aWins) / r.decided).toFixed(1) : '-',
				`${(r.B.deaths / r.n).toFixed(1)}-${(r.A.deaths / r.n).toFixed(1)}`,
				`${avg(r.A.damage)}-${avg(r.B.damage)}`,
				(r.seconds / r.n / 60).toFixed(1),
			])
		}
	})
	const widths = header.map((h, c) => Math.max(h.length, ...lines.map((l) => String(l[c]).length)))
	const fmt = (cells) =>
		cells
			.map((cell, c) => String(cell).padEnd(widths[c]))
			.join('  ')
			.trimEnd()
	return [fmt(header), fmt(widths.map((w) => '-'.repeat(w))), ...lines.map(fmt)].join('\n')
}

export async function farm(argv = process.argv.slice(2)) {
	const { values } = parseArgs({
		args: argv,
		options: {
			help: { type: 'boolean' },
			matches: { type: 'string', default: '20' },
			heroes: { type: 'string', default: 'fletcher,mitts' },
			difficulty: { type: 'string', default: 'hard' },
			jobs: { type: 'string', default: String(availableParallelism()) },
			'cross-only': { type: 'boolean' },
			summary: { type: 'boolean' },
			set: { type: 'string', multiple: true, default: [] },
			seed: { type: 'string', default: String(tune.bots.seed) },
			'max-seconds': { type: 'string', default: String(tune.agents.maxSeconds * 4) },
			out: { type: 'string', default: `runs/${new Date().toISOString().slice(0, 10)}` },
		},
	})
	if (values.help) {
		console.log(
			'bun scripts/farm.js --matches 20 --heroes fletcher,mitts --difficulty hard\nCounts round up to full matchup rotations; each rotation shares a seed.\nOptional: --seed uint32 --max-seconds N --out directory; timeouts are logged, not wins.\nProbing: --jobs N (default: core count) --cross-only (skip mirrors) --summary (no logs or tapes; print a table)\n  --set mitts.speed=5.6 (repeatable; comma values sweep, several flags make a grid, one table row per variant).',
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
	const crossOnly = values['cross-only']
	const pairs = farmPairs(heroes, crossOnly).length
	if (!pairs) throw new Error('--cross-only needs at least two heroes')
	const variants = parseSets(values.set)
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
	const tasks = variants.length * matches
	console.log(
		`run=${runId} commit=${commit} matches=${matches}${variants.length > 1 ? ` x ${variants.length} variants` : ''}`,
	)
	const workers = []
	const rollup = variants.map(() => new Map())
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
								jobs: Math.min(jobs, tasks),
								matches,
								heroes,
								crossOnly,
								variants,
								summary: values.summary,
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
							if (values.summary) {
								rollupMatch(rollup[result.variant], result)
								process.stderr.write('.')
								return
							}
							console.log(
								`${completed}/${tasks} ${result.matchId} seed=${result.seed} winner=${result.winner ?? 'none'} ${result.duration.toFixed(1)}s ${result.reason}`,
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
	if (values.summary) {
		process.stderr.write('\n')
		console.log(summaryTable(variants, rollup))
		console.log(`${completed} matches: ${wins} winners, ${completed - wins} timeouts`)
		return
	}
	console.log(`${completed} matches: ${wins} winners, ${completed - wins} timeouts; ${values.out}`)
}

if (!isMainThread) {
	await RAPIER.init({})
	const { heroes, crossOnly, variants, matches } = workerData
	const pairs = farmPairs(heroes, crossOnly).length
	for (let task = workerData.job; task < variants.length * matches; task += workerData.jobs) {
		const variant = Math.floor(task / matches),
			index = task % matches
		applyVariant(variants[variant])
		parentPort.postMessage({
			...(await runFarmMatch({
				...workerData,
				// Every variant plays the same seeds, so a sweep compares like with like.
				seed: workerData.seed + Math.floor(index / pairs),
				matchId: `${workerData.runId}-${String(task + 1).padStart(5, '0')}`,
				roster: farmRoster(heroes, workerData.difficulty, index % pairs, crossOnly),
			})),
			variant,
			pair: farmPairs(heroes, crossOnly)[index % pairs],
		})
	}
} else if (import.meta.main) {
	farm().catch((error) => {
		console.error(error.message)
		process.exitCode = 1
	})
}
