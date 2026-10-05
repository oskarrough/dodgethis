import * as THREE from 'three'
import { PALETTE } from '../../core/style.js'
import { clampMap } from './obstacles.js'
import { tune } from './tune.js'
import { tune as frontTune } from './front/tune.js'
import { createBackdrop } from './front/backdrop.js'
import { startLoading } from './front/loading.js'
import { createLobbyStands } from './lobby-props.js'
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
	el.innerHTML = `<footer><button type="button" class="front-back front-return" aria-label="Back to hero select">Back <kbd></kbd></button><button type="button" class="front-sticker front-cta" aria-label="Start match"><span class="front-card-face"></span><span>Start</span><kbd></kbd></button></footer>`
	el.prepend(backdrop.el, canvas)
	canvas.classList.add('front-canvas')
	canvas.inert = false
	document.body.append(el)
	app.audio.setMusicScene('wind')
	run.setStylePreset({ line: frontTune.preview.line, hatch: 1, alpha: true })
	const cream = new THREE.Color(PALETTE.cream)
	app.setPalette(
		Object.fromEntries(
			Object.entries(PALETTE).map(([role, color]) => [
				role,
				['ink', 'cream'].includes(role)
					? color
					: new THREE.Color(color).lerp(cream, frontTune.preview.pastel).getHex(),
			]),
		),
	)
	run.camera.frame(() => {
		const c = tune.lobby.camera
		// Fit the whole playable plaza, not only its far half. Portrait widens the lens,
		// never stretching scenery or moving the marks outside the visible ground.
		const scale = Math.max(1, c.fitAspect / Math.max(c.minAspect, innerWidth / innerHeight))
		const back = c.back
		const target = clampMap({
			x: Math.max(-tune.lobby.bounds.halfX, Math.min(tune.lobby.bounds.halfX, c.x)),
			z: Math.max(-tune.lobby.bounds.halfZ, Math.min(tune.lobby.bounds.halfZ, c.z)),
		})
		const eye = clampMap({ x: target.x, z: target.z + back })
		const fov = (Math.atan(Math.tan((c.fov * Math.PI) / 360) * scale) * 360) / Math.PI
		return { eye: { ...eye, y: c.height }, target: { ...target, y: 0 }, fov }
	})
	el.style.setProperty('--lobby-sky-lift', `${-tune.lobby.skyLift}px`)
	app.camera.update(0)
	const props = createLobbyStands(app.scene, el, gallery)
	let occupied = null
	let pickSoundTick = null
	let denySoundTick = null
	let gallerySoundTick = null
	let shotSoundTick = null
	let galleryShot = null
	let readyQueued = false
	const syncPick = () => {
		setup.heroId = hero.heroId
		setup.picks[hero.id] = { ...setup.picks[hero.id], heroId: hero.heroId }
		props.select(hero.heroId)
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
			fact.type === 'expired' &&
			fact.projectile === galleryShot.projectile
		)
			finishGalleryShot()
		if (fact.hero !== hero.id) return
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
		if (pickSoundTick !== fact.tick) {
			pickSoundTick = fact.tick
			app.audio.blip(tune.lobby.stands.pickSound)
		}
	})
	function denyStand(id) {
		props.deny(id, sim.tick)
		if (denySoundTick !== sim.tick) {
			denySoundTick = sim.tick
			app.audio.blip(tune.lobby.stands.denySound)
		}
	}
	function cycleHero() {
		const playable = props.stands.filter((stand) => stand.playable)
		const index = playable.findIndex((stand) => stand.id === hero.heroId)
		const next = playable[(index + 1) % playable.length]
		if (!sim.swapHero(hero.id, next.id)) denyStand(next.id)
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
		const i = gallery.standees.findIndex((s) => s.id === gallery.difficulty)
		galleryShot = { stand: gallery.standees[(i + 1) % gallery.standees.length], projectile: null }
		// One path plan per shortcut. Get a clear line of fire rather than shooting through pillars.
		app.intents.get(hero.id).order = { ...tune.lobby.gallery.firingMark, kind: 'move' }
	}

	let ending = false
	let transferred = false
	let device = ''
	const heldKeys = new Set(options.heldKeys ?? [])
	const blockedKeys = new Set(heldKeys)
	let previous = app.input.pad()?.buttons.slice() ?? []
	const backButton = el.querySelector('.front-return')
	const startButton = el.querySelector('.front-cta')
	const returnHero = () =>
		app.modes.start('moba-front', {
			options: { hero: true, setup, heldKeys: [...heldKeys] },
		})
	function back() {
		if (ending) return
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
		returnHero()
	}
	function ready() {
		if (ending) return
		if (galleryShot) {
			readyQueued = true
			return
		}
		syncPick()
		ending = transferred = true
		app.audio.blip(frontTune.loading.skip)
		startLoading(app, {
			el,
			backdrop,
			setup,
			difficulty: setup.difficulty,
			buildWait: options.buildWait,
			// A cancelled descent returns to practice, with the same map and pick.
			returnHero: () => app.modes.start('moba-lobby', { options: { setup, el, backdrop } }),
		})
	}
	backButton.onclick = back
	startButton.onclick = ready
	window.addEventListener(
		'keydown',
		(event) => {
			heldKeys.add(event.code)
			if (event.repeat || blockedKeys.has(event.code) || event.target?.closest?.('.lil-gui')) return
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
		},
		{ signal: run.signal },
	)
	run.system('input', () => {
		const buttons = app.input.pad()?.buttons ?? []
		const down = (i) => buttons[i] && !previous[i]
		const cancel = down(1)
		const start = down(9)
		const cycle = down(12)
		const difficulty = down(13)
		previous = buttons.slice()
		if (cancel) back()
		else if (start) ready()
		else if (cycle) cycleHero()
		else if (difficulty) cycleDifficulty()
		const nextDevice = app.input.activeDevice()
		if (device === nextDevice) return
		device = nextDevice
		el.dataset.device = device
		props.setDevice(device)
		backButton.querySelector('kbd').textContent = device === 'gamepad' ? 'B' : 'Esc'
		startButton.querySelector('kbd').textContent = device === 'gamepad' ? 'Start' : 'Enter'
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
			stands: props.stands,
			gallery,
			galleryProps: props.galleryProps,
			snapshot: sim.snapshot,
		},
	})
	run.signal.addEventListener(
		'abort',
		() => {
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
		frozen: () => false,
		presentationFrozen: () => false,
		result() {},
		prepareInput() {
			const frame = app.intents.get(hero.id)
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
			if (gallery.aimsAt(frame.order) && !frame.order.kind) {
				run.intents.press(hero.id, 'primary', frame.order)
				frame.order = null
				return
			}
			if (frame.order.kind) return
			// A dummy's projected torso can overlap a pad. Choosing a stand means walking,
			// not accidentally chasing the sparring dummy standing in front of it.
			if (
				props.stands.some(
					(stand) =>
						Math.hypot(frame.order.x - stand.x, frame.order.z - stand.z) <=
						tune.lobby.stands.radius,
				)
			)
				frame.order = { ...frame.order, kind: 'move' }
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
				occupied = null
				return
			}
			const p = hero.body.position,
				v = tune.lobby.stands
			if (occupied && Math.hypot(p.x - occupied.x, p.z - occupied.z) <= v.radius + v.exitMargin)
				return
			occupied = null
			let stand = null,
				nearest = v.radius
			for (const candidate of props.stands) {
				const distance = Math.hypot(p.x - candidate.x, p.z - candidate.z)
				if (distance < nearest || (distance === nearest && (!stand || candidate.id < stand.id))) {
					stand = candidate
					nearest = distance
				}
			}
			if (!stand) return
			occupied = stand
			if (sim.swapHero(hero.id, stand.id)) return
			denyStand(stand.id)
			// A real, collision-clamped bump, not a teleport or another ability's cast.
			const dx = p.x - stand.x,
				dz = p.z - stand.z
			const length = Math.hypot(dx, dz)
			const frame = app.intents.get(hero.id)
			if (frame.order && Math.hypot(frame.order.x - stand.x, frame.order.z - stand.z) <= v.radius)
				frame.order = null
			run.intents.press(hero.id, 'stop')
			hero.body.dash(length ? { x: dx / length, z: dz / length } : { x: 0, z: 1 }, {
				distance: v.nudgeDistance,
				time: v.nudgeTime,
			})
		},
		update(alpha) {
			props.update(sim.tick + alpha, app.camera.view, app.clock.step)
		},
		hudFrame(alpha) {
			const step = app.clock.step
			return {
				lobby: true,
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
