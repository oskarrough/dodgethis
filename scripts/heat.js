// bun run heat <map> [--matches 12] [--out pages/heat/<map>]
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { farmRoster, gameModules, MIXED } from './farm.js'
import { reserveCores } from './bench/cores.js'
import { maps } from '../src/modes/moba/maps/all-maps.js'
import { walkable } from '../src/modes/moba/obstacles.js'

async function run(command, args) {
	const child = Bun.spawn([command, ...args], { stdout: 'inherit', stderr: 'inherit' })
	if ((await child.exited) !== 0) throw new Error(`${command} failed`)
}

async function simulate(map, count) {
	const mods = await gameModules()
	const layout = mods.matchRecipe(map).layout
	const { halfX, halfZ } = layout.bounds
	const columns = Math.ceil(halfX * 2),
		rows = Math.ceil(halfZ * 2)
	const grids = Object.fromEntries(
		['presence', 'fights', 'deaths'].map((key) => [key, Array(columns * rows).fill(0)]),
	)
	const missed = { presence: 0, fights: 0, deaths: 0 }
	function add(key, point, amount) {
		if (
			!point ||
			!Number.isFinite(point.x) ||
			!Number.isFinite(point.z) ||
			Math.abs(point.x) > halfX ||
			Math.abs(point.z) > halfZ
		) {
			missed[key]++
			return
		}
		const x = Math.min(columns - 1, Math.floor(point.x + halfX))
		const z = Math.min(rows - 1, Math.floor(point.z + halfZ))
		grids[key][z * columns + x] += amount
	}
	const matches = []
	const budget = await reserveCores(1, { label: `heat ${map}` })
	try {
		await RAPIER.init({})
		for (let i = 0; i < count; i++) {
			const seed = i + 2
			const recipe = mods.matchRecipe(map)
			const roster = farmRoster([MIXED], 'hard', i, false, seed)
			const seats = new Set(roster.map((seat) => seat.id))
			const world = new RAPIER.World({ x: 0, y: mods.coreTune.physics.gravity, z: 0 })
			world.timestep = mods.STEP
			let match, unbuild
			try {
				unbuild = mods.buildColliders(
					world,
					RAPIER,
					recipe.layout.obstacles,
					recipe.layout.bounds,
					recipe.layout.settings?.scale ?? 1,
				)
				match = mods.createAgentMatch({
					recipe,
					scene: new THREE.Scene(),
					world,
					RAPIER,
					roster,
					seed,
					recordInputs: false,
					capturePerception: false,
					onLog(row) {
						if (row.kind !== 'hit' && row.kind !== 'death') return
						// A log's generic position may be the attacker; use the impact or victim instead.
						const point = row.fact.point ?? match?.sim.find(row.target)?.body.position
						if (row.kind === 'hit' && row.effective_damage > 0)
							add('fights', point, row.effective_damage)
						if (row.kind === 'death' && seats.has(row.target)) add('deaths', point, 1)
					},
				})
				const second = Math.round(1 / mods.STEP)
				// Same duration cap as simulate. Timeouts remain in the sample and are labelled.
				const limit = Math.ceil((mods.tune.agents.maxSeconds * 4) / mods.STEP)
				while (match.sim.tick < limit && match.step()) {
					if (match.sim.tick % second === 0)
						for (const hero of match.sim.heroes)
							if (seats.has(hero.id) && !hero.dead) add('presence', hero.body.position, 1)
				}
				const reason = match.sim.lane?.match.winner ? 'matchOver' : 'limit'
				const tape = match.finish(reason, { hash: false })
				matches.push({
					seed,
					seconds: tape.result.ticks * mods.STEP,
					winner: tape.result.winner,
					reason,
				})
				console.log(
					`${map} ${i + 1}/${count}: ${matches.at(-1).seconds.toFixed(1)} s, ${tape.result.winner ?? 'timeout'}`,
				)
			} finally {
				match?.dispose()
				unbuild?.()
				world.free()
			}
		}
	} finally {
		budget.release()
	}
	let ground = 0,
		unused = 0
	for (let z = 0; z < rows; z++)
		for (let x = 0; x < columns; x++)
			if (walkable(x + 0.5 - halfX, z + 0.5 - halfZ, 0.01, 0, layout.obstacles, layout.bounds)) {
				ground++
				if (!grids.presence[z * columns + x]) unused++
			}
	return {
		map,
		bounds: layout.bounds,
		obstacles: layout.obstacles,
		cellMetres: 1,
		columns,
		rows,
		grids,
		matches,
		missed,
		ground,
		unused,
	}
}

