// bun run shot <map> [--spots name,...] [--out dir] [--gray] [--compare target.png] [--photo] [--seed 2] [--light name] [--hero id] [--lineup [ids]]
// Opens a moba match on the shared dev server at 1600×900 and screenshots named spots (`start` plus the map tune's `shots`),
// or with --photo freezes it, hides the HUD and shoots fixed camera poses (the tune's `photos`, else wide, rim and lane).
// --lineup stands every playable hero (or the listed ids) in a row facing the camera, frozen, as lineup.png.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { bootMatch, browserSession, devServer, holdCaptureLock, run } from './capture.js'

holdCaptureLock() // browser work on this box queues behind other captures

// A bare --lineup means every playable hero.
const argv = Bun.argv.slice(2)
const bare = argv.indexOf('--lineup')
if (bare >= 0 && (bare === argv.length - 1 || argv[bare + 1].startsWith('--')))
	argv.splice(bare + 1, 0, 'all')
const { values, positionals } = parseArgs({
	args: argv,
	allowPositionals: true,
	options: {
		spots: { type: 'string' },
		out: { type: 'string' },
		gray: { type: 'boolean', default: false },
		compare: { type: 'string' },
		photo: { type: 'boolean', default: false },
		seed: { type: 'string', default: '2' },
		light: { type: 'string' },
		hero: { type: 'string', default: 'ibis' },
		lineup: { type: 'string' },
	},
})
const map = positionals[0]
if (!map) {
	console.error(
		'usage: bun run shot <map> [--spots name,...] [--out dir] [--gray] [--compare target.png] [--photo] [--seed 2] [--light name] [--hero id] [--lineup [ids]]',
	)
	process.exit(1)
}

if (values.compare && !existsSync(values.compare)) {
	console.error(`no target image at ${values.compare}`)
	process.exit(1)
}

const root = join(import.meta.dir, '..')
const { HEROES } = await import(join(root, 'src/modes/moba/heroes.js'))
const playable = Object.keys(HEROES).filter((id) => HEROES[id].playable)
const lineup = values.lineup && (values.lineup === 'all' ? playable : values.lineup.split(','))
for (const id of [values.hero, ...(lineup || [])])
	if (!playable.includes(id)) {
		console.error(`no playable hero "${id}" (${playable.join(', ')})`)
		process.exit(1)
	}
const tuneFile = join(root, 'src/modes/moba/maps', map, `${map}-tune.js`)
const mapTune = await import(tuneFile).catch(() => ({}))
const shots = mapTune.shots ?? {}
let names = values.spots ? values.spots.split(',') : ['start', ...Object.keys(shots)]
if (lineup) names = ['lineup']
for (const name of values.photo || lineup ? [] : names)
	if (name !== 'start' && !shots[name]) {
		console.error(
			`no spot "${name}" in ${map}-tune.js shots (${Object.keys(shots).join(', ') || 'none'})`,
		)
		process.exit(1)
	}

const out = resolve(values.out ?? join(process.env.BB_THREAD_STORAGE ?? '/tmp', 'shots', map))
mkdirSync(out, { recursive: true })
const { browser, evaluate, errors, close } = browserSession(
	`shot-${process.env.BB_THREAD_ID ?? 'x'}-${map}`,
)

const url = devServer()
const topdown = values.photo && values.spots?.split(',').includes('topdown')
const page = `${url}?mode=moba&play&map=${map}&hero=${values.hero}&bots=easy&seed=${values.seed}${topdown ? '&fog=0' : ''}${values.light ? `&light=${encodeURIComponent(values.light)}` : ''}`

try {
	bootMatch({ browser }, page)
	if (values.light) {
		const light = evaluate('dt.game.moba.setup.light')
		if (values.light !== 'random' && light !== values.light)
			throw new Error(`requested light ${values.light}, got ${light}`)
		console.log(`light=${light}`)
	}

	// The row stands where the tune's `shots.lineup` says, else between your base and the middle, 4 m south,
	// 2.4 m apart, all facing the camera; your own hero takes its slot or stays at the base.
	let row = null
	if (lineup) {
		row = evaluate(`(() => {
			const m = dt.game.moba, s = m.sim, me = s.heroes[0], ids = ${JSON.stringify(lineup)}
			const [cx, cz] = ${JSON.stringify(shots.lineup ?? null)} ?? [me.body.position.x * 0.55, 4]
			const y = me.body.position.y
			ids.forEach((id, i) => {
				const h = id === me.definition.id ? me : s.spawnHero({ team: me.team, heroId: id }, me.id)
				if (!h) throw new Error('could not seat ' + id)
				h.body.place(cx + (i - (ids.length - 1) / 2) * 2.4, y, cz)
				h.body.face({ x: 0, z: 1 })
			})
			m.focus({ x: cx, z: cz })
			return { x: cx, y, z: cz }
		})()`)
		browser('wait', '1200')
		if (!values.photo) evaluate('dt.photo({ hud: true })')
	}

	// Camera poses from the court's half extents: high over the middle, low across the near rim, down the lane.
	const photos =
		values.photo &&
		(row
			? {
					lineup: {
						eye: [row.x, row.y + 5, row.z + 13],
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

	for (const name of names) {
		if (photos) {
			evaluate(`dt.photo(${JSON.stringify(photos[name])})`)
			browser('wait', '600')
		} else if (name !== 'start' && !row) {
			const [x, z] = shots[name]
			evaluate(`(() => {
				const m = dt.game.moba, b = m.sim.heroes[0].body
				b.place(${x}, b.position.y + 2, ${z})
				m.focus({ x: ${x}, z: ${z} })
			})()`)
			browser('wait', '1200')
		}
		const file = join(out, `${photos && !row ? 'photo-' : ''}${name}.png`)
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
	const problems = errors()
	if (problems && !/no (page )?errors/i.test(problems)) console.log(`errors:\n${problems}`)
} catch (error) {
	console.error(error.message)
	process.exitCode = 1
} finally {
	close()
}
