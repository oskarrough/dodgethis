import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, statSync, openSync, writeSync, closeSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { Worker, isMainThread, workerData, parentPort } from 'node:worker_threads'
import { coreBudget, reserveCores } from './bench/cores.js'
import { addResult, emptyCell, reportSections, summarySections, undecided } from './bench/report.js'
import { matchReport } from './bench/report.js'
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
const { tune } = await import('../src/plugins/moba/tune.js')
const { HEROES, listed } = await import('../src/plugins/moba/heroes.js')
const { agentRoster } = await import('../src/plugins/moba/agents.js')
const { botRandom } = await import('../src/plugins/moba/bots.js')
const { playableMaps } = await import('../src/plugins/moba/maps/index.js')

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
					'src/plugins/moba/tune.js',
					'src/plugins/moba/agents.js',
					'src/plugins/moba/obstacles.js',
					'src/plugins/moba/agent-match.js',
					'src/plugins/moba/maps/index.js',
					'src/plugins/moba/bots.js',
				].map(at),
			).then(([app, core, moba, agents, obstacles, match, maps, bots]) => ({
				STEP: app.STEP,
				coreTune: core.tune,
				tune: moba.tune,
				agentRoster: agents.agentRoster,
				buildColliders: obstacles.buildColliders,
				createAgentMatch: match.createAgentMatch,
				matchRecipe: maps.matchRecipe,
				createBots: bots.createBots,
				baseline: new Map(),
			})),
		)
	}
	return loaded.get(root)
}

// Ordered team-kit pairs in rotation order; mirrors say nothing about a matchup, so a probe can drop them.
export function farmPairs(heroes, crossOnly = false) {
	return heroes.flatMap((a) => heroes.map((b) => [a, b])).filter(([a, b]) => !crossOnly || a !== b)
}

// A team is one hero for all three seats, or a lineup like `mitts,fletcher,random`. Practice fields
// `mixed`: Mitts, Fletcher and a seeded random listed hero, drawn for A then B as practiceRoster does.
export const MIXED = 'mitts,fletcher,random'
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
function matchRoster(mods, lineups, { difficulty, idle = [], practice = false, player = null }) {
	const seats = player ? [player.id] : []
	return mods.agentRoster({ seats, idle, difficulty }).map((seat) => ({
		...seat,
		heroId: lineups[seat.team === 'A' ? 0 : 1][Number(seat.id[1]) - 1],
		difficulty: practice && seat.team === 'A' ? 'normal' : seat.difficulty,
	}))
}

// `--set mitts.speed=5.6`: a path into tune, or under tune.heroes when the first key isn't one.
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
	const exp = keys.indexOf('exp')
	if (exp >= 0 && exp < keys.length - 1) {
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
	mods,
}) {
	mods ??= await gameModules()
	const { STEP, coreTune, buildColliders, createAgentMatch } = mods
	// A summary keeps only counters: no log, no tape, nothing on disk. `sample` adds per-tick bot states.
	const stats = summary ? matchReport(roster, { STEP, towerRange: mods.tune.tower.range }) : null
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
			recordInputs: false,
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
	const pieces = Object.values(recipe).filter((piece) => piece && typeof piece === 'object')
	const modules = [
		...new Set(pieces.flatMap((piece) => [piece.lane?.botHabit ?? piece.botHabit].filter(Boolean))),
	]
	const bot = mods.createBots([roster.find((seat) => seat.id === id)], seed, modules)
	const lanes = sim.lanes ?? []
	if (lane && !lanes.some((l) => l.id === lane))
		throw new Error(`--player ${id}:${lane}: lanes are ${lanes.map((l) => l.id).join(', ')}`)
	const ordered = lane ? [...lanes].sort((a, b) => (b.id === lane) - (a.id === lane)) : lanes
	const view = new Proxy(sim, { get: (t, k) => (k === 'lanes' ? ordered : t[k]) })
	return () => {
		const actions = []
		bot.step(view, { feed: (seat, frame) => actions.push([seat, frame]) })
		return actions
	}
}

