import * as THREE from 'three'
import { PALETTE } from '../../core/style.js'
import { clampMap } from './obstacles.js'
import { tune } from './tune.js'
import { tune as frontTune } from './front/tune.js'
import { createBackdrop, easeShot } from './front/backdrop.js'
import { startLoading } from './front/descent.js'
import { createLobbyProps } from './lobby-props.js'
import { HEROES } from './heroes.js'
import { createHeroStrip } from './lobby-heroes.js'
import { createNumbers } from './front/numbers.js'
import './lobby.css'

// The plaza uses the match's simulation and presentation, but owns navigation and framing.
export function createLobby({ app, run, sim, hero, setup, options, gallery }) {
	const backdrop = options.backdrop ?? createBackdrop()
	const el = options.el ?? document.createElement('main')
	const canvas = app.renderer.domElement
	const parent = canvas.parentNode
	const next = canvas.nextSibling
	el.className = 'moba-front front-lobby'
	el.dataset.screen = 'plaza'
	el.setAttribute('aria-label', 'Try your hero in the plaza')
	el.innerHTML = `<button type="button" class="front-return" aria-label="Back to splash"><span aria-hidden="true">←</span><kbd></kbd></button><div class="lobby-pick-stamp" aria-live="polite"></div>`
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
	// The plaza opens by flying in along the camera's own view ray, on the backdrop's shot
	// ease and time; the canvas fades up over the last 40% of the move.
	const intro = { time: frontTune.shot.plaza.time, t: 0 }
	if (matchMedia('(prefers-reduced-motion: reduce)').matches || !(intro.time > 0))
		intro.t = intro.time
	const fadeIntro = () => {
		const k = Math.min(1, intro.t / intro.time)
		canvas.style.opacity =
			k >= 1
				? ''
				: String(Math.max(0, (k - tune.lobby.intro.fadeFrom) / (1 - tune.lobby.intro.fadeFrom)))
	}
	fadeIntro()
	backdrop.shot('plaza', { instant: intro.t >= intro.time })
	run.system('present', ({ dt }) => {
		if (intro.t >= intro.time) return
		intro.t = Math.min(intro.time, intro.t + dt)
		fadeIntro()
	})
	run.camera.frame(() => {
		const c = tune.lobby.camera
		// Fit the whole playable plaza, not only its far half. Portrait widens the lens,
		// never stretching scenery or moving the marks outside the visible ground.
		const scale = Math.max(1, c.fitAspect / Math.max(c.minAspect, innerWidth / innerHeight))
		const back = c.back
		let target = clampMap({
			x: Math.max(-tune.lobby.bounds.halfX, Math.min(tune.lobby.bounds.halfX, c.x)),
			z: Math.max(-tune.lobby.bounds.halfZ, Math.min(tune.lobby.bounds.halfZ, c.z)),
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
			const dz = tune.lobby.bounds.halfZ - baseZ
			const bottom = innerHeight / 2 + (pixels * sin * dz) / (distance - cos * dz)
			const k = (safeBottom - innerHeight / 2) / pixels
			if (bottom > safeBottom && sin + k * cos > tune.collision.epsilon)
				target = clampMap({
					...target,
					z: tune.lobby.bounds.halfZ - (k * distance) / (sin + k * cos),
				})
			const far = -tune.lobby.bounds.halfZ - target.z
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
		return { eye: { ...far, y: c.height * out }, target: { ...target, y: 0 }, fov }
	})
	app.camera.update(0)
	let mouse = false
	let touch = options.device ? options.device === 'touch' : matchMedia('(any-hover: none)').matches
	const readySeats = sim.readySeats
	const props = createLobbyProps(app.scene, el, gallery, readySeats, hero.id, ready)
	props.syncSeats()
	const stamp = el.querySelector('.lobby-pick-stamp')
	const strip = createHeroStrip({
		el,
		heroes: HEROES,
		current: hero.heroId,
		pick: (id) => pickHero(id),
		openNumbers: () => numbers.toggle(),
	})
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
	run.clock.pause(() => numbers.open)
	run.intents.suspend(() => numbers.open)
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
	let flipTick = -Infinity
	let denySoundTick = null
	let gallerySoundTick = null
	let shotSoundTick = null
	let galleryShot = null
	let readyQueued = false
	const syncPick = () => {
		setup.heroId = hero.heroId
		setup.picks[hero.id] = { ...setup.picks[hero.id], heroId: hero.heroId }
		strip.sync(hero.heroId)
		const url = new URL(location.href)
		url.searchParams.set('hero', hero.heroId)
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
	run.on('present', (fact) => {
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
		flipTick = fact.tick
		// Restart the slam: a fresh class on the next frame replays the animation.
		stamp.textContent = fact.heroId + '!'
		stamp.dataset.hero = fact.heroId
		stamp.classList.remove('slam')
		void stamp.offsetWidth
		stamp.classList.add('slam')
		if (pickSoundTick !== fact.tick) {
			pickSoundTick = fact.tick
			app.audio.blip(tune.lobby.pick.sound)
		}
	})
	function pickHero(id) {
		if (ending || numbers.open || id === hero.heroId) return
		if (sim.swapHero(hero.id, id) || denySoundTick === sim.tick) return
		denySoundTick = sim.tick
		app.audio.blip(tune.lobby.pick.denySound)
	}
	function cycleHero() {
		const playable = Object.values(HEROES).filter((definition) => definition.playable)
		const index = playable.findIndex((definition) => definition.id === hero.heroId)
		pickHero(playable[(index + 1) % playable.length].id)
	}

	function cycleDifficulty() {
		if (hero.dead || galleryShot) {
			run.present({
				type: 'denied',
				hero: hero.id,
				slot: 'primary',
				reason: 'gallery-busy',
				tick: sim.tick,
			})
			return
		}
		const frame = app.intents.get(hero.id)
		while (frame.pressed.some((e) => e.action === 'ready')) run.intents.consume(hero.id, 'ready')
		readyQueued = false
		const i = gallery.standees.findIndex((s) => s.id === gallery.difficulty)
		galleryShot = { stand: gallery.standees[(i + 1) % gallery.standees.length], projectile: null }
		// One path plan per shortcut. Walk to the firing mark first.
		app.intents.get(hero.id).order = { ...tune.lobby.gallery.firingMark, kind: 'move' }
	}

	let ending = false
	let transferred = false
	let device = ''
	const heldKeys = new Set(options.heldKeys ?? [])
	const blockedKeys = new Set(heldKeys)
	let previous = app.input.pad()?.buttons.slice() ?? []
	let blockedPad = new Set(previous.flatMap((held, i) => (held ? [i] : [])))
	const backButton = el.querySelector('.front-return')
	const returnSplash = () => {
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
		syncPick()
		ending = true
		app.audio.blip({ ...frontTune.back, type: 'sine' })
		returnSplash()
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
		if (!box) return
		run.intents.press(hero.id, 'ready')
	}
	function beginLoading() {
		if (ending || !readySeats.allReady() || galleryShot) return
		syncPick()
		setup.picks = Object.fromEntries(
			readySeats.seats
				.filter((s) => s.occupant)
				.map((s) => {
					const human = sim.heroes.find((h) => h.id === s.occupant.id)
					return [s.occupant.id, { heroId: human?.heroId ?? s.occupant.heroId, team: s.team }]
				}),
		)
		ending = transferred = true
		app.audio.blip(frontTune.loading.skip)
		startLoading(app, {
			el,
			backdrop,
			setup,
			difficulty: setup.difficulty,
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
			heldKeys.add(event.code)
			if (event.code !== 'Backquote') touch = mouse = false
			if (numbers.key(event)) return
			if (event.repeat || blockedKeys.has(event.code) || event.target?.closest?.('.lil-gui')) return
			if (event.code === 'KeyN') {
				event.preventDefault()
				numbers.toggle()
				return
			}
			if (event.code === 'KeyH') {
				event.preventDefault()
				cycleHero()
				return
			}
			if (event.code === 'KeyG') {
				event.preventDefault()
				cycleDifficulty()
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
		{ signal: run.signal },
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
		// The crane takes no input, pad included.
		if (ending) return void (previous = buttons.slice())
		const down = (i) => buttons[i] && !previous[i]
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
		props.setDevice(device)
		strip.setDevice(device)
		backButton.querySelector('kbd').textContent =
			device === 'gamepad' ? 'B' : device === 'keyboard' ? 'Esc' : ''
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
	run.debug.expose({
		lobby: {
			sim,
			setup,
			layout: tune.lobby,
			strip,
			gallery,
			galleryProps: props.galleryProps,
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
			numbers.dispose()
			strip.dispose()
			props.dispose()
			canvas.classList.remove('front-canvas')
			parent.insertBefore(canvas, next)
			el.remove()
			if (!transferred) backdrop.dispose()
			app.setPalette({})
		},
		{ once: true },
	)
	return {
		frozen: () => numbers.open,
		presentationFrozen: () => numbers.open,
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
			if (
				gallery.aimsAt(frame.order, tune.lobby.gallery.radius + tune.orders.pick) &&
				!frame.order.kind
			) {
				run.intents.press(hero.id, 'primary', frame.order)
				frame.order = null
				return
			}
		},
		// At a fixed-step boundary, using the previous step's position. Stop must reach
		// the sim before intents age; queueing it after sim.step would drop a one-step edge.
		step() {
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
			if (readySeats.allReady() && !galleryShot && !loadingQueued) {
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
			// The new body comes round from edge-on, widening past full and settling.
			const f = tune.lobby.pick
			const k = ((sim.tick + alpha - flipTick) * app.clock.step) / f.flipTime
			const turn = k >= 0 && k < 1 ? 1 - (1 - k) ** 3 + Math.sin(k * Math.PI) * f.flipOvershoot : 1
			hero.body.mesh.scale.x = f.flipEdge + (1 - f.flipEdge) * turn
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
