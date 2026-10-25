// bun run shot <map> [--spots name,...] [--out dir] [--gray] [--compare target.png] [--photo] [--seed 2] [--light name]
// Opens a moba match on the shared dev server at 1600×900 and screenshots named spots (`start` plus the map tune's `shots`),
// or with --photo freezes it, hides the HUD and shoots fixed camera poses (the tune's `photos`, else wide, rim and lane).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		spots: { type: 'string' },
		out: { type: 'string' },
		gray: { type: 'boolean', default: false },
		compare: { type: 'string' },
		photo: { type: 'boolean', default: false },
		seed: { type: 'string', default: '2' },
		light: { type: 'string' },
	},
})
const map = positionals[0]
if (!map) {
	console.error(
		'usage: bun run shot <map> [--spots name,...] [--out dir] [--gray] [--compare target.png] [--photo] [--seed 2] [--light name]',
	)
	process.exit(1)
}

if (values.compare && !existsSync(values.compare)) {
	console.error(`no target image at ${values.compare}`)
	process.exit(1)
}

const root = join(import.meta.dir, '..')
const tuneFile = join(root, 'src/modes/moba/maps', map, `${map}-tune.js`)
const mapTune = await import(tuneFile).catch(() => ({}))
const shots = mapTune.shots ?? {}
let names = values.spots ? values.spots.split(',') : ['start', ...Object.keys(shots)]
for (const name of values.photo ? [] : names)
	if (name !== 'start' && !shots[name]) {
		console.error(
			`no spot "${name}" in ${map}-tune.js shots (${Object.keys(shots).join(', ') || 'none'})`,
		)
		process.exit(1)
	}

const out = resolve(values.out ?? join(process.env.BB_THREAD_STORAGE ?? '/tmp', 'shots', map))
mkdirSync(out, { recursive: true })
const session = `shot-${process.env.BB_THREAD_ID ?? process.pid}-${map}`

function run(cmd, args, { quiet = false } = {}) {
	const p = Bun.spawnSync([cmd, ...args], { stdout: 'pipe', stderr: 'pipe' })
	const text = p.stdout.toString().trim()
	if (p.exitCode !== 0 && !quiet)
		throw new Error(`${cmd} ${args[0]}: ${p.stderr.toString().trim() || text}`)
	return text
}
const browser = (...args) => run('agent-browser', ['--session', session, ...args])
const evaluate = (js) => {
	const reply = JSON.parse(run('agent-browser', ['--session', session, '--json', 'eval', js]))
	if (!reply.success) throw new Error(`eval: ${reply.error}`)
	return reply.data?.result
}

const url = run('sh', [join(root, 'scripts/dev-agent.sh')])
const topdown = values.photo && values.spots?.split(',').includes('topdown')
const page = `${url}?mode=moba&play&map=${map}&hero=ibis&bots=easy&seed=${values.seed}${topdown ? '&fog=0' : ''}${values.light ? `&light=${encodeURIComponent(values.light)}` : ''}`

function boot() {
	browser('set', 'viewport', '1600', '900')
	browser('open', page)
	browser(
		'wait',
		'--timeout',
		'90000',
		'--fn',
		"window.dt?.screen()==='match' && !document.querySelector('.moba-front')",
	)
	browser('wait', '1500')
}
try {
	try {
		boot()
	} catch (error) {
		console.error(`boot failed, retrying once: ${error.message}`)
		boot()
	}
	if (values.light) {
		const light = evaluate('dt.game.moba.setup.light')
		if (values.light !== 'random' && light !== values.light)
			throw new Error(`requested light ${values.light}, got ${light}`)
		console.log(`light=${light}`)
	}

	// Camera poses from the court's half extents: high over the middle, low across the near rim, down the lane.
	const photos =
		values.photo &&
		(mapTune.photos ??
			(({ halfX: x, halfZ: z }) => ({
				wide: { eye: [0, x * 1.2, x], target: [0, 0, 0], fov: 40 },
				rim: { eye: [-x * 0.35, 3, z + 5], target: [x * 0.15, 1, -z], fov: 55 },
				lane: { eye: [-x - 6, 9, 0], target: [0, 0, 0], fov: 45 },
			}))(evaluate('dt.game.moba.sim.bounds')))
	if (photos) {
		// Opt-in survey pose, with enough margin to keep the whole court in frame.
		if (topdown) {
			const { halfX, halfZ } = evaluate('dt.game.moba.sim.bounds')
			const height = (Math.max(halfZ, halfX / (1600 / 900)) * 1.08) / Math.tan(Math.PI / 6)
			photos.topdown = { eye: [0, height, 0], target: [0, 0, 0], fov: 60 }
		}
		names = values.spots ? values.spots.split(',') : Object.keys(photos)
		const missing = names.find((name) => !photos[name])
		if (missing) throw new Error(`no photo "${missing}" (${Object.keys(photos).join(', ')})`)
	}

	for (const name of names) {
		if (photos) {
			evaluate(`dt.photo(${JSON.stringify(photos[name])})`)
			browser('wait', '600')
		} else if (name !== 'start') {
			const [x, z] = shots[name]
			evaluate(`(() => {
				const m = dt.game.moba, b = m.sim.heroes[0].body
				b.place(${x}, b.position.y + 2, ${z})
				m.focus({ x: ${x}, z: ${z} })
			})()`)
			browser('wait', '1200')
		}
		const file = join(out, `${photos ? 'photo-' : ''}${name}.png`)
		browser('screenshot', file)
		if (photos && name === 'topdown')
			writeFileSync(
				join(out, 'photo-topdown.json'),
				JSON.stringify(
					evaluate(`(() => {
					const camera = dt.game.camera
					return { width: 1600, height: 900, bounds: dt.game.moba.sim.bounds,
						projection: camera.projectionMatrix.toArray(), view: camera.matrixWorldInverse.toArray() }
				})()`),
				),
			)
		console.log(file)
		if (values.gray) {
			const gray = file.replace(/\.png$/, '-gray.png')
			run('magick', [file, '-colorspace', 'Gray', gray])
			console.log(gray)
		}
		// Target, frame and grey side by side at half size, so a judge needs one look.
		if (values.compare) {
			const compare = file.replace(/\.png$/, '-compare.png')
			run('magick', [
				resolve(values.compare),
				file,
				'(',
				file,
				'-colorspace',
				'Gray',
				')',
				'-resize',
				'800x450^',
				'-gravity',
				'center',
				'-extent',
				'800x450',
				'+append',
				compare,
			])
			console.log(compare)
		}
	}

	const info = evaluate(
		'(() => { const r = dt.game.renderer.info.render; return [r.triangles, r.calls] })()',
	)
	console.log(`triangles=${info?.[0]} calls=${info?.[1]}`)
	const errors = run('agent-browser', ['--session', session, 'errors'], { quiet: true })
	if (errors && !/no (page )?errors/i.test(errors)) console.log(`errors:\n${errors}`)
} catch (error) {
	console.error(error.message)
	process.exitCode = 1
} finally {
	run('agent-browser', ['--session', session, 'close'], { quiet: true })
}