const HELP = `bun run simulate [options]
Plays headless bot matches. Default: write logs and tapes for \`bun run simulate --logs runs\`; --summary prints tables.

Teams
  --heroes fletcher,mitts   each team three of one hero; \`mixed\` is practice's mitts,fletcher,random
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
                            bots.exp.<flag>=0,1 toggles a logic experiment; see docs/verification.md
  --quick                   --summary --cross-only --matches 4
Comparing (all imply --summary)
  --base [rev]              play the same seeds on another revision too (default: @- in jj,
                            HEAD with a dirty git tree, else origin/main) and print deltas
  --until N                 keep adding --matches rounds until the headline intervals decide, up to N
  --report                  per-ability, death-cause, damage-taken and bot-state sections
Machine
  --jobs N                  worker threads (default 2); a per-machine budget (FARM_CORES, default cores − 2) is
                            shared with other farms, which queue for it
  --out dir                 log directory (default runs/<date>)
Saved logs
  --logs path               analyse saved logs with DuckDB instead of playing; directory, file or glob`

function withBaseDefault(argv) {
	const i = argv.indexOf('--base')
	if (i < 0 || (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--'))) return argv
	return [...argv.slice(0, i + 1), defaultBase(ROOT), ...argv.slice(i + 1)]
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
			base: { type: 'string' },
			until: { type: 'string' },
			idle: { type: 'string', multiple: true, default: [] },
			player: { type: 'string' },
			practice: { type: 'boolean' },
			set: { type: 'string', multiple: true, default: [] },
			seed: { type: 'string', default: String(tune.bots.seed) },
			'max-seconds': { type: 'string', default: String(tune.agents.maxSeconds * 4) },
			out: { type: 'string', default: `runs/${new Date().toISOString().slice(0, 10)}` },
		},
	})
	if (values.help) return console.log(HELP)
	if (values.map && !playableMaps.includes(values.map))
		throw new Error(`--map ${values.map}: expected ${playableMaps.join(' or ')}`)
	if (values.logs) {
		const path =
			existsSync(values.logs) && statSync(values.logs).isDirectory()
				? join(values.logs, '**', '*.jsonl')
				: values.logs
		const sql = await readFile(new URL('./balance.sql', import.meta.url), 'utf8')
		const result = spawnSync(
			'duckdb',
			[
				'-no-init',
				'-bail',
				'-markdown',
				'-c',
				`SET VARIABLE logs = '${path.replaceAll("'", "''")}';\n${sql}`,
			],
			{ stdio: 'inherit' },
		)
		if (result.error)
			throw new Error(`Saved-log analysis requires the DuckDB CLI: ${result.error.message}`)
		if (result.status !== 0) throw new Error('Saved-log analysis failed')
		return
	}
	const summary = !!(values.summary || values.quick || values.base || values.until || values.report)
	const crossOnly = values['cross-only'] || values.quick
	const requestedMatches = Number(values.matches ?? (summary ? 4 : 20)),
		jobs = Number(values.jobs ?? Math.min(2, coreBudget())),
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
			(values.heroes ?? (values.lineup.length ? '' : 'fletcher,mitts'))
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
		if (hero !== 'mitts') throw new Error(`Unknown hero: ${hero}`)
		console.warn('Mitts is not available in this checkout; skipping her matchups.')
	}
	if (!heroes.length) throw new Error('No available heroes requested')
	const pairList = farmPairs(heroes, crossOnly)
	const pairs = pairList.length
	if (!pairs) throw new Error('--cross-only needs at least two heroes')
	const variants = parseSets(values.set)
	const round = (n) => Math.ceil(n / pairs) * pairs
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
			pair: pair.some((team) => team.includes(',')) ? drawn.map((l) => l.join(',')) : pair,
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
								`${completed}/${total} ${result.matchId} seed=${result.seed} winner=${result.winner ?? 'none'} ${result.duration.toFixed(1)}s ${result.reason}`,
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
	parentPort.on('message', async (t) => {
		const mods = await gameModules(roots[t.side])
		applyVariant(variants[t.variant], mods)
		const result = await runFarmMatch({
			...workerData,
			mods,
			seed: t.seed,
			matchId: t.matchId,
			commit: commits[t.side],
			roster: matchRoster(mods, t.lineups, workerData),
		})
		parentPort.postMessage({ ...result, side: t.side, variant: t.variant, pair: t.pair })
	})
} else if (import.meta.main) {
	farm().catch((error) => {
		console.error(error.message)
		process.exitCode = 1
	})
}
