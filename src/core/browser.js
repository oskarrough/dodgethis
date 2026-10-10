import * as THREE from 'three'
import * as input from './input.js'
import * as audio from './audio.js'
import { createApp, STEP } from './app.js'
import { direct, pointClick, POINT_CLICK } from './intents.js'
import { initPhysics } from './physics.js'
import { createRenderer } from './render.js'
import { createOverlay } from './overlay.js'
import { createPerformanceMonitor } from './performance.js'
import { FORWARD_LAYER } from './stylepass.js'
import { applyCssVariables } from './style.js'
import { log, createCombatLog, createDebugPanel } from './debug.js'
import { createProofApi } from './proof.js'
import { tune } from './tune.js'

// The browser shell: builds the DOM services, runs the requestAnimationFrame loop, and owns diagnostics, mute and the collider overlay.
export async function createBrowserApp() {
	applyCssVariables() // one palette drives both the WebGL world and the HTML chrome
	const { RAPIER, world } = await initPhysics()
	world.timestep = STEP
	const debugWorlds = []
	const activeWorld = () => debugWorlds.at(-1)?.world ?? world
	const view = createRenderer()
	const perf = createPerformanceMonitor()
	const stats = { fps: 0, perf: null }
	const panel = createDebugPanel()
	// The pointer's ground point, through the unshaken aim camera.
	const raycaster = new THREE.Raycaster()
	const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
	const hit = new THREE.Vector3()
	function pointerGround() {
		raycaster.setFromCamera(input.pointerNDC(), view.aimCamera)
		return raycaster.ray.intersectPlane(ground, hit)
	}
	const clicks = pointClick(input, pointerGround)
	const bindings = {
		direct: () => direct(input, pointerGround),
		pointClick: ({ stickAim }) => clicks(stickAim),
	}
	let scheme = 'direct'
	const app = createApp({
		device: {
			sample(next, context) {
				if (!bindings[next]) throw new Error(`No device binding for scheme: ${next}`)
				scheme = next
				return bindings[next](context)
			},
			reset: input.resetActions,
		},
		scene: view.scene,
		world,
		RAPIER,
		renderer: view.renderer,
		setPalette: view.setPalette,
		setStylePreset: view.setStylePreset,
		camera: {
			view: view.camera,
			aim: view.aimCamera, // never shaken: pointer rays stay gameplay-stable
			shake: view.addShake,
			kick: view.kickFov,
			update: view.updateCamera,
			frame: view.frame,
		},
		input,
		audio,
		overlay: createOverlay(),
		debug: {
			panel,
			perf,
			stats,
			combat: createCombatLog(),
			log,
			world(world) {
				const entry = { world }
				debugWorlds.push(entry)
				world.gravity = { x: 0, y: tune.physics.gravity, z: 0 }
				return () => {
					const index = debugWorlds.indexOf(entry)
					if (index < 0) return
					debugWorlds.splice(index, 1)
					activeWorld().gravity = { x: 0, y: tune.physics.gravity, z: 0 }
				}
			},
		},
	})
	log.info('booted', { renderer: 'style-pass', physics: 'rapier' })

	// Mute the shared output so already-playing cues go silent too.
	const muteBtn = document.querySelector('.mute')
	function renderMute() {
		const muted = !tune.output.sound
		muteBtn.textContent = muted ? '🔇' : '🔊'
		muteBtn.classList.toggle('muted', muted)
		muteBtn.title = muted ? 'Unmute' : 'Mute'
		muteBtn.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound')
		muteBtn.setAttribute('aria-pressed', String(muted))
	}
	muteBtn.addEventListener('click', () => {
		audio.setSound(!tune.output.sound)
		renderMute()
		if (tune.output.sound) audio.sfx.switch() // audible confirmation when unmuting
	})
	renderMute()

	// Edge panning wants the cursor to hit the real screen edge, so offer fullscreen where it exists.
	const fullscreenBtn = document.querySelector('.fullscreen')
	const fullscreenIcon = fullscreenBtn.querySelector('path')
	function renderFullscreen() {
		const on = Boolean(document.fullscreenElement)
		fullscreenIcon.setAttribute(
			'd',
			on ? 'M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6' : 'M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6',
		)
		fullscreenBtn.title = on ? 'Exit fullscreen' : 'Fullscreen'
		fullscreenBtn.setAttribute('aria-label', fullscreenBtn.title)
	}
	fullscreenBtn.hidden = !document.fullscreenEnabled
	fullscreenBtn.addEventListener('click', () => {
		if (document.fullscreenElement) document.exitFullscreen()
		else document.documentElement.requestFullscreen().catch(() => {})
		fullscreenBtn.blur() // keep Space and Enter for the game
	})
	document.addEventListener('fullscreenchange', renderFullscreen)
	renderFullscreen()

	const debugGeom = new THREE.BufferGeometry()
	const debugLines = new THREE.LineSegments(
		debugGeom,
		new THREE.LineBasicMaterial({ vertexColors: true }),
	)
	debugLines.layers.set(FORWARD_LAYER)
	debugLines.visible = tune.debug.showColliders
	app.scene.add(debugLines)
	function drawColliders() {
		if (!debugLines.visible) return
		const { vertices, colors } = activeWorld().debugRender()
		// Reuse same-sized GPU buffers; replacing attributes leaks old buffers until geometry disposal.
		const pos = debugGeom.getAttribute('position')
		if (pos && pos.array.length === vertices.length) {
			pos.array.set(vertices)
			pos.needsUpdate = true
			const col = debugGeom.getAttribute('color')
			col.array.set(colors)
			col.needsUpdate = true
		} else {
			debugGeom.dispose()
			debugGeom.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
			debugGeom.setAttribute('color', new THREE.BufferAttribute(colors, 4))
		}
	}

	app.debug.tune('physics', tune.physics, (f, t) => {
		f.add(t, 'gravity', -30, 0, 0.1).onChange(
			() => (activeWorld().gravity = { x: 0, y: t.gravity, z: 0 }),
		)
		f.add(t, 'timeScale', 0, 2, 0.05)
		f.add(t, 'paused')
	})
	app.debug.tune('camera', tune.camera)
	app.debug.tune('pointClick', POINT_CLICK, (f, t) => {
		f.add(t, 'deadzone', 0, 0.5, 0.01).name('stick deadzone')
		f.add(t, 'curve', 1, 3, 0.05).name('stick curve')
		f.add(t, 'resend', 10, 300, 1).name('RMB resend (ms)')
	})
	app.debug.tune('output', tune.output, (f, t) => {
		f.add(t, 'sound').onChange(() => {
			audio.setSound(t.sound)
			renderMute()
		})
		f.add(t, 'volume', 0, 1, 0.05).onChange(audio.syncMusic)
		f.add(t, 'shake')
	})
	app.debug.tune('debug', tune.debug, (f, t) => {
		f.add(t, 'showColliders').onChange(() => (debugLines.visible = t.showColliders))
		f.add(t, 'logLevel', ['debug', 'info', 'warn', 'error'])
		f.add({ dumpLog: () => log.dump() }, 'dumpLog').name('dump log → console')
	})

	// window.dt (core/proof.js) stays once shown, so a proof can hide the HUD for a screenshot.
	const hud = document.querySelector('.hud')
	const combatEl = document.querySelector('.combat')
	const proof = createProofApi(app, input)
	let diagnostics = new URLSearchParams(location.search).has('debug')
	function setDiagnostics(enabled) {
		diagnostics = enabled
		hud.hidden = !enabled
		combatEl.hidden = !enabled
		if (enabled) panel.show()
		else panel.hide()
		if (enabled || import.meta.env.DEV) window.game = app.debug.game
		else delete window.game
		if (enabled || import.meta.env.DEV) window.dt = proof
	}
	setDiagnostics(diagnostics)
	window.addEventListener('keydown', (e) => {
		if (!e.defaultPrevented && !e.repeat && e.code === 'Backquote') setDiagnostics(!diagnostics)
	})

	app.debug.expose({
		tune: app.debug.tunables,
		perf,
		renderer: view.renderer,
		scene: app.scene,
		camera: view.camera,
		get world() {
			return activeWorld()
		},
		async benchmark({ seconds = 10, warmup = 2 } = {}) {
			if (
				![seconds, warmup].every(Number.isFinite) ||
				seconds <= 0 ||
				seconds > 60 ||
				warmup < 0 ||
				warmup > 60
			)
				throw new Error('Invalid benchmark duration')
			await new Promise((resolve) => setTimeout(resolve, warmup * 1000))
			perf.enabled = true
			perf.reset()
			const before = app.debug.game.snapshot?.()
			await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
			return {
				...perf.report(),
				before,
				after: app.debug.game.snapshot?.(),
				viewport: {
					width: innerWidth,
					height: innerHeight,
					pixelRatio: view.renderer.getPixelRatio(),
				},
				draw: { ...view.renderer.info.render },
				memory: { ...view.renderer.info.memory },
				hidden: document.hidden,
			}
		},
	})

	// Core's input phase: poll the pad, turn its pause button into the menu event, and tell the overlay which glyphs to show.
	app.system('input', ({ dt }) => {
		input.pollGamepad(dt, scheme === 'direct')
		if (input.consumePause()) app.emit('menu')
		app.overlay.setDevice(input.activeDevice())
	})
	let simulationEnd = 0
	app.system('present', () => {
		if (perf.enabled) simulationEnd = performance.now()
	})

	let last = performance.now()
	window.addEventListener('blur', () => app.emit('blur'))
	// Reset stale rAF time on tab return to avoid an artificial 0.1s simulation step.
	document.addEventListener('visibilitychange', () => {
		if (!document.hidden) last = performance.now()
	})
	let frames = 0
	let fpsTimer = 0

	function frame(now) {
		const frameStart = perf.enabled ? performance.now() : 0
		const interval = now - last
		const dt = Math.min(interval / 1000, 0.1)
		last = now
		app.frame(dt)
		drawColliders()
		const renderStart = perf.enabled ? performance.now() : 0
		if (app.shouldRender) view.render()
		else view.renderer.info.reset()
		const renderEnd = perf.enabled ? performance.now() : 0

		frames++
		fpsTimer += interval / 1000
		if (fpsTimer >= 0.5) {
			stats.fps = Math.round(frames / fpsTimer)
			stats.perf = perf.enabled ? perf.report() : null
			frames = 0
			fpsTimer = 0
		}
		if (perf.enabled)
			perf.record({
				frame: interval,
				simulation: simulationEnd - frameStart,
				presentation: renderStart - simulationEnd,
				render: renderEnd - renderStart,
				cpu: performance.now() - frameStart,
			})
		requestAnimationFrame(frame)
	}
	app.run = () => requestAnimationFrame(frame)
	return app
}

export function reportBootError(err) {
	console.error(err)
	log.error('boot failed', String(err))
	const hud = document.querySelector('.hud')
	hud.hidden = false
	hud.textContent = 'boot error — see console\n' + err
}
