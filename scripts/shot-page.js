// The halves of shot.js that run inside the match. Each is sent whole as source through `call`,
// so it may use only its arguments, `dt` and imports from the dev server, never this file's scope.
export const call = (fn, ...args) => `(${fn})(...${JSON.stringify(args)})`

// Sets tune values by dotted path (`core.` reaches src/core's tune), repaints, and restarts the match
// so whatever is built from them at the start is rebuilt. Throws on a path that isn't a value.
export async function setTunes(pairs) {
	const tunes = {
		moba: (await import('/src/modes/moba/tune.js')).tune,
		core: (await import('/src/core/tune.js')).tune,
	}
	for (const [path, value] of pairs) {
		const keys = path.replace(/^tune\./, '').split('.')
		let object = keys[0] === 'core' ? tunes[keys.shift()] : tunes.moba
		const last = keys.pop()
		for (const key of keys) {
			if (object?.[key] === undefined || typeof object[key] !== 'object')
				throw new Error(`no tune "${path}": nothing at ${key}`)
			object = object[key]
		}
		if (!Object.hasOwn(object, last))
			throw new Error(`no tune "${path}" (${Object.keys(object).slice(0, 20).join(', ')})`)
		if (typeof object[last] === 'object' && object[last] !== null && typeof value !== 'object')
			throw new Error(`tune "${path}" is a section; name one of its values`)
		object[last] = value
	}
	;(await import('/src/modes/moba/restyle.js')).restyle()
	if (!dt.game.moba.controls.resetMatch()) throw new Error('could not restart the match')
	return true
}

// Stands heroes, mobs and Wardens in a row facing the camera. The row goes at `at`, else the first
// clear patch from the map's `shots.lineup`, a spot between your base and the middle, then outward,
// so nobody stands in a wall. Returns the row's centre, its span, and whether a given `at` is blocked.
export async function seatLineup({ entries, at, preferred }) {
	const { clampWalkable } = await import('/src/modes/moba/obstacles.js')
	const m = dt.game.moba
	const s = m.sim
	const me = s.heroes[0]
	const width = ({ kind, id }) =>
		kind === 'warden' ? 4.6 : kind === 'mob' ? (/brute|bearer/.test(id) ? 2.8 : 2) : 2.4
	let run = 0
	const offsets = entries.map((entry) => {
		const w = width(entry)
		run += w
		return run - w / 2
	})
	const span = run
	const seats = offsets.map((o) => o - span / 2)
	const y = me.body.position.y
	// A seat is clear if neither it nor the ground in front of it, toward the camera, gets pushed out of a wall.
	const clear = (cx, cz) =>
		entries.every((entry, i) =>
			[0, 2.5].every((dz) => {
				const p = { x: cx + seats[i], z: cz + dz }
				const q = clampWalkable(p, width(entry) / 2 - 0.4, 0.2, s.obstacles, s.bounds)
				return Math.hypot(q.x - p.x, q.z - p.z) < 0.01
			}),
		)
	let centre = at
	if (!centre) {
		const home = preferred ?? [me.body.position.x * 0.55, 4]
		const candidates = [home]
		if (preferred) candidates.push([me.body.position.x * 0.55, 4])
		for (let r = 2; r <= 40; r += 2)
			for (let a = 0; a < 16; a++)
				candidates.push([
					home[0] + Math.cos((a / 16) * Math.PI * 2) * r,
					home[1] + Math.sin((a / 16) * Math.PI * 2) * r,
				])
		centre = candidates.find(([x, z]) => clear(x, z))
		if (!centre) throw new Error('no clear patch for the lineup; give one with --at x,z')
	}
	const [cx, cz] = centre
	const figures = entries.some((e) => e.kind === 'warden')
		? await import('/src/modes/moba/mechanics/dungeon/dungeon-figures.js')
		: null
	const servants = entries.some((e) => e.dress)
		? await import('/src/modes/moba/mechanics/packs/packs-view.js')
		: null
	for (const [i, entry] of entries.entries()) {
		const x = cx + seats[i]
		if (entry.kind === 'mob') {
			if (!s.laneView) throw new Error('this map has no lane view to make mobs with')
			const body = s.laneView.makeBody(x, cz, entry.dress ? 'N' : 'B', entry.base)
			if (entry.dress) servants.dress(body, entry.base)
			body.position.set(x, body.position.y + y - (me.body.radius + me.body.halfHeight), cz)
			body.mesh.position.copy(body.position)
			body.face(0)
			continue
		}
		// A Warden wears its sculpted figure over a plain body, as dungeon-dress.js does.
		const h =
			entry.id === me.definition.id
				? me
				: s.spawnHero(
						{
							team: entry.kind === 'warden' ? 'B' : me.team,
							heroId: entry.kind === 'warden' ? 'oolong' : entry.id,
						},
						me.id,
					)
		if (!h) throw new Error(`could not seat ${entry.token}`)
		h.body.place(x, y, cz)
		h.body.face({ x: 0, z: 1 })
		if (entry.kind === 'warden') {
			const costume = h.body.mesh.getObjectByName('moba-cast-pose')
			for (const child of costume.children) child.visible = false
			const figure = figures.wardenFigure(entry.id)
			figure.root.position.y = -h.body.radius - h.body.halfHeight
			costume.add(figure.root)
		}
	}
	m.focus({ x: cx, z: cz })
	return { x: cx, y, z: cz, span, blocked: !clear(cx, cz) }
}

// Runs an --eval module: rewrites its root-relative imports to the dev server, then calls its
// default export, if a function, with `{ dt, moba, sim, tune }` and returns what that returns.
export async function runModule(source) {
	const code = source.replace(
		/(\bfrom\s*|\bimport\s*\(\s*)(['"])\/(?!\/)/g,
		(_, head, quote) => `${head}${quote}${location.origin}/`,
	)
	const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
	try {
		const module = await import(url)
		if (typeof module.default !== 'function') return null
		const moba = dt.game.moba
		const tune = (await import('/src/modes/moba/tune.js')).tune
		const result = await module.default({ dt, moba, sim: moba?.sim, tune })
		return result === undefined ? null : JSON.parse(JSON.stringify(result))
	} finally {
		URL.revokeObjectURL(url)
	}
}

// Frame timing over `seconds` of the live match.
export async function measure(seconds) {
	const perf = dt.game.perf
	perf.enabled = true
	perf.reset()
	await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
	const report = perf.report()
	perf.enabled = false
	const round = (v) => (v == null ? null : Math.round(v * 10) / 10)
	const ms = Object.fromEntries(
		Object.entries(report.ms).map(([k, v]) => [
			k,
			v && { mean: round(v.mean), p95: round(v.p95), max: round(v.max) },
		]),
	)
	return { fps: round(report.fps), samples: report.samples, ms }
}