async function paint(data, directory, work) {
	await run('bun', ['scripts/shot.js', data.map, '--photo', '--spots', 'topdown', '--out', work])
	const photo = JSON.parse(await readFile(join(work, 'photo-topdown.json'), 'utf8'))
	if (photo.bounds.halfX !== data.bounds.halfX || photo.bounds.halfZ !== data.bounds.halfZ)
		throw new Error('Map bounds changed between simulation and photo; run heat again')
	const projection = new THREE.Matrix4()
		.fromArray(photo.projection)
		.multiply(new THREE.Matrix4().fromArray(photo.view))
	const point = (x, z) => {
		const p = new THREE.Vector3(x, 0, z).applyMatrix4(projection)
		return [((p.x + 1) * photo.width) / 2, ((1 - p.y) * photo.height) / 2]
	}
	const polygon = (corners, attributes = '') =>
		`<polygon points="${corners.map(([x, z]) => point(x, z).join(',')).join(' ')}" ${attributes}/>`
	const rectangle = (x0, z0, x1, z1, attributes) =>
		polygon(
			[
				[x0, z0],
				[x1, z0],
				[x1, z1],
				[x0, z1],
			],
			attributes,
		)
	const svg = (body) =>
		`<svg xmlns="http://www.w3.org/2000/svg" width="${photo.width}" height="${photo.height}">${body}</svg>`
	const { halfX, halfZ } = data.bounds
	const shapes = data.obstacles.map((o) =>
		o.r === undefined
			? rectangle(o.x - o.halfX, o.z - o.halfZ, o.x + o.halfX, o.z + o.halfZ)
			: polygon(
					Array.from({ length: 48 }, (_, i) => [
						o.x + Math.cos((i * Math.PI) / 24) * o.r,
						o.z + Math.sin((i * Math.PI) / 24) * o.r,
					]),
				),
	)
	shapes.push(rectangle(-halfX, -halfZ, halfX, halfZ))
	await writeFile(
		join(work, 'outlines.svg'),
		svg(
			`<g fill="none" stroke="#f6eedb" stroke-width="3">${shapes.join('')}</g><g fill="none" stroke="#182336" stroke-width="1.2">${shapes.join('')}</g>`,
		),
	)
	await run('magick', [
		join(work, 'photo-topdown.png'),
		'-resize',
		'1440x',
		'-quality',
		'85',
		join(directory, 'map.webp'),
	])
	const colors = { presence: '#17b9ff', fights: '#ff7029', deaths: '#ed267b' }
	for (const [key, grid] of Object.entries(data.grids)) {
		const peak = Math.max(...grid)
		const cells = grid.flatMap((value, i) => {
			if (!value) return []
			const x = (i % data.columns) - halfX,
				z = Math.floor(i / data.columns) - halfZ
			const opacity = (0.88 * Math.log1p(value)) / Math.log1p(peak)
			return rectangle(
				x,
				z,
				Math.min(x + 1, halfX),
				Math.min(z + 1, halfZ),
				`fill="${colors[key]}" fill-opacity="${opacity.toFixed(4)}"`,
			)
		})
		await writeFile(join(work, 'heat.svg'), svg(cells.join('')))
		await run('magick', [
			'-background',
			'none',
			join(work, 'heat.svg'),
			'-channel',
			'RGBA',
			'-blur',
			'0x5',
			'+channel',
			join(work, 'heat.png'),
		])
		await run('magick', [
			join(work, 'photo-topdown.png'),
			'-colorspace',
			'Gray',
			'-colorspace',
			'sRGB',
			'-brightness-contrast',
			'-10x-15',
			join(work, 'heat.png'),
			'-compose',
			'Over',
			'-composite',
			'(',
			'-background',
			'none',
			join(work, 'outlines.svg'),
			')',
			'-composite',
			'-resize',
			'1440x',
			'-quality',
			'88',
			join(directory, `${key}.webp`),
		])
	}
}

