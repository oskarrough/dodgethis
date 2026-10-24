import * as THREE from 'three'
import { FORWARD_LAYER } from '../../core/stylepass.js'
import { PALETTE } from '../../core/style.js'
import { listedHeroes, DEFAULT_HERO } from './heroes.js'
import { tune } from './tune.js'
import { createBackdrop } from './front/backdrop.js'
import { startLoading } from './front/descent.js'
import { applySkin, paintedCard } from './front/skin.js'
import { tune as frontTune } from './front/tune.js'
import { createCornerNav } from '../../core/corner-nav.js'
import { ICONS } from './hud.js'
import { createLobbyFloor, saucerExtent } from './lobby-floor.js'
import { mapLayout } from './maps/all-maps.js'
import { validLobbyHandoff } from './lobby-handoff.js'
import { createPortal } from '../../core/portal.js'
import { createPortalFar } from './portal-far.js'
import { playUse } from './sounds.js'
import './portal-lobby.css'

// The lobby (`?lobby=old` for the saucer): the teams are strips of seats, the floor is for playing, and
// everyone standing in the portal for `tune.lobby.portal.countdown` s goes in. Seats are the hero
// strip's painted cards, the hero popover holds spell-bar buttons, open while you edit a seat (tap yours or a bot's).
export function createPortalLobby({ app, run, sim, hero, setup, options }) {
	const p = tune.lobby.portal
	const readySeats = sim.readySeats
	const choices = listedHeroes({ ...setup, party: true, debug: true })
	const el = options.el ?? document.createElement('main')
	const backdrop = options.backdrop ?? createBackdrop()
	const canvas = app.renderer.domElement
	const parent = canvas.parentNode
	const next = canvas.nextSibling
	el.className = 'moba-front front-lobby portal-lobby'
	el.dataset.screen = 'lobby'
	el.setAttribute('aria-label', 'Party')
	applySkin(el)
	el.innerHTML = `<div class="portal-seats"></div>
		<nav class="portal-picker" aria-label="Pick a hero" hidden></nav>
		<p class="portal-map"><b></b><small class="portal-status" role="status"></small></p>`
	const { back: backButton } = createCornerNav(el, { label: 'Back to splash' })
	// The world lobby's canvas, sky and pastel palette (lobby.js), without its saucer props.
	el.prepend(backdrop.el, canvas)
	canvas.classList.add('front-canvas')
	canvas.inert = false
	document.body.append(el)
	app.audio.setMusicScene('wind')
	run.setStylePreset({ line: tune.lobby.style.line, hatch: 1, alpha: true })
	const cream = new THREE.Color(PALETTE.cream)
	app.setPalette(
		Object.fromEntries(
			Object.entries(PALETTE).map(([role, color]) => [
				role,
				['ink', 'cream'].includes(role)
					? color
					: new THREE.Color(color).lerp(cream, tune.lobby.style.pastel).getHex(),
			]),
		),
	)

	const floor = createLobbyFloor(app.scene, app.renderer)
	const far = createPortalFar(setup.map)
	const tear = createPortal(app.renderer, {
		draw(target, camera) {
			camera.layers.set(FORWARD_LAYER)
			app.renderer.setRenderTarget(target)
			app.renderer.clear()
			app.renderer.render(far.scene, camera)
		},
		layer: FORWARD_LAYER,
		radius: p.tearRadius,
		openTime: p.openTime,
		sparks: p.sparks,
	})
	app.scene.add(tear.object)
	const facing = new THREE.Vector3(0, Math.sin(p.lean), Math.cos(p.lean))
	const mouth = new THREE.Vector3(p.x, p.tearRadius, p.z)
	tear.place(mouth, facing)
	tear.exit(new THREE.Vector3(0, p.farHeight, 0), facing)
	// The tear is the map preview. One caption beside it, on the floor where the top of the screen can't
	// clip it, names the map and says what to do: walk in, who you're waiting for, the countdown.
	const mapCaption = el.querySelector('.portal-map')
	mapCaption.querySelector('b').textContent = mapLayout(setup.map).name
	const captionAt = new THREE.Vector3(p.tearRadius * 0.8, 0, p.z)
	const projected = new THREE.Vector3()
	function placeCaption(camera) {
		projected.copy(captionAt).project(camera)
		mapCaption.hidden = projected.z < -1 || projected.z > 1
		mapCaption.style.left = `${((projected.x + 1) * innerWidth) / 2}px`
		mapCaption.style.top = `${((1 - projected.y) * innerHeight) / 2}px`
	}
	let viewTime = sim.tick * app.clock.step
	const squeezed = new Set()
	const entered = new Set() // heroes in the tear last frame, so each step in flashes it once
	// Both peers read the last human's ready tick; only the host hands off to loading.
	function readyFrom() {
		if (!readySeats.allReady()) return null
		let from = 0
		for (const seat of readySeats.seats)
			if (seat.occupant && !seat.occupant.bot) from = Math.max(from, seat.enteredAt)
		return from
	}
	const slipping = (from = readyFrom()) =>
		from !== null && (sim.tick - from) * app.clock.step >= p.countdown
	// How far a hero's middle has passed through the mouth's plane, in metres; under 0 is in front.
	const depth = (h) =>
		-(
			(h.body.position.x - mouth.x) * facing.x +
			(0.5 - mouth.y) * facing.y +
			(h.body.position.z - mouth.z) * facing.z
		)
	// In the tear: through its plane, between its sides and not out past its back.
	const inside = (h) =>
		!!h &&
		depth(h) > 0 &&
		Math.abs(h.body.position.x - mouth.x) < p.tearRadius * p.width &&
		depth(h) <= p.reach + 0.01
	// The tear answers: a flash as each hero steps in, a low hum while it waits for the rest, then a
	// build-up that fills over the countdown.
	function charge(time, from, dt) {
		for (const h of sim.heroes) {
			if (!inside(h)) entered.delete(h)
			else if (!entered.has(h)) {
				entered.add(h)
				tear.flash()
			}
		}
		const target =
			from !== null
				? p.charge.hum +
					(1 - p.charge.hum) * Math.min(1, (time - from * app.clock.step) / p.countdown)
				: entered.size
					? p.charge.hum
					: 0
		tear.charge += (target - tear.charge) * Math.min(1, dt * p.charge.ease)
	}
	// Walking in shrinks a hero away over `p.sink` m; after the countdown everyone left slips in too.
	function slip(time, from) {
		const k =
			from === null
				? 0
				: Math.min(1, Math.max(0, (time - from * app.clock.step - p.countdown) / p.slipTime))
		for (const h of sim.heroes) {
			const sunk = inside(h) ? Math.min(1, depth(h) / p.sink) : 0
			const gone = Math.max(k, sunk)
			if (gone > 0) {
				h.body.mesh?.scale.setScalar(Math.max(0.05, 1 - gone * gone))
				squeezed.add(h)
			} else if (squeezed.delete(h)) h.body.mesh?.scale.setScalar(1)
		}
	}

	// The whole saucer in frame between the team columns; nothing follows.
	const extent = saucerExtent()
	const fitter = new THREE.PerspectiveCamera()
	const fit = { key: '', x: 0, z: 0, distance: 30 }
	const point = new THREE.Vector3()
	function frame() {
		const c = tune.lobby.camera
		const sides = [...el.querySelectorAll('.portal-team')].map((s) => s.getBoundingClientRect())
		const left = Math.max(0, ...sides.filter((r) => r.left < innerWidth / 2).map((r) => r.right))
		const right = Math.min(
			innerWidth,
			...sides.filter((r) => r.left >= innerWidth / 2).map((r) => r.left),
		)
		const top = c.top
		const bottom = innerHeight - c.margin * 4
		const key = [innerWidth, innerHeight, left, right, top, bottom].join()
		if (key === fit.key) return fit
		fit.key = key
		const pitch = Math.atan2(c.height, c.back)
		const ray = new THREE.Vector3(0, -Math.sin(pitch), -Math.cos(pitch))
		fitter.fov = c.fov
		fitter.aspect = innerWidth / innerHeight
		fitter.updateProjectionMatrix()
		const safe = {
			x0: ((left + c.margin) / innerWidth) * 2 - 1,
			x1: ((right - c.margin) / innerWidth) * 2 - 1,
			y0: 1 - (bottom / innerHeight) * 2,
			y1: 1 - (top / innerHeight) * 2,
		}
		const tangent = Math.tan((c.fov * Math.PI) / 360)
		for (let i = 0; i < c.passes; i++) {
			fitter.position.set(fit.x, 0, fit.z).addScaledVector(ray, -fit.distance)
			fitter.lookAt(fit.x, 0, fit.z)
			fitter.updateMatrixWorld()
			let x0 = Infinity,
				x1 = -Infinity,
				y0 = Infinity,
				y1 = -Infinity
			for (const e of extent) {
				point.copy(e).project(fitter)
				x0 = Math.min(x0, point.x)
				x1 = Math.max(x1, point.x)
				y0 = Math.min(y0, point.y)
				y1 = Math.max(y1, point.y)
			}
			const grow = Math.max((x1 - x0) / (safe.x1 - safe.x0), (y1 - y0) / (safe.y1 - safe.y0))
			fit.distance *= Math.min(2, Math.max(0.5, grow))
			const half = fit.distance * tangent
			fit.x += ((x0 + x1) / 2 - (safe.x0 + safe.x1) / 2) * half * fitter.aspect
			fit.z -= (((y0 + y1) / 2 - (safe.y0 + safe.y1) / 2) * half) / Math.sin(pitch)
		}
		fit.ray = ray
		return fit
	}
	run.camera.frame(() => {
		const { x, z, distance, ray } = frame()
		return {
			eye: { x: x - ray.x * distance, y: -ray.y * distance, z: z - ray.z * distance },
			target: { x, y: 0, z },
			fov: tune.lobby.camera.fov,
		}
	})

	let ending = false
	let transferred = false
	let handoff = null
	let loadingQueued = false
	let lastPress = -Infinity
	let open = null // seat id the hero popover edits; it shows only while one is open
	let drawn = ''
	const names = new Map()
	const seatsEl = el.querySelector('.portal-seats')
	const picker = el.querySelector('.portal-picker')
	const status = el.querySelector('.portal-status')
	const label = (id) => names.get(id) ?? (id === hero.id ? 'You' : 'Player')
	const humans = () => readySeats.seats.filter((s) => s.occupant && !s.occupant.bot)
	const outside = () => humans().filter((s) => !s.full)
	const icon = (id) => {
		const h = choices.find((c) => c.id === id)
		return h?.icon ?? ICONS[id] ?? ICONS[h?.silhouette] ?? ICONS.empty
	}
	const card = (button, i) => {
		button.type = 'button'
		button.className = 'skin-card'
		button.dataset.light = 'day'
		button.style.setProperty('--wash', frontTune.skin.wash.hero)
		button.innerHTML = `${paintedCard(i)}<span class="skin-sheet"></span><span class="skin-ring"></span><span class="skin-face"></span><span class="lobby-hero-strip-face"></span><span class="lobby-hero-strip-name skin-title"><span></span></span>`
		return button
	}
	const teams = [...new Set(readySeats.seats.map((s) => s.team))]
	const strips = Object.fromEntries(
		teams.map((team) => {
			const strip = document.createElement('nav')
			strip.className = 'lobby-hero-strip portal-team'
			strip.dataset.team = team
			strip.setAttribute('aria-label', team === 'A' ? 'Your team' : 'Enemies')
			seatsEl.append(strip)
			return [team, strip]
		}),
	)
	const seatViews = readySeats.seats.map((seat, i) => {
		const box = document.createElement('div')
		box.className = 'portal-seat'
		const button = card(document.createElement('button'), i)
		button.onclick = () => tapSeat(seat.id)
		const who = document.createElement('small')
		who.className = 'portal-tag'
		box.append(button, who)
		strips[seat.team].append(box)
		return {
			box,
			button,
			face: button.querySelector('.lobby-hero-strip-face'),
			name: button.querySelector('.lobby-hero-strip-name > span'),
			who,
		}
	})
	// Choices are spell-bar buttons (hud.css .moba-slot): paper is who, buttons are do.
	const choice = (face, name) => {
		const button = document.createElement('button')
		button.type = 'button'
		button.className = 'moba-slot'
		button.innerHTML = `<span class="icon">${face}</span><small>${name}</small>`
		picker.append(button)
		return button
	}
	const pickerCards = choices.map((h) => {
		const button = choice(icon(h.id), h.id)
		button.dataset.hero = h.id
		return button
	})
	const remove = choice('×', 'remove bot')
	remove.dataset.remove = ''

	function syncPick() {
		setup.heroId = hero.heroId
		setup.picks[hero.id] = {
			...setup.picks[hero.id],
			heroId: hero.heroId,
			team: readySeats.seatOf(hero.id)?.team ?? 'A',
		}
	}
	function canEdit(seat) {
		const occupant = seat?.occupant
		return !!occupant && (occupant.id === hero.id || (occupant.bot && app.session.authoritative))
	}
	function tapSeat(seatId) {
		if (ending || slipping()) return
		const seat = readySeats.seats.find((s) => s.id === seatId)
		if (!seat) return
		if (!seat.occupant) {
			if (addBot(seat)) {
				open = seat.id
				playUse(app.audio, 'lobby.botAdd')
			}
		} else if (canEdit(seat)) {
			open = open === seat.id ? null : seat.id
			app.audio.ui(open ? 'menuOpen' : 'menuClose')
		}
		drawn = ''
		update()
	}
	function pickHero(seatId, heroId) {
		if (ending || slipping()) return false
		const seat = readySeats.seats.find((s) => s.id === seatId)
		const occupant = seat?.occupant
		const index = choices.findIndex((h) => h.id === heroId)
		if (!occupant || index < 0) return false
		if (occupant.bot) {
			if (!app.session.authoritative) return false
			if (!readySeats.claim(seat.id, { ...occupant, heroId }, sim.tick)) return false
			setup.picks[occupant.id] = { heroId, team: seat.team }
			return true
		}
		if (occupant.id !== hero.id) return false
		run.intents.press(hero.id, 'pick', { x: index, z: 0 })
		return true
	}
	function addBot(seat) {
		if (!app.session.authoritative || seat.occupant) return false
		let serial = 1
		while (readySeats.seatOf(`bot-${seat.team}-${serial}`)) serial++
		const id = `bot-${seat.team}-${serial}`
		const added = readySeats.claim(
			seat.id,
			{ id, heroId: DEFAULT_HERO, bot: true, joinOrder: readySeats.seats.length + serial },
			sim.tick,
		)
		if (added) setup.picks[id] = { heroId: DEFAULT_HERO, team: seat.team }
		return added
	}
	function removeBot(seatId) {
		if (ending || slipping()) return
		const seat = readySeats.seats.find((s) => s.id === seatId)
		if (!app.session.authoritative || !seat?.occupant?.bot) return
		delete setup.picks[seat.occupant.id]
		readySeats.release(seat.occupant.id, sim.tick)
		open = null
		playUse(app.audio, 'lobby.botRemove')
	}
	function back() {
		if (ending || slipping()) return
		if (app.session.shared) {
			app.emit('menu')
			return
		}
		syncPick()
		transferred = true
		playUse(app.audio, 'lobby.back')
		app.modes.start('moba-front', { options: { setup, ...(backdrop ? { backdrop } : {}) } })
	}
	backButton.onclick = back
	picker.addEventListener('click', (event) => {
		const button = event.target.closest('button')
		if (!button || !open) return
		if (button.dataset.remove != null) removeBot(open)
		else if (pickHero(open, button.dataset.hero)) {
			open = null
			playUse(app.audio, 'lobby.pick')
		} else playUse(app.audio, 'lobby.pickDenied')
		drawn = ''
		update()
	})
	window.addEventListener(
		'keydown',
		(event) => {
			if (ending || slipping() || event.repeat || document.querySelector('dialog[open]')) return
			if (event.code === 'Escape') {
				event.preventDefault()
				if (open) {
					open = null
					app.audio.ui('menuClose')
					drawn = ''
					update()
				} else back()
			}
		},
		{ signal: run.signal },
	)

	// Standing in the portal is being ready; stepping out takes it back.
	function stand(from) {
		if (ending || slipping(from)) return
		const seat = readySeats.seatOf(hero.id)
		if (!seat) return
		const at = inside(hero)
		if (at === seat.full || sim.tick - lastPress < 10) return
		lastPress = sim.tick
		run.intents.press(hero.id, at ? 'ready' : 'cancel', at ? readySeats.readyPoint() : null)
	}

	function update(countdownFrom = readyFrom()) {
		if (run.signal.aborted) return
		syncPick()
		stand(countdownFrom)
		const go = humans().length > 0 && outside().length === 0
		const left =
			countdownFrom === null
				? null
				: Math.max(0, p.countdown - (sim.tick - countdownFrom) * app.clock.step)
		status.textContent =
			ending || left === 0
				? 'Going in…'
				: !humans().length
					? 'Walk in to play'
					: go
						? `Going in ${Math.ceil(left ?? p.countdown)}…`
						: inside(hero)
							? `Waiting for ${outside()
									.map((s) => label(s.occupant.id))
									.join(', ')}`
							: 'Walk in to play'
		status.dataset.go = String(go)
		const state = JSON.stringify([
			app.session.authoritative,
			app.session.shared,
			open,
			[...names],
			readySeats.seats.map((s) => [s.occupant, s.full]),
			sim.heroes.map((h) => [h.id, h.heroId]),
		])
		if (drawn === state) return
		drawn = state
		for (const [i, seat] of readySeats.seats.entries()) {
			const view = seatViews[i]
			const occupant = seat.occupant
			const heroId = occupant
				? (sim.heroes.find((h) => h.id === occupant.id)?.heroId ?? occupant.heroId)
				: null
			view.box.dataset.kind = occupant ? (occupant.bot ? 'bot' : 'human') : 'empty'
			view.box.dataset.own = String(occupant?.id === hero.id)
			view.box.dataset.ready = String(!!occupant && !occupant.bot && seat.full)
			view.face.innerHTML = occupant ? icon(heroId) : '+'
			view.name.textContent = occupant ? heroId : 'add'
			view.who.textContent = !occupant ? '' : occupant.bot ? 'bot' : label(occupant.id)
			view.who.dataset.who = !occupant
				? ''
				: occupant.bot
					? 'bot'
					: occupant.id === hero.id
						? 'you'
						: 'human'
			view.button.disabled = ending || (!occupant ? !app.session.authoritative : !canEdit(seat))
		}
		if (!readySeats.seats.find((s) => s.id === open)?.occupant) open = null
		const seat = readySeats.seats.find((s) => s.id === open)
		for (const [i, s] of readySeats.seats.entries())
			seatViews[i].button.setAttribute('aria-pressed', String(open === s.id))
		picker.hidden = !seat
		if (seat) {
			const current =
				sim.heroes.find((h) => h.id === seat.occupant.id)?.heroId ?? seat.occupant.heroId
			for (const button of pickerCards)
				button.setAttribute('aria-pressed', String(button.dataset.hero === current))
			remove.hidden = !seat.occupant.bot
			// Beside the seat, facing the middle, centred on it as far as the screen allows; the
			// notch keeps pointing at the seat when the clamp moves the box.
			const at = seatViews[readySeats.seats.indexOf(seat)].button.getBoundingClientRect()
			const gap = 14
			const x = seat.team === 'A' ? at.right + gap : at.left - picker.offsetWidth - gap
			const mid = at.top + at.height / 2
			const y = Math.max(
				8,
				Math.min(innerHeight - picker.offsetHeight - 8, mid - picker.offsetHeight / 2),
			)
			picker.dataset.side = seat.team === 'A' ? 'left' : 'right'
			picker.style.left = `${x}px`
			picker.style.top = `${y}px`
			picker.style.setProperty('--notch', `${mid - y}px`)
		}
	}
	function loadLane() {
		ending = transferred = true
		drawn = ''
		update()
		playUse(app.audio, 'lobby.start')
		startLoading(app, {
			el,
			backdrop,
			setup: handoff.setup,
			difficulty: handoff.setup.difficulty,
			roster: handoff.roster,
			handoff,
		})
	}
	function beginLoading() {
		if (ending || !app.session.authoritative || !readySeats.allReady()) return
		syncPick()
		const roster = readySeats.laneRoster(hero.id, setup.difficulty, setup.seed)
		// Picks keep each seat's side: back in the lobby they rebuild both teams of three.
		setup.picks = Object.fromEntries(roster.map((r) => [r.id, { heroId: r.heroId, team: r.team }]))
		handoff = { setup: structuredClone(setup), roster }
		loadLane()
	}
	update()
	run.debug.expose({
		get screen() {
			return ending ? 'descent' : 'lobby'
		},
		portalParty: { sim, setup, readySeats, pickHero, tapSeat, snapshot: sim.snapshot },
	})
	run.signal.addEventListener(
		'abort',
		() => {
			canvas.classList.remove('front-canvas')
			parent.insertBefore(canvas, next)
			el.remove()
			app.setPalette({})
			floor.dispose()
			tear.dispose()
			far.dispose()
			for (const h of squeezed) h.body.mesh?.scale.setScalar(1)
			squeezed.clear()
			if (!transferred) backdrop.dispose()
		},
		{ once: true },
	)
	return {
		get handoff() {
			return handoff
		},
		names(byId) {
			names.clear()
			for (const [id, name] of Object.entries(byId)) if (name) names.set(id, name)
			update()
		},
		follow(next) {
			if (app.session.authoritative || !app.session.shared) return false
			if (ending) return true
			if (!validLobbyHandoff(next, { setup, sim, readySeats })) return false
			handoff = structuredClone(next)
			handoff.setup.edgePan = setup.edgePan
			loadLane()
			return true
		},
		frozen: () => false,
		presentationFrozen: () => false,
		resume() {},
		result() {},
		touchMode: () => false,
		inspectAim: () => null,
		prepareInput() {},
		step() {
			const locked = ending || slipping()
			for (const human of sim.heroes) {
				const frame = app.intents.get(human.id)
				if (locked) {
					// Strip remote frames on the host too; stop cancels casts without unreadying.
					while (frame.pressed.length) run.intents.consume(human.id, frame.pressed[0].action)
					frame.move.x = frame.move.z = 0
					frame.order = frame.aim = null
					for (const action in frame.held) delete frame.held[action]
					frame.released.length = 0
					human.body.cancelDash()
					run.intents.press(human.id, 'stop')
					continue
				}
				const picks = frame.pressed.filter((e) => e.action === 'pick')
				for (const edge of picks) run.intents.consume(human.id, edge.action)
				const at = picks.at(-1)?.at
				const choice = at?.z === 0 && Number.isInteger(at.x) ? choices[at.x] : null
				if (choice && choice.id !== human.heroId) sim.swapHero(human.id, choice.id)
			}
		},
		afterStep() {
			if (ending || !app.session.authoritative) return
			// The tear has a back wall: a hero who walks in stays in, `reach` m past its face.
			for (const h of sim.heroes) {
				const past = depth(h) - p.reach
				if (past > 0 && Math.abs(h.body.position.x - mouth.x) < p.tearRadius * p.width) {
					h.body.position.z += past / facing.z
				}
			}
			const countdownFrom = readyFrom()
			if (
				countdownFrom === null ||
				loadingQueued ||
				(sim.tick - countdownFrom) * app.clock.step < p.countdown + p.slipTime
			)
				return
			loadingQueued = true
			queueMicrotask(() => {
				loadingQueued = false
				if (!run.signal.aborted) beginLoading()
			})
		},
		update(alpha = 0) {
			const time = (sim.tick + alpha) * app.clock.step
			const dt = Math.min(0.1, Math.max(0, time - viewTime))
			viewTime = time
			const from = readyFrom()
			if (!ending) {
				if (humans().length && !tear.isOpen) tear.open()
				far.update(dt)
				charge(time, from, dt)
				tear.update(dt, app.camera.view)
				slip(time, from)
			}
			placeCaption(app.camera.view)
			update(from)
		},
		hudFrame: () => ({
			lobby: true,
			inspectionDisabled: false,
			inspectables: [],
			hero,
			sim,
			step: app.clock.step,
			localTeam: 'A',
			cooldowns: hero.cd.slice(0, 3).map(() => 0),
			hp: hero.hp,
			maxHp: hero.maxHp,
			respawn: null,
		}),
	}
}
