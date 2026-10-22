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
import { bowlExtent, createWeatherBowl } from './lobby-bowl.js'
import { validLobbyHandoff } from './lobby-handoff.js'
import { glowMaterial } from './effects.js'
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
		<p class="portal-status" role="status"></p>`
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
	const bowl = createWeatherBowl(app.scene, el, setup.map, app.renderer)
	const ring = new THREE.Mesh(
		new THREE.RingGeometry(p.radius * 0.82, p.radius, 48).rotateX(-Math.PI / 2),
		glowMaterial(p.color),
	)
	const pool = new THREE.Mesh(
		new THREE.CircleGeometry(p.radius * 0.82, 48).rotateX(-Math.PI / 2),
		glowMaterial(p.color, 0.18),
	)
	for (const mesh of [ring, pool]) {
		mesh.layers.set(FORWARD_LAYER)
		mesh.position.set(p.x, tune.map.printLayers.lobby + 0.02, p.z)
		app.scene.add(mesh)
	}

	// The whole saucer and bowl in frame between the team columns; nothing follows.
	const extent = [...saucerExtent(), ...bowlExtent()]
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
	let countdownFrom = null // host tick when the last human stepped in
	let lastPress = -Infinity
	let open = null // seat id the hero popover edits; it shows only while one is open
	let drawn = ''
	const names = new Map()
	const seatsEl = el.querySelector('.portal-seats')
	const picker = el.querySelector('.portal-picker')
	const status = el.querySelector('.portal-status')
	const label = (id) => names.get(id) ?? (id === hero.id ? 'You' : 'Player')
	const inside = (h) =>
		!!h && Math.hypot(h.body.position.x - p.x, h.body.position.z - p.z) < p.radius
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
		setup.picks[hero.id] = { ...setup.picks[hero.id], heroId: hero.heroId, team: 'A' }
	}
	function canEdit(seat) {
		const occupant = seat?.occupant
		return !!occupant && (occupant.id === hero.id || (occupant.bot && app.session.authoritative))
	}
	function tapSeat(seatId) {
		if (ending) return
		const seat = readySeats.seats.find((s) => s.id === seatId)
		if (!seat) return
		if (!seat.occupant) {
			if (addBot(seat)) open = seat.id
		} else if (canEdit(seat)) open = open === seat.id ? null : seat.id
		drawn = ''
		update()
	}
	function pickHero(seatId, heroId) {
		if (ending) return false
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
		const seat = readySeats.seats.find((s) => s.id === seatId)
		if (!app.session.authoritative || !seat?.occupant?.bot) return
		delete setup.picks[seat.occupant.id]
		readySeats.release(seat.occupant.id, sim.tick)
		open = null
	}
	function back() {
		if (ending) return
		if (app.session.shared) {
			app.emit('menu')
			return
		}
		syncPick()
		transferred = true
		app.modes.start('moba-front', { options: { setup, ...(backdrop ? { backdrop } : {}) } })
	}
	backButton.onclick = back
	picker.addEventListener('click', (event) => {
		const button = event.target.closest('button')
		if (!button || !open) return
		if (button.dataset.remove != null) removeBot(open)
		else if (pickHero(open, button.dataset.hero)) open = null
		drawn = ''
		update()
	})
	window.addEventListener(
		'keydown',
		(event) => {
			if (ending || event.repeat || document.querySelector('dialog[open]')) return
			if (event.code === 'Escape') {
				event.preventDefault()
				if (open) {
					open = null
					drawn = ''
					update()
				} else back()
			}
		},
		{ signal: run.signal },
	)

	// Standing in the portal is being ready; stepping out takes it back.
	function stand() {
		if (ending) return
		const seat = readySeats.seatOf(hero.id)
		if (!seat) return
		const at = inside(hero)
		if (at === seat.full || sim.tick - lastPress < 10) return
		lastPress = sim.tick
		run.intents.press(hero.id, at ? 'ready' : 'cancel', at ? readySeats.readyPoint() : null)
	}

	function update() {
		if (run.signal.aborted) return
		syncPick()
		stand()
		const t = (sim.tick * app.clock.step) % 10
		const go = humans().length > 0 && outside().length === 0
		ring.scale.setScalar(1 + (go ? 0.08 : 0.03) * Math.sin(t * (go ? 14 : 4)))
		ring.material.opacity = go ? 1 : 0.7
		pool.material.opacity = go ? 0.45 : 0.18
		const left =
			countdownFrom === null
				? null
				: Math.max(0, p.countdown - (sim.tick - countdownFrom) * app.clock.step)
		status.textContent = ending
			? 'Going in…'
			: !humans().length
				? ''
				: go
					? `Going in ${Math.ceil(left ?? p.countdown)}…`
					: inside(hero)
						? `Waiting for ${outside()
								.map((s) => label(s.occupant.id))
								.join(', ')}`
						: 'Walk into the portal to go'
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
		setup.picks = Object.fromEntries(roster.map((r) => [r.id, { heroId: r.heroId, team: 'A' }]))
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
			bowl.dispose()
			for (const mesh of [ring, pool]) {
				mesh.removeFromParent()
				mesh.geometry.dispose()
				mesh.material.dispose()
			}
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
			for (const human of sim.heroes) {
				const frame = app.intents.get(human.id)
				const picks = frame.pressed.filter((e) => e.action === 'pick')
				for (const edge of picks) run.intents.consume(human.id, edge.action)
				const at = picks.at(-1)?.at
				const choice = at?.z === 0 && Number.isInteger(at.x) ? choices[at.x] : null
				if (choice && choice.id !== human.heroId) sim.swapHero(human.id, choice.id)
			}
		},
		afterStep() {
			if (ending || !app.session.authoritative) return
			if (!readySeats.allReady()) {
				countdownFrom = null
				return
			}
			countdownFrom ??= sim.tick
			if (loadingQueued || (sim.tick - countdownFrom) * app.clock.step < p.countdown) return
			loadingQueued = true
			queueMicrotask(() => {
				loadingQueued = false
				if (!run.signal.aborted) beginLoading()
			})
		},
		update() {
			bowl.update(sim.tick * app.clock.step, app.camera.view)
			update()
		},
		hudFrame: () => ({
			lobby: true,
			inspectionDisabled: true,
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
