import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, statSync, openSync, writeSync, closeSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { Worker, isMainThread, workerData, parentPort } from 'node:worker_threads'
import { coreBudget, reserveCores } from './bench/cores.js'
import {
	addResult,
	countSections,
	emptyCell,
	reportSections,
	summarySections,
	undecided,
} from './bench/report.js'
import { checkoutRevision, defaultBase } from './bench/revision.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
// Fresh bb worktrees have no node_modules; say so instead of a resolver stack trace.
if (!existsSync(join(ROOT, 'node_modules', 'three'))) {
	console.error(
		'node_modules is missing here. Run `bun install` first (fresh worktrees have none).',
	)
	process.exit(1)
}
const THREE = await import('three')
const { default: RAPIER } = await import('@dimforge/rapier3d-compat')
const { STEP } = await import('../src/core/app.js')
const { tune } = await import('../src/modes/moba/tune.js')
const { HEROES, listed } = await import('../src/modes/moba/heroes.js')
const { agentRoster } = await import('../src/modes/moba/agents.js')
const { botRandom } = await import('../src/modes/moba/bots.js')
const { playableMaps } = await import('../src/modes/moba/maps/all-maps.js')

// The game modules of one checkout. The working copy's are the ones imported above; a --base
// revision's come from its unpacked tree, so each side plays its own sim, bots and tune.
const loaded = new Map()
export function gameModules(root = ROOT) {
	if (!loaded.has(root)) {
		const at = (path) => import(pathToFileURL(join(root, path)).href)
		loaded.set(
			root,
			Promise.all(
				[
					'src/core/app.js',
					'src/core/tune.js',
					'src/modes/moba/tune.js',
					'src/modes/moba/agents.js',
					'src/modes/moba/obstacles.js',
					'src/modes/moba/agent-match.js',
					'src/modes/moba/maps/all-maps.js',
					'src/modes/moba/bots.js',
					'scripts/bench/report.js',
					'src/modes/moba/heroes.js',
				].map(at),
			).then(([app, core, moba, agents, obstacles, match, maps, bots, report, heroes]) => ({
				STEP: app.STEP,
				coreTune: core.tune,
				tune: moba.tune,
				agentRoster: agents.agentRoster,
				buildColliders: obstacles.buildColliders,
				createAgentMatch: match.createAgentMatch,
				matchRecipe: maps.matchRecipe,
				createBots: bots.createBots,
				matchReport: report.matchReport,
				HEROES: heroes.HEROES,
				baseline: new Map(),
			})),
		)
	}
	return loaded.get(root)
}

// Ordered team-kit pairs in rotation order; mirrors say nothing about a matchup, so a probe can drop them.
export function farmPairs(heroes, crossOnly = false) {
	return heroes
		.flatMap((first) => heroes.map((second) => [first, second]))
		.filter(([first, second]) => !crossOnly || first !== second)
}

// A team is one hero for all three seats, or a lineup like `kappa,ibis,random`. Practice fields
// `mixed`: Kappa, Ibis and a seeded random listed hero, drawn for A then B as practiceRoster does.
export const MIXED = 'kappa,ibis,random'
export function farmLineups(teams, seed) {
	const random = botRandom(seed, 'practice-roster')
	return teams.map((team) => {
		const heroes = team.split(',')
		return (heroes.length === 1 ? [team, team, team] : heroes).map((hero) =>
			hero === 'random' ? listed[Math.floor(random() * listed.length)] : hero,
		)
	})
}

export function farmRoster(heroes, difficulty, index, crossOnly = false, seed = tune.bots.seed) {
	// All ordered team-kit pairs, including mirrors unless crossOnly; seat files stay symmetric.
	const pairs = farmPairs(heroes, crossOnly)
	const lineups = farmLineups(pairs[index % pairs.length], seed)
	return agentRoster({ seats: [], difficulty }).map((seat) => ({
		...seat,
		heroId: lineups[seat.team === 'A' ? 0 : 1][Number(seat.id[1]) - 1],
	}))
}

