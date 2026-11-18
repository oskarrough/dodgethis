// Screenshots of a moba match on the shared dev server, at 1600×900, on this box's GPU. `bun run shot --help`.
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import {
	bootMatch,
	browserSession,
	devServer,
	GPU_ARGS,
	holdCaptureLock,
	run,
	UNCAPPED_ARGS,
	waitForMatch,
} from './capture.js'
import { call, measure, runModule, seatLineup, setTunes } from './shot-page.js'

const root = join(import.meta.dir, '..')
// Lane minions in team colour, and the Wardens' servants (packs-view.js) dressed over the same bodies.
const MOBS = {
	melee: null,
	ranged: null,
	brute: null,
	jar: 'melee',
	slinger: 'ranged',
	bearer: 'brute',
}
// One Warden per encounter folder; tinajaBotijo holds two.
const WARDENS = readdirSync(join(root, 'src/modes/moba/encounters'), { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.flatMap(({ name }) => name.split(/(?=[A-Z])/).map((part) => part.toLowerCase()))

const HELP = `bun run shot <map> [options]

Boots a match on <map> and screenshots named spots: \`start\` plus the map tune's \`shots\`.
Prints each file it writes, then triangles and draw calls. Writes shot.log beside them.

Where and what
  --spots a,b        only these spots (with --photo: these poses)
  --at=x,z           one spot, or where a lineup stands (negative x: --at=-36,0)
  --photo            freeze, hide the HUD and shoot fixed poses: the tune's \`photos\`, else wide, rim and lane
                     (add topdown to --spots for a straight-down survey)
  --hud              keep the HUD in --photo shots (match spots and lineups keep it anyway)
  --crop x,y,w,h     crop every frame to this box (in 1600×900 pixels) before anything else is made from it
  --lineup [ids]     stand a row facing the camera, frozen, as lineup.png. Bare: every playable hero.
                     Ids: heroes, mob:<kind> (${Object.keys(MOBS).join(', ')}),
                     warden:<id> (${WARDENS.join(', ')}),
                     or the groups heroes, mobs, wardens. Finds a clear patch unless --at says where.
  --read             with --lineup, read.png: the row in colour over the row in grayscale at a third of its size

The match
  --hero id          your hero (ibis)
  --seed n           match seed (2)
  --light name       time of day, or random
  --tune path=value  set a tune value for this run only, then restart the match; repeatable.
                     Paths mirror the tune object: overthrow.floor.base='#3a3430', hero.speed=7, core.physics.gravity=20.
                     Values are JSON where they parse, else strings. Values read once at import need a file edit.
  --eval file.js     after boot (and --tune, --lineup), before the shots, run this module in the page.
                     Import from the dev server by path ('/src/modes/moba/…'). A default export is called
                     with { dt, moba, sim, tune } and may be async; what it returns is printed as eval=…

Pictures beside the frame
  --gray             also <spot>-gray.png
  --compare img      <spot>-compare.png: target, frame and grey side by side
  --save name        keep this run's frames as \`name\`, for --vs later (per map, in thread storage)
  --vs name          <spot>-vs-<name>.png: the saved frame beside this one, colour above, grayscale below

Measuring
  --fps              5 s of frame timing on the GPU with vsync off, before the shots: fps, frame and cpu ms

Output goes to --out dir, else $BB_THREAD_STORAGE/shots/<map>. It exits non-zero on a page error, an empty
frame (triangles=0) or a failed step, and prints the first line of the trouble as "✗ …".`

const fail = (message) => {
	console.error(`✗ ${message}`)
	process.exit(1)
}

// A bare --lineup means every playable hero.
const argv = Bun.argv.slice(2)
const bare = argv.indexOf('--lineup')
if (bare >= 0 && (bare === argv.length - 1 || argv[bare + 1].startsWith('--')))
	argv.splice(bare + 1, 0, 'heroes')
let parsed
try {
	parsed = parseArgs({
		args: argv,
		allowPositionals: true,
		options: {
			help: { type: 'boolean', short: 'h' },
			spots: { type: 'string' },
			at: { type: 'string' },
			out: { type: 'string' },
			gray: { type: 'boolean', default: false },
			read: { type: 'boolean', default: false },
			compare: { type: 'string' },
			photo: { type: 'boolean', default: false },
			hud: { type: 'boolean', default: false },
			crop: { type: 'string' },
			seed: { type: 'string', default: '2' },
			light: { type: 'string' },
			hero: { type: 'string', default: 'ibis' },
			lineup: { type: 'string' },
			tune: { type: 'string', multiple: true, default: [] },
			eval: { type: 'string' },
			save: { type: 'string' },
			vs: { type: 'string' },
			fps: { type: 'boolean', default: false },
		},
	})
} catch (error) {
	fail(`${error.message} (bun run shot --help)`)
}
const { values, positionals } = parsed
if (values.help) {
	console.log(HELP)
	process.exit(0)
}
const map = positionals[0]
if (!map) fail('name a map: bun run shot <map> (bun run shot --help)')

// Option checks, all before the browser starts.
const numbers = (text, count, flag) => {
	const parts = text.split(',').map(Number)
	if (parts.length !== count || !parts.every(Number.isFinite))
		fail(`--${flag} takes ${count} numbers, comma-separated (got "${text}")`)
	return parts
}
const at = values.at && numbers(values.at, 2, 'at')
const crop = values.crop && numbers(values.crop, 4, 'crop')
if (at && values.photo && !values.lineup)
	fail('--at points the match camera; --photo has its own poses')
if (values.compare && !existsSync(values.compare)) fail(`no target image at ${values.compare}`)
if (values.eval && !existsSync(values.eval)) fail(`no module at ${values.eval}`)
const tunes = values.tune.map((pair) => {
	const i = pair.indexOf('=')
	if (i < 1) fail(`--tune takes path=value (got "${pair}")`)
	const raw = pair.slice(i + 1)
	let value = raw
	try {
		value = JSON.parse(raw)
	} catch {}
	return [pair.slice(0, i), value]
})
const storage = process.env.BB_THREAD_STORAGE ?? '/tmp'
const saved = (name) => join(storage, 'shots', 'saved', map, name)
if (values.vs && !existsSync(saved(values.vs)))
	fail(`nothing saved as "${values.vs}" for ${map}; take one with --save ${values.vs}`)

const { HEROES } = await import(join(root, 'src/modes/moba/heroes.js'))
const playable = Object.keys(HEROES).filter((id) => HEROES[id].playable)
if (!playable.includes(values.hero))
	fail(`no playable hero "${values.hero}" (${playable.join(', ')})`)
const GROUPS = {
	heroes: () => playable,
	mobs: () => Object.keys(MOBS).map((k) => `mob:${k}`),
	wardens: () => WARDENS.map((id) => `warden:${id}`),
}
const lineup =
	values.lineup &&
	values.lineup
		.split(',')
		.flatMap((token) => GROUPS[token]?.() ?? [token])
		.map((token) => {
			const [kind, id] = token.includes(':') ? token.split(':') : ['hero', token]
			if (kind === 'hero' && playable.includes(id)) return { token, kind, id }
			if (kind === 'mob' && id in MOBS)
				return { token, kind, id, base: MOBS[id] ?? id, dress: MOBS[id] !== null }
			if (kind === 'warden' && WARDENS.includes(id)) return { token, kind, id }
			fail(
				`can't seat "${token}". Heroes: ${playable.join(', ')}; mob:${Object.keys(MOBS).join('|')}; warden:${WARDENS.join('|')}`,
			)
		})

const tuneFile = join(root, 'src/modes/moba/maps', map, `${map}-tune.js`)
const mapTune = await import(tuneFile).catch(() => ({}))
const shots = { ...mapTune.shots }
if (at && !lineup) shots.at = at
let names =
	at && !lineup
		? ['at']
		: values.spots
			? values.spots.split(',')
			: ['start', ...Object.keys(mapTune.shots ?? {})]
if (lineup) names = ['lineup']
for (const name of values.photo || lineup ? [] : names)
	if (name !== 'start' && !shots[name])
		fail(`no spot "${name}" in ${map}-tune.js shots (${Object.keys(shots).join(', ') || 'none'})`)

holdCaptureLock() // browser work on this box queues behind other captures

const out = resolve(values.out ?? join(storage, 'shots', map))
mkdirSync(out, { recursive: true })
const logFile = join(out, 'shot.log')
const log = []
const say = (line) => {
	log.push(line)
	console.log(line)
}

const {
	browser,
	evaluate,
	errors,
	console: pageConsole,
	close,
} = browserSession(`shot-${process.env.BB_THREAD_ID ?? 'x'}-${map}`, {
	args: values.fps ? UNCAPPED_ARGS : GPU_ARGS,
})

const url = devServer()
const topdown = values.photo && values.spots?.split(',').includes('topdown')
const page = `${url}?mode=moba&play&map=${map}&hero=${values.hero}&bots=easy&seed=${values.seed}${topdown ? '&fog=0' : ''}${values.light ? `&light=${encodeURIComponent(values.light)}` : ''}`
const magick = (...args) => run('magick', args.flat())
const hudPose = values.hud ? { hud: true } : {}
let trouble = null

try {
	bootMatch({ browser }, page)
	if (tunes.length) {
		evaluate(call(setTunes, tunes))
		waitForMatch({ browser })
		say(`tune ${tunes.map(([p, v]) => `${p}=${JSON.stringify(v)}`).join(' ')}`)
	}
	if (values.light) {
		const light = evaluate('dt.game.moba.setup.light')
		if (values.light !== 'random' && light !== values.light)
			throw new Error(`requested light ${values.light}, got ${light}`)
		say(`light=${light}`)
	}
	const start = evaluate(
		'(() => { const p = dt.game.moba.sim.heroes[0].body.position; return [p.x, p.y, p.z] })()',
	)

	let row = null
	if (lineup) {
		row = evaluate(
			call(seatLineup, { entries: lineup, at, preferred: mapTune.shots?.lineup ?? null }),
		)
		if (row.blocked) say(`warning: part of the row at ${at} stands in a wall`)
		if (row.span > 16 && !values.photo)
			say(`warning: a ${Math.round(row.span)} m row is wider than the match camera; add --photo`)
		say(`lineup at ${row.x.toFixed(1)},${row.z.toFixed(1)}`)
		browser('wait', '1200')
		if (!values.photo) evaluate('dt.photo({ hud: true })')
	}

	if (values.eval) {
		const result = evaluate(call(runModule, readFileSync(values.eval, 'utf8')))
		if (result !== null) say(`eval=${JSON.stringify(result)}`)
		browser('wait', '600')
	}

	if (values.fps) {
		const { fps, samples, ms } = evaluate(call(measure, 5))
		say(
			`fps=${fps} frames=${samples} frame ms mean ${ms.frame?.mean} p95 ${ms.frame?.p95} max ${ms.frame?.max}, cpu ms p95 ${ms.cpu?.p95}, render ms p95 ${ms.render?.p95}`,
		)
	}

	// Camera poses from the court's half extents: high over the middle, low across the near rim, down the lane.
	const photos =
		values.photo &&
		(row
			? {
					lineup: {
						eye: [row.x, row.y + 5, row.z + Math.max(13, row.span * 0.75)],
						target: [row.x, row.y + 1, row.z],
						fov: 40,
					},
				}
			: (mapTune.photos ??
				(({ halfX: x, halfZ: z }) => ({
					wide: { eye: [0, x * 1.2, x], target: [0, 0, 0], fov: 40 },
					rim: { eye: [-x * 0.35, 3, z + 5], target: [x * 0.15, 1, -z], fov: 55 },
					lane: { eye: [-x - 6, 9, 0], target: [0, 0, 0], fov: 45 },
				}))(evaluate('dt.game.moba.sim.bounds'))))
	if (photos) {
		// Opt-in survey pose, with enough margin to keep the whole court in frame.
		if (topdown) {
			const { halfX, halfZ } = evaluate('dt.game.moba.sim.bounds')
			const height = (Math.max(halfZ, halfX / (1600 / 900)) * 1.08) / Math.tan(Math.PI / 6)
			photos.topdown = { eye: [0, height, 0], target: [0, 0, 0], fov: 60 }
		}
		names = values.spots && !row ? values.spots.split(',') : Object.keys(photos)
		const missing = names.find((name) => !photos[name])
		if (missing) throw new Error(`no photo "${missing}" (${Object.keys(photos).join(', ')})`)
	}

	let moved = false
	for (const name of names) {
		if (photos) {
			evaluate(`dt.photo(${JSON.stringify({ ...photos[name], ...hudPose })})`)
			browser('wait', '600')
		} else if (!row && (name !== 'start' || moved)) {
			// `start` after another spot walks back to where the match began.
			const [x, y, z] = name === 'start' ? start : [shots[name][0], null, shots[name][1]]
			evaluate(`(() => {
				const m = dt.game.moba, b = m.sim.heroes[0].body
				b.place(${x}, ${y ?? 'b.position.y + 2'}, ${z})
				m.focus({ x: ${x}, z: ${z} })
			})()`)
			moved = name !== 'start'
			browser('wait', '1200')
		}
		const file = join(out, `${photos && !row ? 'photo-' : ''}${name}.png`)
		browser('screenshot', file)
		// About 130 px a hero at the match camera, so the crop holds the row and its names and bars.
		if (values.read && row) {
			const width = Math.min(1600, lineup.length * 130 + 60)
			const box = `${width}x170+${Math.round(800 - width / 2)}+325`
			const read = join(out, 'read.png')
			magick(
				['(', file, '-crop', box, '+repage', '-resize', '200%', ')'],
				['(', file, '-crop', box, '+repage', '-colorspace', 'Gray', '-resize', '34%'],
				['-filter', 'point', '-resize', '588%', ')', '-append', read],
			)
			say(read)
		}
		if (crop) {
			const [x, y, w, h] = crop
			magick(file, '-crop', `${w}x${h}+${x}+${y}`, '+repage', file)
		}
		say(file)
		if (values.gray) {
			const gray = file.replace(/\.png$/, '-gray.png')
			magick(file, '-colorspace', 'Gray', gray)
			say(gray)
		}
		// Target, frame and grey side by side at half size, so a judge needs one look.
		if (values.compare) {
			const compare = file.replace(/\.png$/, '-compare.png')
			magick(
				[resolve(values.compare), file, '(', file, '-colorspace', 'Gray', ')'],
				['-resize', '800x450^', '-gravity', 'center', '-extent', '800x450', '+append', compare],
			)
			say(compare)
		}
		// Saved frame beside this one, colour above and grayscale below, each pane at most 800 wide.
		if (values.vs) {
			const before = join(saved(values.vs), file.split('/').pop())
			if (!existsSync(before)) say(`warning: no saved ${values.vs} frame for ${name}`)
			else {
				const vs = file.replace(/\.png$/, `-vs-${values.vs}.png`)
				const pane = (image, label) => [
					'(',
					image,
					'-resize',
					'800x>',
					'-gravity',
					'northwest',
					'-fill',
					'white',
					'-undercolor',
					'#000a',
					'-pointsize',
					'22',
					'-annotate',
					'+10+8',
					` ${label} `,
					')',
				]
				magick(
					['(', ...pane(before, values.vs), ...pane(file, values.save ?? 'now'), '+append', ')'],
					['(', '+clone', '-colorspace', 'Gray', ')', '-append', vs],
				)
				say(vs)
			}
		}
		if (values.save) {
			mkdirSync(saved(values.save), { recursive: true })
			copyFileSync(file, join(saved(values.save), file.split('/').pop()))
		}
	}
	if (values.save) say(`saved as ${values.save}; compare later with --vs ${values.save}`)

	const info = evaluate(
		'(() => { const r = dt.game.renderer.info.render; return [r.triangles, r.calls] })()',
	)
	say(`triangles=${info?.[0]} calls=${info?.[1]}`)
	if (!info?.[0]) trouble = 'the frame drew nothing (triangles=0)'
} catch (error) {
	trouble = error.message
} finally {
	// Page errors repeat every frame; keep each distinct line once, with a count.
	const raw = errors()
	const lines =
		raw && !/no (page )?errors/i.test(raw) ? raw.split('\n').filter((l) => l.trim()) : []
	const counts = new Map()
	for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1)
	const deduped = [...counts].map(([line, n]) => (n > 1 ? `${line} (×${n})` : line))
	if (deduped.length && !trouble) trouble = `page error: ${deduped[0]}`
	if (trouble) {
		const first = trouble.split('\n')[0]
		const rest = [
			...new Set(
				trouble
					.split('\n')
					.slice(1)
					.map((l) => l.trim()),
			),
		]
		console.error(`✗ ${first}`)
		for (const line of [...rest, ...deduped].slice(0, 6)) console.error(`  ${line}`)
		console.error(`  full log: ${logFile}`)
		log.push(`✗ ${first}`, ...rest, '', 'page errors:', ...deduped)
		process.exitCode = 1
	}
	log.push('', 'console:', pageConsole() || '(none)')
	writeFileSync(logFile, `${log.join('\n')}\n`)
	close()
}
