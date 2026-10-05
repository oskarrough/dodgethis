import * as THREE from 'three'
import { PALETTE } from '../../core/style.js'
import { clampMap } from './obstacles.js'
import { tune } from './tune.js'
import { tune as frontTune } from './front/tune.js'
import { createBackdrop } from './front/backdrop.js'
import { startLoading } from './front/loading.js'
import './lobby.css'

// The plaza uses the match's simulation and presentation, but owns navigation and framing.
export function createLobby({ app, run, sim, hero, setup, options }) {
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
		const target = clampMap({
			x: Math.max(-tune.lobby.bounds.halfX, Math.min(tune.lobby.bounds.halfX, c.x)),
			z: Math.max(-tune.lobby.bounds.halfZ, Math.min(tune.lobby.bounds.halfZ, c.z)),
		})
		const eye = clampMap({ x: target.x, z: target.z + c.back })
		return { eye: { ...eye, y: c.height }, target: { ...target, y: 0 }, fov: c.fov }
	})
	el.style.setProperty('--lobby-sky-lift', `${-tune.lobby.skyLift}px`)
	app.camera.update(0)

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
		if (Object.keys(app.intents.get(hero.id).held).length) {
			app.intents.cancel(hero.id)
			return
		}
		ending = true
		app.audio.blip({ ...frontTune.back, type: 'sine' })
		returnHero()
	}
	function ready() {
		if (ending) return
		ending = transferred = true
		app.audio.blip(frontTune.loading.skip)
		startLoading(app, {
			el,
			backdrop,
			setup,
			difficulty: setup.difficulty,
			buildWait: options.buildWait,
			// A cancelled descent returns to practice, with the same map and pick.
			returnHero: () => app.modes.start('moba-lobby', { options: { setup } }),
		})
	}
	backButton.onclick = back
	startButton.onclick = ready
	window.addEventListener(
		'keydown',
		(event) => {
			heldKeys.add(event.code)
			if (event.repeat || blockedKeys.has(event.code) || event.target?.closest?.('.lil-gui')) return
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
		previous = buttons.slice()
		if (cancel) back()
		else if (start) ready()
		const nextDevice = app.input.activeDevice()
		if (device === nextDevice) return
		device = nextDevice
		el.dataset.device = device
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
		f.add(c, 'fov', 20, 70, 1)
	})
	run.debug.expose({ lobby: { sim, setup, snapshot: sim.snapshot } })
	run.signal.addEventListener(
		'abort',
		() => {
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