async function page(data, directory) {
	const title = data.map[0].toUpperCase() + data.map.slice(1)
	const seconds = data.matches.reduce((sum, match) => sum + match.seconds, 0)
	const timeouts = data.matches.filter((match) => match.reason === 'limit').length
	const number = (n) => Math.round(n).toLocaleString('en-US')
	const descriptions = {
		presence:
			'Living heroes, sampled once each second. Bare ground received no samples; it may still have been crossed between them.',
		fights:
			'Damage where the blow lands, weighted by HP removed. This includes heroes, minions, summons and structures.',
		deaths:
			'Deaths of the six heroes, counted where they fell. Minions and summons are excluded, as are swims home after a dunk.',
	}
	const units = { presence: 'hero-seconds sampled', fights: 'HP removed', deaths: 'hero deaths' }
	const figures = Object.keys(data.grids)
		.map(
			(key) =>
				`<figure><h2>${key[0].toUpperCase() + key.slice(1)}</h2><a href="${key}.webp"><img src="${key}.webp" alt="${title}: ${key} over the court, with wall and pillar outlines" width="1440" height="810"></a><figcaption>${descriptions[key]} ${number(data.grids[key].reduce((a, b) => a + b, 0))} ${units[key]}; busiest square: ${number(Math.max(...data.grids[key]))}.</figcaption></figure>`,
		)
		.join('\n')
	await writeFile(
		join(directory, 'index.html'),
		`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} heat maps · Dodgethis</title><link rel="stylesheet" href="/pages/page.css"><style>.page section img { aspect-ratio: 16 / 9; } .page h2 { margin-top: 0; }</style></head>
<body class="page"><main><p><a href="/pages/">Pinboard</a></p><h1>${title} heat maps</h1>
<p>${data.matches.length} matches · ${number(seconds)} simulated seconds · ${number(seconds / data.matches.length)} seconds per match · ${timeouts} timeouts.</p>
<p>Six hard bots, with Kappa, Ibis and a seeded random hero on each team. Seeds 2–${data.matches.at(-1).seed}. The court is counted in 1 m squares; each colour grows stronger from zero to its own busiest square on a logarithmic scale. A soft blur joins neighbouring squares. Open an image to inspect the ground.</p>
<section>${figures}</section><p>${number(data.unused)} of ${number(data.ground)} open squares (${((100 * data.unused) / data.ground).toFixed(1)}%) had no living hero sample. Walls and pillars are outlined at their ground footprints; raised stone in the photograph spreads beyond these outlines. The image top is −z, with team A at the left.</p>
<p>${Object.values(data.missed).reduce((a, b) => a + b, 0)} events or samples lacked an in-bounds position and were omitted. These are bot routes, not a verdict on human play.</p>
<p><a href="map.webp">Court photograph</a> · <a href="heat.json">Grids and match results</a></p>
</main></body></html>`,
	)
	await writeFile(join(directory, 'heat.json'), JSON.stringify(data))
	await run('bunx', ['oxfmt', join(directory, 'index.html'), join(directory, 'heat.json')])
}

async function main() {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: {
			matches: { type: 'string', default: '12' },
			out: { type: 'string' },
			help: { type: 'boolean' },
		},
	})
	if (values.help || !positionals.length) {
		console.log(
			'usage: bun run heat <map> [--matches 12] [--out pages/heat/<map>]\nRequires ImageMagick and agent-browser. Uses hard mixed bots, seeds from 2, and simulate’s duration cap.',
		)
		return
	}
	const [map] = positionals
	const laneMaps = Object.keys(maps).filter((id) =>
		['structures', 'minions', 'bots'].every((mechanic) => maps[id].mechanics.includes(mechanic)),
	)
	if (positionals.length !== 1 || !laneMaps.includes(map))
		throw new Error(`Expected a lane map: ${laneMaps.join(', ')}`)
	const count = Number(values.matches)
	if (!Number.isSafeInteger(count) || count < 1)
		throw new Error('--matches must be a positive integer')
	const directory = resolve(values.out ?? join('pages', 'heat', map))
	const data = await simulate(map, count)
	await mkdir(directory, { recursive: true })
	const work = await mkdtemp(join(tmpdir(), 'dodgethis-heat-'))
	try {
		await paint(data, directory, work)
		await page(data, directory)
	} finally {
		await rm(work, { recursive: true, force: true })
	}
	console.log(join(directory, 'index.html'))
}

main().catch((error) => {
	console.error(error.message)
	process.exitCode = 1
})
