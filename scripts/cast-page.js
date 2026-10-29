// The in-page half of scripts/cast.js: evaluated once per page, it leaves `window.__cast`.
// It stages a hero, a target and an ally on the real map, steps the real app loop tick by tick (the same frames
// `dt.game.moba.fastForward` runs, so the sim, presentation and camera all advance by exactly 1/60 s),
// grabs the canvas every few ticks, and records what the sim did. Keys go through real KeyboardEvents; the
// cursor is the script's own pointer, so the cast is aimed the way a player aims it.
;(() => {
	const moba = dt.game.moba
	const sim = moba.sim
	const canvas = dt.game.renderer.domElement
	const me = () => sim.heroes.find((h) => h.id === sim.training.local)
	const frames = []
	const log = []
	let seen = null // the last fact already copied into `log`

	const compact = (fact) => {
		const keep = { tick: fact.tick, type: fact.type }
		for (const key of [
			'hero',
			'ability',
			'slot',
			'lock',
			'reason',
			'damage',
			'source',
			'target',
			'targetId',
			'amount',
			'key',
			'part',
			'from',
			'origin',
		])
			if (fact[key] !== undefined) keep[key] = fact[key]
		if (fact.point) keep.point = { x: +fact.point.x.toFixed(2), z: +fact.point.z.toFixed(2) }
		if (fact.target?.x !== undefined)
			keep.target = { x: +fact.target.x.toFixed(2), z: +fact.target.z.toFixed(2) }
		return keep
	}
	function drain() {
		const all = moba.facts
		const from = seen ? all.lastIndexOf(seen) + 1 : 0
		const ours = [me()?.id, api.ids?.foe, api.ids?.friend]
		for (const fact of all.slice(from))
			if ([fact.hero, fact.source, fact.target, fact.targetId].some((id) => ours.includes(id)))
				log.push(compact(fact))
		if (all.length) seen = all.at(-1)
	}
	function grab() {
		dt.game.render()
		frames.push(canvas.toDataURL('image/jpeg', 0.8).slice(23))
	}
	// What the local hero is doing this tick, as the sim holds it.
	function activity(h) {
		const state = []
		if (h.cast) state.push(`cast:${h.cast.ability}`)
		if (h.attack) state.push(`attack:${h.attack.phase}`)
		if (h.body.dashing) state.push(`dash:${h.dashAbility ?? '?'}`)
		if (h.channel) state.push(`channel:${h.channel.ability}`)
		if (h.stance) state.push(`stance:${h.stance.ability}`)
		if (h.statuses?.some((status) => status.key === 'core.motion')) state.push('motion')
		return state.join(' ')
	}

	const api = {
		// World point → pixel on the page (ground height unless y is given).
		screen(x, z, y = 0) {
			const camera = dt.game.camera
			camera.updateMatrixWorld()
			const p = new camera.position.constructor(x, y, z).project(camera)
			const r = canvas.getBoundingClientRect()
			return {
				x: Math.round(r.left + ((p.x + 1) / 2) * r.width),
				y: Math.round(r.top + ((1 - p.y) / 2) * r.height),
			}
		},
		// Removes everyone else, seats a target and an ally, and stops the page's own frames: the match moves only when stepped.
		setup({ at = null, enemy = 'ibis', ally = 'mandador' } = {}) {
			const h = me()
			sim.setTraining({ waves: false, botsEnabled: false, godMode: true, noCooldowns: false })
			sim.clearHeroes('A', h.id)
			sim.clearHeroes('B')
			const [x, z] = at ?? [-10, 0]
			api.home = { x, y: h.body.position.y, z }
			api.ids = {
				foe: sim.spawnHero({ team: 'B', heroId: enemy }, h.id).id,
				friend: sim.spawnHero({ team: 'A', heroId: ally }, h.id).id,
			}
			// The page's own animation frames stop here, so nothing advances the sim or the effects between evaluations;
			// only the steps below do. (Holding the sim with a pause instead would make the app read every frame of its own
			// as a neutral input and cancel a cast in flight.) A page evaluation lives 30 s at most, hence steps in chunks.
			window.requestAnimationFrame = () => 0
			return api.reset(6)
		},
		// Between casts: everyone full, cooled down and back in the row, across the frame. The target stands `gap`
		// metres along +x (screen right), the ally half way and a step nearer the camera so neither hides the other.
		reset(gap) {
			const h = me()
			// Fields, summons and shots from the last step run out first (frames are not grabbed), so nothing carries over.
			for (
				let n = 0;
				n < 600 && (sim.groundFields.length || sim.summons.length || sim.shots.length);
				n++
			)
				moba.fastForward({ ticks: 1 })
			const { x, y, z } = api.home
			const foe = sim.find(api.ids.foe),
				friend = sim.find(api.ids.friend)
			for (const unit of [h, foe, friend]) {
				if (unit.dead) sim.respawnNow(unit.id)
				unit.hp = unit.maxHp
				unit.cd.fill(0)
				unit.order = null
				unit.attack = null
			}
			h.body.place(x, y, z)
			h.body.face({ x: 1, z: 0 })
			foe.body.place(x + gap, y, z)
			foe.body.face({ x: -1, z: 0 })
			friend.body.place(x + gap * 0.5, y, z + 2.2)
			friend.body.face({ x: 1, z: 0 })
			api.step(1)
			const at = (unit) => ({ x: unit.body.position.x, z: unit.body.position.z })
			return { hero: at(h), foe: at(foe), friend: at(friend) }
		},
		// Advances up to `ticks` through the real loop, grabbing a frame every `every` ticks (0: none) and noting each
		// change of what the hero is doing. With `settle`, stops once the hero has acted (a cast fact, or an attack)
		// and then stood idle for `settle` ticks, counted across calls (`fresh` restarts the count). Long steps are
		// split by the caller: one page evaluation that outlasts the browser's timeout is lost.
		step(ticks, { every = 0, settle = 0, fresh = false } = {}) {
			const h = me()
			if (fresh) api.idle = 0
			let ran = 0
			while (ran < ticks) {
				moba.fastForward({ ticks: 1 })
				ran++
				drain()
				const now = activity(h)
				if (now !== api.last) {
					log.push({ tick: sim.tick, type: 'activity', now })
					api.last = now
				}
				if (now.includes('attack') || log.some((f) => f.type === 'cast' && f.hero === h.id))
					api.acted = true
				api.idle = now ? 0 : api.idle + 1
				if (every && (api.grabbed = (api.grabbed ?? 0) + 1) % every === 0) grab()
				if (settle && api.acted && api.idle >= settle) return { ran, settled: true }
			}
			return { ran, settled: false }
		},
		idle: 0,
		// A key held for `hold` ticks, then released; steps the two ticks after the release too.
		press(code, hold, { every = 0 } = {}) {
			api.key(code, true)
			api.step(hold, { every })
			api.key(code, false)
			return api.step(2, { every })
		},
		last: '',
		acted: false,
		key(code, down) {
			;(document.activeElement ?? document.body).dispatchEvent(
				new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true, cancelable: true }),
			)
		},
		// What happened since the last call: the facts and activity changes, the cooldowns and hit points now.
		take() {
			drain()
			api.acted = false
			const foe = sim.find(api.ids.foe)
			return {
				tick: sim.tick,
				log: log.splice(0),
				cooldowns: [...me().cd],
				hp: { me: me().hp, foe: foe.hp, friend: sim.find(api.ids.friend).hp },
			}
		},
		takeFrames: () => frames.splice(0),
		grab,
	}
	window.__cast = api
	return true
})()