// Seats for one match on one checkout: its agentRoster places them, the lineups say who plays.
// Idle seats stand still like a practice player who walked away; practice allies play normal.
function matchRoster(
	mods,
	lineups,
	{ difficulty, idle = [], practice = false, player = null, map = null },
) {
	const party = mods.matchRecipe(map ?? undefined).party
	if (party)
		return [lineups[0][0], ...party].map((heroId, i) => ({
			id: `A${i + 1}`,
			team: 'A',
			heroId,
			difficulty,
			controller:
				player?.id === `A${i + 1}` ? 'agent' : idle.includes(`A${i + 1}`) ? 'idle' : 'bot',
		}))
	const seats = player ? [player.id] : []
	return mods.agentRoster({ seats, idle, difficulty }).map((seat) => ({
		...seat,
		heroId: lineups[seat.team === 'A' ? 0 : 1][Number(seat.id[1]) - 1],
		difficulty: practice && seat.team === 'A' ? 'normal' : seat.difficulty,
	}))
}

// `--set kappa.speed=5.6`: a path into tune, or under tune.heroes when the first key isn't one.
// Paths through an `exp` object (`bots.exp.dive`) may name flags that don't exist yet.
function tuneSlot(path, root = tune) {
	if (
		path.split('.').some((key) => !key || ['__proto__', 'constructor', 'prototype'].includes(key))
	)
		throw new Error(`--set ${path}: invalid tune path`)
	for (const keys of [path.split('.'), ['heroes', ...path.split('.')]]) {
		let node = root
		for (const key of keys.slice(0, -1)) node = Object.hasOwn(node ?? {}, key) ? node[key] : null
		const last = keys.at(-1)
		if (node && typeof node[last] === 'number') return [node, last]
	}
	const keys = path.split('.')
	const expIndex = keys.indexOf('exp')
	if (expIndex >= 0 && expIndex < keys.length - 1) {
		let node = root
		for (const key of keys.slice(0, -1)) {
			if (node[key] === undefined) node[key] = {}
			node = node[key]
			if (typeof node !== 'object' || node === null) break
		}
		const last = keys.at(-1)
		if (
			typeof node === 'object' &&
			node &&
			['number', 'undefined', 'boolean'].includes(typeof node[last])
		)
			return [node, last]
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
	return axes.reduce(
		(grid, axis) => grid.flatMap((row) => axis.map((cell) => [...row, cell])),
		[[]],
	)
}

export const variantLabel = (variant) =>
	variant.map(([path, value]) => `${path}=${value}`).join(' ') || 'default'

export function applyVariant(variant, mods = { tune, baseline: defaultBaseline }) {
	for (const [node, key, value] of mods.baseline.values()) node[key] = value
	for (const [path, value] of variant) {
		const [node, key] = tuneSlot(path, mods.tune)
		if (!mods.baseline.has(path)) mods.baseline.set(path, [node, key, node[key]])
		node[key] = value
	}
}
const defaultBaseline = new Map()

// RAPIER.init() belongs to the caller, once per worker. No rendering or injected damage.
// `mods` picks the checkout whose game plays; the working copy by default.
export async function runFarmMatch({
	directory,
	matchId,
	seed,
	roster,
	maxSeconds,
	runId = matchId,
	commit = null,
	summary = false,
	sample = false,
	map = null,
	player = null,
	count = [],
	mods,
}) {
	mods ??= await gameModules()
	const { STEP, coreTune, buildColliders, createAgentMatch } = mods
	// A summary keeps only counters: no log, no tape, nothing on disk. `sample` adds per-tick bot states.
	const stats = summary
		? mods.matchReport(roster, { STEP, towerRange: mods.tune.tower.range, count })
		: null
	if (!summary) await mkdir(directory, { recursive: true })
	const filename = join(directory ?? '', `${matchId}.jsonl`)
	const partial = filename + '.partial'
	const tapeFilename = join(directory ?? '', `${matchId}.tape.json`)
	const tuneHash = createHash('sha256').update(JSON.stringify(mods.tune)).digest('hex')
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
		// No map plays createAgentMatch's default with the default walls.
		const recipe = map ? mods.matchRecipe(map) : undefined
		const { obstacles, bounds, settings } = recipe?.layout ?? {}
		unbuild = recipe
			? buildColliders(world, RAPIER, obstacles, bounds, settings?.scale ?? 1)
			: buildColliders(world, RAPIER)
		const allBot = roster.every((seat) => seat.controller === 'bot')
		match = createAgentMatch({
			recipe,
			scene: new THREE.Scene(),
			world,
			RAPIER,
			roster,
			seed,
			matchId,
			runId,
			commit,
			tuneHash,
			recordInputs: !allBot,
			capturePerception: false,
			onLog(row) {
				if (summary) return stats.row(row)
				buffer += JSON.stringify(row) + '\n'
				if (buffer.length >= 64 * 1024) flush()
			},
		})
		const drive = player
			? playerBot(mods, match.sim, recipe ?? mods.matchRecipe(), roster, seed, player)
			: () => []
		const limit = Math.ceil(maxSeconds / STEP)
		while (match.sim.tick < limit && match.step(drive())) if (sample && stats) stats.tick(match.sim)
		stats?.finish(match.sim)
		const reason = match.sim.lane?.match.winner ? 'matchOver' : 'limit'
		const tape = match.finish(reason, { hash: !summary })
		if (allBot) tape.botReplay = true
		tape.run_id = runId
		tape.commit = commit
		tape.tune_hash = tuneHash
		if (!summary)
			await writeFile(tapeFilename + '.partial', JSON.stringify(tape) + '\n', { flag: 'wx' })
		result = {
			matchId,
			seed,
			winner: tape.result.winner,
			hash: tape.result.hash,
			duration: tape.result.ticks * STEP,
			reason,
			filename,
			tapeFilename,
			report: stats?.report,
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

// `--player A1:north`: a stand-in human. Its own bot drives the seat, outside the team's lane deal
// (bots treat it as a human teammate), and lanes where asked: the chosen lane comes first in its view.
function playerBot(mods, sim, recipe, roster, seed, { id, lane }) {
	const mechanics = Object.values(recipe).filter(
		(mechanic) => mechanic && typeof mechanic === 'object',
	)
	const modules = [
		...new Set(
			mechanics.flatMap((mechanic) =>
				[mechanic.lane?.botHabit ?? mechanic.botHabit].filter(Boolean),
			),
		),
	]
	const bot = mods.createBots([roster.find((seat) => seat.id === id)], seed, modules)
	const lanes = sim.lanes ?? []
	if (lane && !lanes.some((laneEntry) => laneEntry.id === lane))
		throw new Error(
			`--player ${id}:${lane}: lanes are ${lanes.map((laneEntry) => laneEntry.id).join(', ')}`,
		)
	const ordered = lane ? [...lanes].sort((a, b) => (b.id === lane) - (a.id === lane)) : lanes
	const view = new Proxy(sim, { get: (target, key) => (key === 'lanes' ? ordered : target[key]) })
	return () => {
		const actions = []
		bot.step(view, { feed: (seat, frame) => actions.push([seat, frame]) })
		return actions
	}
}

// Only tune provenance differs by construction across schema revisions. All gameplay
// bytes still count: ordering, missing rows and whitespace must remain identical.
function firstLogDifference(base, working) {
	const logs = [base, working].map((log) =>
		log.toString('utf8').replace(/"tune_hash":"[a-f0-9]{64}"/g, '"tune_hash":null'),
	)
	if (logs[0] === logs[1]) return null
	const rows = logs.map((log) => log.split('\n'))
	let row = 0
	while (rows[0][row] === rows[1][row]) row++
	const [before, after] = rows.map((lines) => lines[row])
	const tick = JSON.parse(before || after || 'null')?.tick ?? 'n/a'
	let column = 0
	while (
		column < Math.min(before?.length ?? 0, after?.length ?? 0) &&
		before[column] === after[column]
	)
		column++
	const excerpt = (line) =>
		line === undefined ? '<EOF>' : JSON.stringify(line.slice(Math.max(0, column - 40), column + 80))
	return `row=${row + 1} tick=${tick} column=${column + 1} base=${excerpt(before)} working=${excerpt(after)}`
}

// The schema-migration probe: the same mixed rosters, seeds and provenance on both revisions.
async function sameReplays(values, { seed, matches, maxSeconds }) {
	const seeds = values.seeds?.split(',').map((value) => (value.trim() ? Number(value) : NaN))
	if (
		seeds &&
		!seeds.every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff)
	)
		throw new Error('--seeds must be comma-separated uint32 seeds')
	if (!seeds && seed + matches - 1 > 0xffffffff)
		throw new Error('Match count exceeds the available uint32 seeds')
	const lineups = values.lineup.length
		? values.lineup
		: ['mandador,ibis,lasso', 'salvia,lasso,mandador']
	if (lineups.length !== 2) throw new Error('--same needs two --lineup teams')
	for (const lineup of lineups) {
		const heroes = lineup.split(',')
		if (heroes.length !== 3 || heroes.some((hero) => !HEROES[hero]?.playable))
			throw new Error('--same --lineup needs three playable heroes')
	}
	const base = checkoutRevision(ROOT, values.same)
	const runId = `same-${crypto.randomUUID()}`
	const { release } = await reserveCores(1, {
		label: 'Identical replays',
		log: (line) => console.error(line),
	})
	try {
		await RAPIER.init({})
		const modules = await Promise.all([gameModules(base.root), gameModules()])
		const coverage = modules.map(() => ({ cast: new Set(), available: new Set() }))
		const replaySeeds = seeds ? [...new Set(seeds)] : null
		for (let index = 0; index < (replaySeeds?.length ?? matches); index++) {
			const matchSeed = replaySeeds?.[index] ?? seed + index
			const roster = farmRoster(lineups, values.difficulty, 0, true, matchSeed)
			const logs = []
			for (const [side, mods] of modules.entries()) {
				const result = await runFarmMatch({
					mods,
					roster,
					seed: matchSeed,
					maxSeconds,
					map: values.map ?? 'overthrow',
					directory: join(values.out, runId, side === 0 ? 'base' : 'working'),
					matchId: `seed-${matchSeed}`,
					runId,
					commit: null,
				})
				const log = await readFile(result.filename)
				logs.push(log)
				for (const seat of roster) {
					const hero = mods.HEROES[seat.heroId]
					for (const ability of [hero.basic, ...Object.values(hero.abilities)])
						if (ability?.id) coverage[side].available.add(ability.id)
				}
				for (const line of log.toString('utf8').trimEnd().split('\n')) {
					const row = JSON.parse(line)
					if (row.kind === 'cast' && row.ability_id) coverage[side].cast.add(row.ability_id)
				}
			}
			const difference = firstLogDifference(...logs)
			console.log(`seed=${matchSeed} ${difference ? `differs ${difference}` : 'identical'}`)
			if (difference) process.exitCode = 1
		}
		console.log(
			'coverage ' +
				coverage
					.map(({ cast, available }, side) => {
						const uncast = [...available].filter((ability) => !cast.has(ability)).sort()
						return `${side === 0 ? 'base' : 'working'} cast=${[...cast].sort().join(',') || 'none'} uncast=${uncast.join(',') || 'none'}`
					})
					.join(' | '),
		)
	} finally {
		release()
	}
}

const HELP = `bun run simulate [options]
Plays headless bot matches. Default: write logs and tapes for \`bun run simulate --logs runs\`; --summary prints tables.

Teams
  --heroes ibis,kappa   each team three of one hero; \`mixed\` is practice's kappa,ibis,random
  --lineup a,b,c            a team of those seats (repeatable); \`random\` draws a seeded listed hero
  --cross-only              skip mirror matchups
  --idle A1[,B2]            seats that stand still; --practice = idle A1, allies normal, enemies --difficulty
  --player A1[:north]       a stand-in human: its own bot plays the seat outside the team's lane deal, in that lane
  --difficulty hard         easy, normal or hard
  --map flagfall            overthrow or flagfall (default: the game's default map)
Sampling
  --matches N               default 4 for summaries, 20 for logs; rounded up to full matchup rotations; each rotation shares a seed
  --seed uint32  --max-seconds N  (a timeout has no winner)
  --set path=v[,v...]       override a tune number per variant (repeatable; flags make a grid)
                            bots.exp.<flag>=0,1 toggles a logic experiment; see docs/verify.md
  --quick                   --summary --cross-only --matches 4
Identical replay
  --same rev               compare logs byte for byte except tune_hash provenance; non-zero exit on any difference
                            mixed mandador/ibis/lasso vs salvia/lasso/mandador; defaults: seeds 2,3, 120 seconds
                            --seeds 2,3,6 gives explicit seeds; otherwise --seed starts them, --matches counts them (default 2)
                            --out keeps both logs; coverage lists cast and uncast roster abilities for each revision
                            supports two --lineup teams, --map, --difficulty and --jobs (runs on one core); no summary or balance options
Comparing (these imply --summary)
  --base [rev]              play the same seeds on another revision too (default: @- in jj,
                            HEAD with a dirty git tree, else origin/main) and print deltas
  --until N                 keep adding --matches rounds until the headline intervals decide, up to N
  --report                  per-ability, death-cause, damage-taken, bot-state and structure-fall sections
  --count flagTaken,...     count these fact kinds per team and match
Machine
  --jobs N                  worker threads (default cores − 2); a per-machine budget (FARM_CORES, default cores − 2) is
                            shared with other farms, which queue for it
  --out dir                 log directory (default runs/<date>)
Saved logs
  --logs path               analyse saved logs with DuckDB instead of playing; directory, file or glob`

function withBaseDefault(argv) {
	const baseIndex = argv.indexOf('--base')
	if (baseIndex < 0 || (argv[baseIndex + 1] !== undefined && !argv[baseIndex + 1].startsWith('--')))
		return argv
	return [...argv.slice(0, baseIndex + 1), defaultBase(ROOT), ...argv.slice(baseIndex + 1)]
}

export async function farm(argv = process.argv.slice(2)) {
	const { values } = parseArgs({
		args: withBaseDefault(argv),
		options: {
			help: { type: 'boolean' },
			logs: { type: 'string' },
			matches: { type: 'string' },
			heroes: { type: 'string' },
			lineup: { type: 'string', multiple: true, default: [] },
			difficulty: { type: 'string', default: 'hard' },
			map: { type: 'string' },
			jobs: { type: 'string' },
			'cross-only': { type: 'boolean' },
			summary: { type: 'boolean' },
			quick: { type: 'boolean' },
			report: { type: 'boolean' },
			count: { type: 'string' },
			base: { type: 'string' },
			same: { type: 'string' },
			until: { type: 'string' },
			idle: { type: 'string', multiple: true, default: [] },
			player: { type: 'string' },
			practice: { type: 'boolean' },
			set: { type: 'string', multiple: true, default: [] },
			seed: { type: 'string' },
			seeds: { type: 'string' },
			'max-seconds': { type: 'string' },
			out: { type: 'string', default: `runs/${new Date().toISOString().slice(0, 10)}` },
		},
	})
	if (values.help) return console.log(HELP)
	if (values.seeds !== undefined) {
		if (!values.same) throw new Error('--seeds requires --same')
		if (values.seed !== undefined || values.matches !== undefined)
			throw new Error('--seeds cannot be combined with --seed or --matches')
	}
	if (values.same) {
		for (const option of [
			'base',
			'logs',
			'summary',
			'quick',
			'report',
			'count',
			'until',
			'set',
			'heroes',
			'cross-only',
			'idle',
			'player',
			'practice',
		]) {
			const value = values[option]
			if (Array.isArray(value) ? value.length : value)
				throw new Error(`--same cannot be combined with --${option}`)
		}
	}
	if (values.map && !playableMaps.includes(values.map))
		throw new Error(`--map ${values.map}: expected ${playableMaps.join(' or ')}`)
	if (values.logs) {
		const path =
			existsSync(values.logs) && statSync(values.logs).isDirectory()
				? join(values.logs, '**', '*.jsonl')
				: values.logs
		const sqlText = await readFile(new URL('./balance.sql', import.meta.url), 'utf8')
		const result = spawnSync(
			'duckdb',
			[
				'-no-init',
				'-bail',
				'-markdown',
				'-c',
				`SET VARIABLE logs = '${path.replaceAll("'", "''")}';\n${sqlText}`,
			],
			{ stdio: 'inherit' },
		)
		if (result.error)
			throw new Error(`Saved-log analysis requires the DuckDB CLI: ${result.error.message}`)
		if (result.status !== 0) throw new Error('Saved-log analysis failed')
		return
	}
	const summary = !!(
		values.summary ||
		values.quick ||
		values.base ||
		values.until ||
		values.report ||
		values.count
	)
	const crossOnly = values['cross-only'] || values.quick
	const requestedMatches = Number(values.matches ?? (values.same ? 2 : summary ? 4 : 20)),
		jobs = Number(values.jobs ?? coreBudget()),
		seed = Number(values.seed ?? tune.bots.seed),
		maxSeconds = Number(values['max-seconds'] ?? (values.same ? 120 : tune.agents.maxSeconds * 4))
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
	if (values.same) return sameReplays(values, { seed, matches: requestedMatches, maxSeconds })
	const idle = [
		...new Set([
			...(values.practice ? ['A1'] : []),
			...values.idle.flatMap((list) => list.split(',').map((id) => id.trim())),
		]),
	].filter(Boolean)
	const [playerId, playerLane] = values.player?.split(':') ?? []
	const player = playerId ? { id: playerId.trim(), lane: playerLane?.trim() || null } : null
	agentRoster({ seats: player ? [player.id] : [], idle, difficulty: values.difficulty })
	const requested = [
		...new Set(
			(values.heroes ?? (values.lineup.length ? '' : 'ibis,kappa'))
				.split(',')
				.map((hero) => hero.trim())
				.filter(Boolean),
		),
	]
	const lineups = [...new Set(requested.includes('mixed') ? [MIXED] : []), ...values.lineup]
		.map((lineup) => lineup.split(',').map((hero) => hero.trim()))
		.map((lineup) => {
			const unknown = lineup.find((hero) => hero !== 'random' && !HEROES[hero]?.playable)
			if (unknown) throw new Error(`--lineup: ${unknown} is not a playable hero`)
			if (lineup.length !== 3) throw new Error('--lineup needs three heroes')
			return lineup.join(',')
		})
	const singles = requested.filter((hero) => hero !== 'mixed')
	const heroes = [...singles.filter((hero) => Object.hasOwn(HEROES, hero)), ...new Set(lineups)]
	for (const hero of singles.filter((hero) => !Object.hasOwn(HEROES, hero))) {
		if (hero !== 'kappa') throw new Error(`Unknown hero: ${hero}`)
		console.warn('Kappa is not available in this checkout; skipping her matchups.')
	}
	if (!heroes.length) throw new Error('No available heroes requested')
	const pairList = farmPairs(heroes, crossOnly)
	const pairs = pairList.length
	if (!pairs) throw new Error('--cross-only needs at least two heroes')
	const variants = parseSets(values.set)
	const round = (count) => Math.ceil(count / pairs) * pairs
	const matches = round(requestedMatches)
	const cap = values.until ? round(Number(values.until)) : matches
	if (!Number.isSafeInteger(cap) || cap < matches)
		throw new Error('--until must be a match count at least --matches')
	if (seed + cap / pairs - 1 > 0xffffffff)
		throw new Error('Match count exceeds the available uint32 seeds')
	if (matches !== requestedMatches)
		console.log(
			`Rounded ${requestedMatches} matches up to ${matches} for complete ${pairs}-match rotations.`,
		)
	// Plain git worktrees have no jj repo; fall back to git's HEAD.
	const head = (command, args) => {
		const revision = spawnSync(command, args, { encoding: 'utf8', cwd: ROOT })
		const id = revision.stdout?.trim()
		return revision.status === 0 && /^[0-9a-f]{40}$/.test(id ?? '') ? id : null
	}
	const commit =
		head('jj', ['log', '-r', '@', '--no-graph', '-T', 'commit_id']) ??
		head('git', ['rev-parse', 'HEAD'])
	if (!commit) throw new Error('Cannot record the farm commit: jj log and git rev-parse failed')
	const sides = []
	if (values.base) {
		const base = checkoutRevision(ROOT, values.base)
		sides.push({ label: `base ${values.base}`, root: base.root, commit: base.commit })
	}
	sides.push({ label: 'working copy', root: ROOT, commit })
	for (const side of sides) side.cells = variants.map(() => emptyCell())
	const runId = crypto.randomUUID()
	const perRound = sides.length * variants.length * matches
	console.log(
		`run=${runId} commit=${commit.slice(0, 12)}${values.base ? ` base=${values.base} (${sides[0].commit.slice(0, 12)})` : ''} matches=${matches}${values.until ? ` until ${cap}` : ''}${variants.length > 1 ? ` x ${variants.length} variants` : ''}${sides.length > 1 ? ' x 2 revisions' : ''}${idle.length ? ` idle=${idle}` : ''}${values.player ? ` player=${values.player}` : ''}${values.map ? ` map=${values.map}` : ''}`,
	)
	const { cores, budget, release } = await reserveCores(Math.min(jobs, perRound), {
		log: (line) => console.log(line),
		label: `${values.base ? 'A/B ' : ''}${heroes.join(' v ')}`,
	})
	if (cores < Math.min(jobs, perRound))
		console.log(`Sharing the machine: ${cores} of ${budget} cores free, running ${cores} jobs.`)

	// Match `index` across rounds plays seed + index / pairs; every side and variant plays it.
	const task = (index, side, variant) => {
		const pair = pairList[index % pairs]
		const taskSeed = seed + Math.floor(index / pairs)
		const drawn = farmLineups(pair, taskSeed)
		return {
			side,
			variant,
			seed: taskSeed,
			lineups: drawn,
			// Lineups report the heroes their random seats drew.
			pair: pair.some((team) => team.includes(','))
				? drawn.map((lineup) => lineup.join(','))
				: pair,
			matchId: `${runId}-${sides.length > 1 ? `s${side}-` : ''}${String(index * variants.length + variant + 1).padStart(5, '0')}`,
		}
	}
	const workers = []
	let completed = 0,
		wins = 0,
		played = 0
	const failed = new Promise((_, reject) => (workers.reject = reject))
	const shared = {
		summary,
		sample: !!values.report,
		count: values.count?.split(',').filter(Boolean) ?? [],
		map: values.map ?? null,
		difficulty: values.difficulty,
		idle,
		player,
		practice: !!values.practice,
		maxSeconds,
		directory: values.out,
		runId,
		roots: sides.map((side) => side.root),
		commits: sides.map((side) => side.commit),
		variants,
	}

	const runRound = (from, to) => {
		const queue = []
		for (let index = from; index < to; index++)
			for (let variant = 0; variant < variants.length; variant++)
				for (let side = 0; side < sides.length; side++) queue.push(task(index, side, variant))
		const total = queue.length
		let done = 0
		return Promise.race([
			failed,
			new Promise((resolve) => {
				const feed = (worker) => {
					const next = queue.shift()
					if (next) worker.postMessage(next)
				}
				for (const worker of workers) {
					worker.removeAllListeners('message')
					worker.on('message', (result) => {
						completed++
						done++
						if (result.winner) wins++
						if (summary) {
							addResult(sides[result.side].cells[result.variant], result)
							process.stderr.write('.')
						} else
							console.log(
								`${completed}/${total} ${result.matchId} seed=${result.seed} winner=${result.winner ?? 'none'} ${result.duration.toFixed(1)}s ${result.reason} hash=${result.hash} tape=${result.tapeFilename}`,
							)
						if (done === total) resolve()
						else feed(worker)
					})
					feed(worker)
				}
			}),
		])
	}
	let stopping = false
	try {
		for (let i = 0; i < cores; i++) {
			const worker = new Worker(new URL(import.meta.url), { workerData: shared })
			worker.on('error', (error) => workers.reject(error))
			worker.on('exit', (code) => {
				if (!stopping) workers.reject(new Error(`Farm worker exited unexpectedly (${code})`))
			})
			workers.push(worker)
		}
		for (;;) {
			const next = Math.min(played + matches, cap)
			await runRound(played, next)
			played = next
			if (!values.until) break
			const { open, all } = undecided(sides.at(-1).cells, sides.length > 1 ? sides[0].cells : null)
			process.stderr.write('\n')
			if (!open || played >= cap) {
				console.log(
					`Stopped at ${played} matches per ${sides.length > 1 ? 'side and ' : ''}variant: ${all - open} of ${all} headline rates decided${open ? `, cap ${cap} reached` : ''}.`,
				)
				break
			}
			console.log(
				`${played} matches: ${open} of ${all} headline rates undecided, adding ${Math.min(matches, cap - played)}.`,
			)
		}
	} finally {
		stopping = true
		await Promise.all(workers.map((worker) => worker.terminate()))
		release()
	}
	if (summary) {
		process.stderr.write('\n')
		const labels = variants.map(variantLabel)
		if (values.until)
			console.log('Exploratory stopping: intervals are not sequentially valid confidence bounds.')
		console.log(summarySections(sides, labels))
		if (values.report) console.log(reportSections(sides))
		if (shared.count.length) console.log(countSections(sides, labels, shared.count))
		console.log(
			`${completed} matches: ${wins} winners, ${completed - wins} timeouts${sides.length > 1 ? `; base ${values.base} = ${sides[0].commit.slice(0, 12)}` : ''}`,
		)
		return
	}
	console.log(`${completed} matches: ${wins} winners, ${completed - wins} timeouts; ${values.out}`)
}

if (!isMainThread) {
	await RAPIER.init({})
	const { roots, commits, variants } = workerData
	parentPort.on('message', async (task) => {
		const mods = await gameModules(roots[task.side])
		applyVariant(variants[task.variant], mods)
		const result = await runFarmMatch({
			...workerData,
			mods,
			seed: task.seed,
			matchId: task.matchId,
			commit: commits[task.side],
			roster: matchRoster(mods, task.lineups, workerData),
		})
		parentPort.postMessage({ ...result, side: task.side, variant: task.variant, pair: task.pair })
	})
} else if (import.meta.main) {
	farm().catch((error) => {
		console.error(error.message)
		process.exitCode = 1
	})
}
