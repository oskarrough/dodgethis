import * as THREE from 'three'
import { PALETTE } from '../../core/style.js'
import { createCornerNav } from '../../core/corner-nav.js'
import { clampMap } from './obstacles.js'
import { tune } from './tune.js'
import { DEFAULT_MAP, onlineMaps } from './maps/index.js'
import { tune as frontTune } from './front/tune.js'
import { createBackdrop, easeShot } from './front/backdrop.js'
import { startLoading } from './front/descent.js'
import { applySkin } from './front/skin.js'
import { createLobbyProps } from './lobby-props.js'
import { createLobbyFloor } from './lobby-floor.js'
import { createWeatherBowl } from './lobby-bowl.js'
import { HEROES } from './heroes.js'
import { createHeroStrip, createLobbyHeroes } from './lobby-heroes.js'
import { createNumbers } from './front/numbers.js'
import './lobby.css'

// The lobby uses the match's simulation and presentation, but owns navigation and framing.
export function createLobby({
	app,
	run,
	sim,
	hero,
	setup,
	options,
	gallery,
	onPresent = (listener) => run.on('present', listener),
}) {
	const backdrop = options.backdrop ?? createBackdrop()
	const el = options.el ?? document.createElement('main')
	const canvas = app.renderer.domElement
	const parent = canvas.parentNode
	const next = canvas.nextSibling
	el.className = 'moba-front front-lobby'
	applySkin(el)
	el.dataset.screen = 'lobby'
	el.setAttribute('aria-label', 'Try your hero in the lobby')
	el.innerHTML = '<div class="lobby-pick-stamp" aria-live="polite"></div>'
	const { back: backButton, online: onlineEntry } = createCornerNav(el, { label: 'Back to splash' })
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
				['ink', 'cream', 'portalChill', 'portalSpicy', 'portalChaos'].includes(role)
					? color
					: new THREE.Color(color).lerp(cream, tune.lobby.style.pastel).getHex(),
			]),
		),
	)
	// The lobby opens by flying in along the camera's own view ray, on the backdrop's shot
	// ease and time; the canvas fades up over the last 40% of the move.
	const intro = { time: frontTune.shot.lobby.time, t: 0 }
	if (!(intro.time > 0)) intro.t = intro.time
	let leaving = false
	const fadeAt = () => intro.time * tune.lobby.intro.fadeFrom
	const fadeIntro = () => {
		canvas.style.opacity =
			intro.t >= intro.time
				? ''
				: String(Math.max(0, (intro.t - fadeAt()) / (intro.time - fadeAt())))
	}
	fadeIntro()
	backdrop.shot('lobby', { instant: intro.t >= intro.time })
	backdrop.tint(1, intro.time - intro.t)
	// The chrome slides between its place and its own edge: in one piece after another as the
	// lane fades up, with the floor's labels once the camera lands; out together as it fades.
	const edges = [
		['.front-lobby .lobby-hero-strip', -1, 0],
		['.front-lobby .back-button', -1, -1],
		['.front-lobby .online-entry', -1, -1],
		['.moba-hud:not(.moba-unit)', 0, 1],
		['.mute', 1, 1],
		['.fullscreen', 1, 1],
	]
	let slides = []
	function slide(node, x, y, { at = 0, time, out = false }) {
		if (!node) return
		const timing = {
			duration: time * 1000,
			delay: at * 1000,
			// Reversed, ease-out would idle at the start; the exit is short enough to go straight.
			easing: out ? 'linear' : 'ease-out',
			direction: out ? 'reverse' : 'normal',
			fill: out ? 'forwards' : 'backwards',
		}
		const shift = frontTune.chrome.shift
		slides.push(node.animate([{ opacity: 0, scale: 0.85 }, {}], timing))
		if (x || y)
			slides.push(
				node.animate([{ translate: `${x * shift}px ${y * shift}px` }, { translate: '0px 0px' }], {
					...timing,
					composite: 'add',
				}),
			)
	}
	function stopSlides() {
		for (const animation of slides) animation.cancel()
		slides = []
	}
	run.system('present', ({ dt }) => {
		if (leaving) {
			intro.t = Math.max(0, intro.t - dt)
			fadeIntro()
			// Once the lobby and its chrome are gone the splash takes over, so its tiles land
			// with the backdrop.
			const gone = intro.t <= fadeAt() && slides.every((a) => a.playState === 'finished')
			if (gone && !transferred) queueMicrotask(returnSplash)
			return
		}
		if (intro.t >= intro.time) return
		intro.t = Math.min(intro.time, intro.t + dt)
		fadeIntro()
	})
	const follow = { x: 0, z: 0 }
	run.system('present', ({ dt }) => {
		const f = tune.lobby.frame,
			p = hero.body.position
		const past = (v, edge) => Math.sign(v) * Math.max(0, Math.abs(v) - edge)
		const k = 1 - Math.exp(-f.followEase * dt)
		follow.x += (past(p.x, f.followX) - follow.x) * k
		follow.z += (past(p.z, f.halfZ) - follow.z) * k
	})
	run.camera.frame(() => {
		const c = tune.lobby.camera
		// Fit the whole playable lobby, not only its far half. Portrait widens the lens,
		// never stretching scenery or moving the marks outside the visible ground.
		const scale = Math.max(1, c.fitAspect / Math.max(c.minAspect, innerWidth / innerHeight))
		const back = c.back
		let target = clampMap({
			x: Math.max(-tune.lobby.bounds.halfX, Math.min(tune.lobby.bounds.halfX, c.x)),
			z: Math.max(-tune.lobby.frame.halfZ, Math.min(tune.lobby.frame.halfZ, c.z)),
		})
		const hud = document.querySelector('.moba-hud')
		const safeBottom = Math.max(
			tune.lobby.hud.margin,
			(hud?.getBoundingClientRect().top ?? innerHeight) - tune.lobby.hud.margin,
		)
		const distance = Math.hypot(c.height, back),
			sin = c.height / distance,
			cos = back / distance
		const baseZ = target.z
		let tangent = Math.tan((c.fov * Math.PI) / 360) * scale
		for (let i = 0; i < c.fitPasses; i++) {
			const pixels = innerHeight / (2 * tangent)
			const dz = tune.lobby.frame.halfZ - baseZ
			const bottom = innerHeight / 2 + (pixels * sin * dz) / (distance - cos * dz)
			const k = (safeBottom - innerHeight / 2) / pixels
			if (bottom > safeBottom && sin + k * cos > tune.collision.epsilon)
				target = clampMap({
					...target,
					z: tune.lobby.frame.halfZ - (k * distance) / (sin + k * cos),
				})
			const far = -tune.lobby.frame.halfZ - target.z
			const head = (hero.body.radius + hero.body.halfHeight) * 2
			const top =
				innerHeight / 2 + (pixels * (sin * far - cos * head)) / (distance - cos * far - sin * head)
			if (top >= 0) break
			tangent *= c.fitGrowth
		}
		const eye = clampMap({ x: target.x, z: target.z + back })
		const fov = (Math.atan(tangent) * 360) / Math.PI
		const out =
			1 + (tune.lobby.intro.distance - 1) * (1 - easeShot(Math.min(1, intro.t / intro.time)))
		const far = clampMap({
			x: target.x + (eye.x - target.x) * out,
			z: target.z + (eye.z - target.z) * out,
		})
		return {
			eye: { x: far.x + follow.x, y: c.height * out, z: far.z + follow.z },
			target: { x: target.x + follow.x, y: 0, z: target.z + follow.z },
			fov,
		}
	})
	app.camera.update(0)
	let mouse = false
	let touch = options.device ? options.device === 'touch' : matchMedia('(any-hover: none)').matches
	const readySeats = sim.readySeats
	const props = createLobbyProps(app.scene, el, gallery, readySeats, hero.id, app.audio)
	const floor = createLobbyFloor(app.scene, app.renderer)
	const bowl = createWeatherBowl(app.scene, el, setup.map, app.renderer)
	const lobbyHeroes = createLobbyHeroes({
		el,
		humans: sim.heroes,
		local: hero.id,
	})
	const flips = new Map()
	const renderedPicks = new Map(sim.heroes.map((h) => [h.id, h.heroId]))
	props.syncSeats()
	const stamp = el.querySelector('.lobby-pick-stamp')
	const strip = createHeroStrip({
		el,
		heroes: HEROES,
		current: hero.heroId,
		pick: (id) => pickHero(id),
		openNumbers: () => numbers.toggle(),
	})
	if (intro.t < intro.time) {
		const { stagger, land } = frontTune.chrome
		edges.forEach(([selector, x, y], i) =>
			slide(document.querySelector(selector), x, y, {
				at: Math.max(0, fadeAt() - intro.t) + i * stagger,
				time: land,
			}),
		)
		el.querySelectorAll('.lobby-label').forEach((label, i) =>
			slide(label, 0, 0, { at: intro.time - intro.t + i * stagger, time: land }),
		)
	}
	const numbers = createNumbers(hero, (open) => {
		if (!open)
			blockedPad = new Set((app.input.pad()?.buttons ?? []).flatMap((held, i) => (held ? [i] : [])))
		numbers.update(
			0,
			app.input.pad(),
			touch && app.input.activeDevice() !== 'gamepad' ? 'touch' : app.input.activeDevice(),
		)
		app.intents.cancel(hero.id)
		app.input.consumeMenuInput()
		run.clock.reset()
		app.audio.blip(tune.lobby.inspect[open ? 'openSound' : 'closeSound'])
	})
	run.clock.pause(() => numbers.open && app.session.actions.includes('pause'))
	run.intents.suspend(() => numbers.open || leaving)
	run.system('present', ({ dt }) =>
		numbers.update(
			dt,
			app.input.pad(),
			touch && app.input.activeDevice() !== 'gamepad' ? 'touch' : app.input.activeDevice(),
		),
	)
	let inspectionAim = null
	let readyPrimary = false
	let loadingQueued = false
	const readySounds = new Map()
	let pickSoundTick = null
	let denySoundTick = null
	let gallerySoundTick = null
	let shotSoundTick = null
	let galleryShot = null
	let readyQueued = false
	const syncPick = () => {
		setup.heroId = hero.heroId
		setup.picks[hero.id] = { ...setup.picks[hero.id], heroId: hero.heroId, team: hero.seatTeam }
		strip.sync(hero.heroId)
		const url = new URL(location.href)
		url.searchParams.set('hero', hero.heroId)
		url.searchParams.set('map', setup.map)
		url.searchParams.set('bots', setup.difficulty)
		history.replaceState(null, '', url)
	}
	syncPick()
	function finishGalleryShot() {
		galleryShot = null
		if (readyQueued)
			queueMicrotask(() => {
				if (!run.signal.aborted) ready()
			})
	}
	onPresent((fact) => {
		if (
			galleryShot?.projectile != null &&
			['expired', 'hit', 'blocked'].includes(fact.type) &&
			fact.projectile === galleryShot.projectile
		)
			finishGalleryShot()
		if (fact.type === 'seatClaim') {
			props.syncSeats()
			setup.picks[hero.id].team = readySeats.seatOf(hero.id)?.team ?? setup.picks[hero.id].team
		}
		if (fact.type === 'swap') flips.set(fact.hero, fact.tick)
		if (fact.type === 'pick') {
			if (!app.session.authoritative) gallery.select(fact.difficulty, fact.tick, app.clock.step)
			setup.difficulty = fact.difficulty
			props.selectDifficulty()
		}
		if (fact.hero !== hero.id) return
		const sound = {
			readyWalk: 'walkSound',
			seatEnter: 'enterSound',
			seatReady: 'fullSound',
			readyCancel: 'cancelSound',
			seatEmpty: 'cancelSound',
		}[fact.type]
		if (sound && readySounds.get(sound) !== fact.tick) {
			readySounds.set(sound, fact.tick)
			app.audio.blip(tune.lobby.ready[sound])
		}
		if (fact.type === 'pick') {
			if (fact.ability === 'galleryShot') finishGalleryShot()
			setup.difficulty = fact.difficulty
			props.selectDifficulty()
			const url = new URL(location.href)
			url.searchParams.set('bots', fact.difficulty)
			history.replaceState(null, '', url)
			if (gallerySoundTick !== fact.tick) {
				gallerySoundTick = fact.tick
				app.audio.blip(tune.lobby.gallery.pickSound)
			}
			return
		}
		if (fact.type !== 'swap') return
		syncPick()
		slam(`${fact.heroId}!`, fact.heroId)
		if (pickSoundTick !== fact.tick) {
			pickSoundTick = fact.tick
			app.audio.blip(tune.lobby.pick.sound)
		}
	})
	function slam(text, heroId = '') {
		stamp.textContent = text
		stamp.dataset.hero = heroId
		stamp.classList.remove('slam')
		void stamp.offsetWidth
		stamp.classList.add('slam')
	}
	function pickHero(id) {
		if (ending || numbers.open || id === hero.heroId) return
		const stand = lobbyHeroes.stands.find((s) => s.id === id)
		if (stand) {
			run.intents.press(hero.id, 'pick', { x: stand.x, z: stand.z })
			return
		}
		if (denySoundTick === sim.tick) return
		denySoundTick = sim.tick
		app.audio.blip(tune.lobby.pick.denySound)
	}
	function cycleHero(delta = 1) {
		const playable = Object.values(HEROES).filter((definition) => definition.playable)
		const index = playable.findIndex((definition) => definition.id === hero.heroId)
		pickHero(playable[(index + delta + playable.length) % playable.length].id)
	}

	// A right-click picks a target by the card you see, upright or knocked flat. The ground point
	// under the cursor sits up to a card's height behind its foot, so a foot radius missed most clicks.
	const cardPoint = new THREE.Vector3()
	function cardAt(order) {
		const camera = app.camera.view
		cardPoint.set(order.x, 0, order.z).project(camera)
		const cx = cardPoint.x,
			cy = cardPoint.y
		const pad = tune.lobby.gallery.clickPad
		for (const p of props.galleryProps) {
			p.card.updateWorldMatrix(true, true)
			cardBox.setFromObject(p.card)
			let left = Infinity,
				right = -Infinity,
				bottom = Infinity,
				top = -Infinity
			for (const x of [cardBox.min.x, cardBox.max.x])
				for (const y of [cardBox.min.y, cardBox.max.y])
					for (const z of [cardBox.min.z, cardBox.max.z]) {
						cardPoint.set(x, y, z).project(camera)
						left = Math.min(left, cardPoint.x)
						right = Math.max(right, cardPoint.x)
						bottom = Math.min(bottom, cardPoint.y)
						top = Math.max(top, cardPoint.y)
					}
			if (cx >= left - pad && cx <= right + pad && cy >= bottom - pad && cy <= top + pad) return p
		}
		if (gallery.aimsAt(order, tune.lobby.gallery.radius + tune.orders.pick))
			return props.galleryProps.reduce((a, b) =>
				Math.hypot(order.x - a.stand.x, order.z - a.stand.z) <=
				Math.hypot(order.x - b.stand.x, order.z - b.stand.z)
					? a
					: b,
			)
		return null
	}
	const cardBox = new THREE.Box3()

	function cycleDifficulty(delta = 1) {
		const i = gallery.standees.findIndex((s) => s.id === gallery.difficulty)
		shootAt(gallery.standees[(i + delta + gallery.standees.length) % gallery.standees.length])
	}
	// G and a right-click on a card share one route: walk to the firing mark, then shoot that card.
	function shootAt(stand) {
		if (!app.session.authoritative || hero.dead || galleryShot) {
			if (!app.session.authoritative) {
				slam('Host only')
				app.audio.blip(tune.lobby.pick.denySound)
			}
			run.present({
				type: 'denied',
				hero: hero.id,
				slot: 'primary',
				reason: app.session.authoritative ? 'gallery-busy' : 'host-only',
				tick: sim.tick,
			})
			return
		}
		const frame = app.intents.get(hero.id)
		while (frame.pressed.some((e) => e.action === 'ready')) run.intents.consume(hero.id, 'ready')
		readyQueued = false
		galleryShot = { stand, projectile: null }
		app.intents.get(hero.id).order = { ...tune.lobby.gallery.firingMark, kind: 'move' }
	}

	let ending = false
	let handoff = null
	let transferred = false
	let device = ''
	const heldKeys = new Set(options.heldKeys ?? [])
	const blockedKeys = new Set(heldKeys)
	let previous = app.input.pad()?.buttons.slice() ?? []
	let blockedPad = new Set(previous.flatMap((held, i) => (held ? [i] : [])))
	const returnSplash = () => {
		if (transferred || run.signal.aborted) return
		transferred = true
		app.modes.start('moba-front', { options: { setup, backdrop, heldKeys: [...heldKeys] } })
	}
	function back() {
		if (ending) return
		if (numbers.open) {
			numbers.toggle()
			return
		}
		if (
			readyQueued ||
			hero.readyWalk ||
			readySeats.seatOf(hero.id)?.enteredAt != null ||
			app.intents.get(hero.id).pressed.some((e) => e.action === 'ready')
		) {
			app.intents.cancel(hero.id)
			cancelReady()
			return
		}
		if (galleryShot) {
			galleryShot = null
			readyQueued = false
			app.intents.get(hero.id).order = null
			app.intents.cancel(hero.id)
			run.intents.press(hero.id, 'stop')
			return
		}
		if (
			hero.cast ||
			hero.channel ||
			hero.stance ||
			Object.keys(app.intents.get(hero.id).held).length
		) {
			app.intents.cancel(hero.id)
			return
		}
		if (!app.session.actions.includes('restart')) {
			app.emit('menu')
			return
		}
		syncPick()
		ending = true
		app.audio.blip({ ...frontTune.back, type: 'sine' })
		leaving = true
		app.intents.cancel(hero.id)
		el.inert = true
		backdrop.shot('splash')
		backdrop.tint(0, frontTune.shot.splash.time)
		if (intro.t <= fadeAt()) return returnSplash()
		stopSlides()
		const time = intro.t - fadeAt()
		for (const [selector, x, y] of edges)
			slide(document.querySelector(selector), x, y, { time, out: true })
		for (const label of el.querySelectorAll('.lobby-label')) slide(label, 0, 0, { time, out: true })
	}
	function cancelReady(stop = true) {
		readyQueued = false
		run.intents.press(hero.id, 'cancel')
		if (stop) {
			const frame = app.intents.get(hero.id),
				box = readySeats.seatOf(hero.id)
			if (
				frame.order &&
				box &&
				Math.hypot(frame.order.x - box.x, frame.order.z - box.z) <= tune.orders.arrival
			)
				frame.order = null
			run.intents.press(hero.id, 'stop')
		}
	}
	function ready() {
		if (ending || hero.dead || numbers.open) return
		if (galleryShot) {
			readyQueued = true
			return
		}
		readyQueued = false
		const box = readySeats.seatOf(hero.id)
		if (!box) {
			run.present({
				type: 'denied',
				hero: hero.id,
				slot: 'ready',
				reason: 'no-seat',
				tick: sim.tick,
			})
			return
		}
		run.intents.press(hero.id, 'ready')
	}
	function beginLoading() {
		if (ending || !app.session.authoritative || !readySeats.allReady() || galleryShot) return
		syncPick()
		setup.picks = Object.fromEntries(
			readySeats.seats
				.filter((s) => s.occupant)
				.map((s) => {
					const human = sim.heroes.find((h) => h.id === s.occupant.id)
					return [s.occupant.id, { heroId: human?.heroId ?? s.occupant.heroId, team: s.team }]
				}),
		)
		if (app.session.shared)
			handoff = {
				setup: {
					...structuredClone(setup),
					map: onlineMaps.includes(setup.map) ? setup.map : DEFAULT_MAP,
				},
				roster: readySeats.laneRoster(hero.id, setup.difficulty, setup.seed),
			}
		loadLane()
	}
	function loadLane() {
		ending = transferred = true
		app.audio.blip(frontTune.loading.skip)
		startLoading(app, {
			el,
			backdrop,
			setup: handoff?.setup ?? setup,
			difficulty: handoff?.setup.difficulty ?? setup.difficulty,
			roster: handoff?.roster,
			handoff,
		})
	}
	window.addEventListener(
		'pointerdown',
		(e) => {
			touch = e.pointerType === 'touch'
			mouse = e.pointerType === 'mouse'
		},
		{ signal: run.signal },
	)
	window.addEventListener(
		'pointermove',
		(e) => {
			if (e.pointerType !== 'mouse') return
			touch = false
			mouse = true
		},
		{ signal: run.signal },
	)
	backButton.onclick = back
	window.addEventListener(
		'keydown',
		(event) => {
			if (event.target?.closest?.('dialog')) return
			heldKeys.add(event.code)
			// Lobby arrows select options before the shared movement input sees them.
			if (event.code.startsWith('Arrow')) {
				event.preventDefault()
				event.stopImmediatePropagation()
			}
			if (event.code !== 'Backquote') touch = mouse = false
			if (numbers.key(event)) return
			if (
				ending ||
				event.repeat ||
				blockedKeys.has(event.code) ||
				event.target?.closest?.('.lil-gui')
			)
				return
			if (event.code === 'KeyO') {
				event.preventDefault()
				app.intents.cancel(hero.id)
				onlineEntry.click()
				return
			}
			if (event.code === 'KeyN') {
				event.preventDefault()
				numbers.toggle()
				return
			}
			if (['KeyH', 'ArrowUp', 'ArrowDown'].includes(event.code)) {
				event.preventDefault()
				cycleHero(event.code === 'ArrowUp' ? -1 : 1)
				return
			}
			if (['KeyG', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
				event.preventDefault()
				cycleDifficulty(event.code === 'ArrowLeft' ? -1 : 1)
				return
			}
			const digit = /^Digit([1-5])$/.exec(event.code)
			if (digit) {
				event.preventDefault()
				run.intents.press(hero.id, `slot${digit[1]}`, app.intents.get(hero.id).aim)
				return
			}
			if (event.code !== 'Escape' && event.code !== 'Enter') return
			event.preventDefault()
			if (event.code === 'Escape') back()
			else ready()
		},
		{ signal: run.signal, capture: true },
	)
	window.addEventListener(
		'keyup',
		(event) => {
			heldKeys.delete(event.code)
			blockedKeys.delete(event.code)
			numbers.key(event)
		},
		{ signal: run.signal },
	)
	run.system('input', () => {
		const buttons = app.input.pad()?.buttons ?? []
		// Neither the crane nor a modal takes lobby pad input.
		if (ending || document.querySelector('dialog[open]')) return void (previous = buttons.slice())
		const down = (i) => buttons[i] && !previous[i] && !blockedPad.has(i)
		if (down(8) && !numbers.open) {
			app.intents.cancel(hero.id)
			onlineEntry.click()
			previous = buttons.slice()
			return
		}
		const cancel = down(1)
		const start = down(9)
		const cycle = down(12)
		const difficulty = down(13)
		const box = readySeats.seatOf(hero.id)
		const readyA =
			down(0) &&
			box &&
			Math.hypot(hero.body.position.x - box.x, hero.body.position.z - box.z) <=
				tune.lobby.ready.promptRadius &&
			!Object.keys(app.intents.get(hero.id).held).length
		const view = down(8)
		previous = buttons.slice()
		if (view || (numbers.open && cancel)) {
			numbers.toggle()
			return
		}
		if (numbers.open) return
		if (cancel) back()
		else if (start || readyA) {
			readyPrimary = !!readyA
			ready()
		} else if (cycle) cycleHero()
		else if (difficulty) cycleDifficulty()
		const pad = app.input.activeDevice() === 'gamepad'
		const nextDevice = pad ? 'gamepad' : touch ? 'touch' : mouse ? 'mouse' : 'keyboard'
		if (device === nextDevice) return
		device = nextDevice
		el.dataset.device = device
		strip.setDevice(device)
		backButton.querySelector('kbd').textContent = device === 'gamepad' ? 'B' : ''
		props.setDevice(device)
		onlineEntry.querySelector('kbd').textContent = device === 'gamepad' ? 'Select' : ''
	})
	// Screen changes drop pending casts/orders. The device reset requires a fresh press;
	// inherited navigation keys and the initial pad buttons also have their own release guard.
	app.intents.cancel(hero.id)
	run.debug.tune('lobby camera', tune.lobby.camera, (f, c) => {
		f.add(c, 'x', -tune.lobby.bounds.halfX, tune.lobby.bounds.halfX, 0.1)
		f.add(c, 'z', -tune.lobby.bounds.halfZ, tune.lobby.bounds.halfZ, 0.1)
		f.add(c, 'height', 1, 30, 0.1)
		f.add(c, 'back', 0, 13, 0.1)
		f.add(c, 'fov', 20, 90, 1)
	})
	run.debug.tune('lobby floor (applies on restart)', tune.lobby.floor, (f, c) => {
		// Never smaller than today's ellipse, which keeps the walking bounds' corners over 1 m on the glaze.
		f.add(c, 'halfX', 13.7, 20, 0.1)
		f.add(c, 'halfZ', 10.2, 20, 0.1)
		f.add(c, 'seed', 0, 999, 1)
		f.add(c, 'depth', 0.5, 4, 0.1)
		f.add(c, 'gloss', 0, 0.5, 0.01)
		f.add(c.crazing, 'alpha', 0, 0.4, 0.01).name('crazing')
		f.add(c.wear, 'chips', 0, 60, 1).name('chips')
		f.add(c.cradle, 'radius', 1, 2.5, 0.05).name('cradle radius')
		f.add(c.cradle, 'reach', 0.1, 0.6, 0.01).name('cradle air')
		for (const k of Object.keys(c.colors)) f.addColor(c.colors, k)
	})
	run.debug.expose({
		get screen() {
			return ending && !leaving ? 'descent' : 'lobby'
		},
		lobby: {
			sim,
			setup,
			layout: tune.lobby,
			strip,
			gallery,
			galleryProps: props.galleryProps,
			heroStands: lobbyHeroes.stands,
			readySeats,
			numbers,
			inspectables: props.inspectables,
			seatProps: props.seatProps,
			get readyWalk() {
				return hero.readyWalk
			},
			snapshot: sim.snapshot,
		},
	})
	run.signal.addEventListener(
		'abort',
		() => {
			stopSlides()
			numbers.dispose()
			strip.dispose()
			lobbyHeroes.dispose()
			props.dispose()
			floor.dispose()
			bowl.dispose()
			canvas.classList.remove('front-canvas')
			if (leaving) canvas.style.opacity = ''
			parent.insertBefore(canvas, next)
			el.remove()
			if (!transferred) backdrop.dispose()
			app.setPalette({})
		},
		{ once: true },
	)
	return {
		get handoff() {
			return handoff
		},
		follow(next) {
			if (app.session.authoritative || !app.session.shared) return false
			if (ending) return true
			const roster = next?.roster
			const matchSetup = next?.setup
			if (
				!Array.isArray(roster) ||
				roster.length !== readySeats.seats.length ||
				new Set(roster.map((p) => p?.id)).size !== roster.length ||
				!roster.every(
					(p) =>
						typeof p?.id === 'string' &&
						['A', 'B'].includes(p.team) &&
						HEROES[p.heroId]?.playable &&
						['human', 'bot'].includes(p.controller),
				) ||
				roster.filter((p) => p.controller === 'human').length !== sim.heroes.length ||
				!sim.heroes.every((h) => roster.some((p) => p.id === h.id && p.controller === 'human')) ||
				!['A', 'B'].every(
					(team) =>
						roster.filter((p) => p.team === team).length ===
						readySeats.seats.filter((s) => s.team === team).length,
				) ||
				!onlineMaps.includes(matchSetup?.map) ||
				!['easy', 'normal', 'hard'].includes(matchSetup.difficulty) ||
				!Number.isSafeInteger(matchSetup.seed) ||
				matchSetup.seed < 0 ||
				matchSetup.seed > tune.testing.seedMax
			)
				return false
			handoff = structuredClone(next)
			handoff.setup.edgePan = setup.edgePan
			// The loading scope aborts the lobby at the apex, never inside a wire callback.
			loadLane()
			return true
		},
		frozen: () => numbers.open && app.session.actions.includes('pause'),
		presentationFrozen: () => numbers.open && app.session.actions.includes('pause'),
		result() {},
		touchMode: () => touch,
		inspectAim(dir, magnitude) {
			if (!dir) return inspectionAim ?? sim.stickAim(hero.id, null, 0, null)
			const p = hero.body.position,
				range = magnitude * tune.lobby.inspect.range
			inspectionAim = {
				x: Math.max(
					-tune.lobby.bounds.halfX,
					Math.min(tune.lobby.bounds.halfX, p.x + dir.x * range),
				),
				z: Math.max(
					-tune.lobby.bounds.halfZ,
					Math.min(tune.lobby.bounds.halfZ, p.z + dir.z * range),
				),
			}
			return inspectionAim
		},
		prepareInput() {
			const frame = app.intents.get(hero.id)
			// Core may cache the last pad sample until release after a modal reset.
			// Drop inherited kit edges too, without swallowing the releases.
			const buttons = app.input.pad()?.buttons ?? []
			const kit = { 0: 'primary', 4: 'slot3', 5: 'slot1', 6: 'slot4', 7: 'slot2' }
			for (const i of blockedPad) {
				const action = kit[i]
				if (action) {
					delete frame.held[action]
					while (frame.pressed.some((e) => e.action === action))
						run.intents.consume(hero.id, action)
				}
				if (!buttons[i]) blockedPad.delete(i)
			}
			if (readyPrimary) {
				run.intents.consume(hero.id, 'primary')
				readyPrimary = false
			}
			if (
				galleryShot?.projectile === null &&
				(frame.pressed.some((e) => ['stop', 'cancel'].includes(e.action)) ||
					Math.hypot(frame.move.x, frame.move.z) > 0 ||
					(frame.order &&
						Math.hypot(
							frame.order.x - tune.lobby.gallery.firingMark.x,
							frame.order.z - tune.lobby.gallery.firingMark.z,
						) > tune.orders.arrival))
			) {
				galleryShot = null
				readyQueued = false
				run.present({
					type: 'denied',
					hero: hero.id,
					slot: 'primary',
					reason: 'gallery-cancelled',
					tick: sim.tick,
				})
			}
			if (!frame.order) return
			if (!frame.order.kind && readySeats.seats.some((s) => readySeats.contains(s, frame.order)))
				frame.order = { ...frame.order, kind: 'move' }
			const card = !frame.order.kind && cardAt(frame.order)
			if (card) {
				frame.order = null
				shootAt(card.stand)
				return
			}
		},
		// At a fixed-step boundary, using the previous step's position. Stop must reach
		// the sim before intents age; queueing it after sim.step would drop a one-step edge.
		step() {
			for (const human of sim.heroes) {
				const frame = app.intents.get(human.id)
				const picks = frame.pressed.filter((e) => e.action === 'pick')
				for (const _ of picks) run.intents.consume(human.id, 'pick')
				const edge = picks.at(-1)
				if (edge) {
					const stand = lobbyHeroes.stands.find(
						(s) =>
							edge.at && Math.hypot(edge.at.x - s.x, edge.at.z - s.z) <= tune.lobby.pick.radius,
					)
					if (stand && stand.id !== human.heroId) sim.swapHero(human.id, stand.id)
					else
						run.present({
							type: 'denied',
							hero: human.id,
							slot: 'swap',
							reason: stand ? 'already-picked' : 'unavailable',
							tick: sim.tick,
						})
				}
			}
			if (galleryShot && galleryShot.projectile === null && !hero.dead) {
				const p = hero.body.position,
					mark = tune.lobby.gallery.firingMark
				if (
					Math.hypot(p.x - mark.x, p.z - mark.z) <= tune.orders.arrival &&
					!hero.cast &&
					!hero.body.dashing
				) {
					const aim = { x: galleryShot.stand.x, z: galleryShot.stand.z }
					hero.yaw = Math.atan2(aim.x - p.x, aim.z - p.z) + Math.PI
					const shot = sim.launchShot(
						hero,
						{ x: aim.x - p.x, z: aim.z - p.z },
						{
							...tune.lobby.gallery.shot,
							range: Math.min(tune.lobby.gallery.shot.range, Math.hypot(aim.x - p.x, aim.z - p.z)),
							ability: 'galleryShot',
							slot: 'gallery',
							aim,
						},
					)
					if (shotSoundTick !== sim.tick) {
						shotSoundTick = sim.tick
						app.audio.blip(tune.lobby.gallery.shotSound)
					}
					galleryShot.projectile = shot.id
				}
			}
			if (hero.dead) {
				if (hero.readyWalk) cancelReady()
				if (galleryShot?.projectile === null) {
					galleryShot = null
					readyQueued = false
					run.present({
						type: 'denied',
						hero: hero.id,
						slot: 'primary',
						reason: 'gallery-dead',
						tick: sim.tick,
					})
				}
			}
		},
		afterStep() {
			if (app.session.authoritative && readySeats.allReady() && !galleryShot && !loadingQueued) {
				loadingQueued = true
				// Leave the fixed step before aborting its sim and transferring the map/backdrop.
				queueMicrotask(() => {
					loadingQueued = false
					if (!run.signal.aborted) beginLoading()
				})
			}
		},
		update(alpha) {
			props.update(sim.tick + alpha, app.camera.view, app.clock.step)
			bowl.update((sim.tick + alpha) * app.clock.step, app.camera.view)
			// A state change must sync the local pick even if its swap cue expired in a hidden tab.
			if (setup.heroId !== hero.heroId) {
				syncPick()
				slam(`${hero.heroId}!`, hero.heroId)
			}
			setup.picks[hero.id].team = hero.seatTeam
			const f = tune.lobby.pick
			for (const human of sim.heroes) {
				if (renderedPicks.get(human.id) !== human.heroId) {
					renderedPicks.set(human.id, human.heroId)
					if (!flips.has(human.id)) flips.set(human.id, sim.tick)
				}
				human.body.setTeam?.(human.seatTeam)
				const k =
					((sim.tick + alpha - (flips.get(human.id) ?? -Infinity)) * app.clock.step) / f.flipTime
				const turn =
					k >= 0 && k < 1 ? 1 - (1 - k) ** 3 + Math.sin(k * Math.PI) * f.flipOvershoot : 1
				human.body.mesh.scale.x = f.flipEdge + (1 - f.flipEdge) * turn
			}
			lobbyHeroes.update(app.camera.view)
		},
		hudFrame(alpha) {
			const step = app.clock.step
			return {
				lobby: true,
				inspectionDisabled: numbers.open || blockedPad.has(3),
				inspectables: props.inspectables,
				hero,
				sim,
				step,
				localTeam: hero.team,
				cooldowns: hero.cd.slice(0, 3).map((cd) => Math.max(0, cd - alpha) * step),
				hp: hero.hp,
				maxHp: hero.maxHp,
				respawn: hero.dead ? Math.max(0, hero.respawnTick - sim.tick - alpha) * step : null,
			}
		},
	}
}
