import * as THREE from 'three'
import { PALETTE } from '../../../core/style.js'
import { el as make } from '../../../core/dom.js'
import { tune as kit } from '../tune.js'
import { FLOOR } from '../obstacles.js'
import { easeShot } from './backdrop.js'
import { createDescentState, descentFrame, localLoadingHero } from './descent-state.js'
import { tune } from './tune.js'
import './descent.css'

// The crane and descent: one camera move from the plaza to the match that takes no input.
// The plaza run lives until the apex, where the match starts behind the sky. The MOBA map
// scope keeps the world, so the lane is rebuilt on it.
export function startLoading(app, { el: plaza, backdrop, difficulty = 'easy', setup }) {
	let dispose
	dispose = app.use((scope) => {
		const gate = createDescentState(() => ({
			crane: tune.shot.apex.time,
			duration: tune.loading.duration,
		}))
		const canvas = app.renderer.domElement
		const cameras = [app.camera.view, app.camera.aim]
		const previousFar = cameras.map((camera) => camera.far)
		let match = null
		let hero = null
		let restore = null
		let parent = null
		let next = null
		let capturing = false
		let capture = null
		let ending = false
		let built = false
		let apexTime = 0
		let buildHold = 0
		let drawn = ''
		scope.clock.pause(() => true)
		scope.intents.suspend(() => true)
		app.intents.cancel()

		// The plaza camera as it stands now, with the look split into yaw and pitch.
		const aim = app.camera.aim
		const from = aim.position.clone()
		const look = aim.getWorldDirection(new THREE.Vector3())
		const yaw = Math.atan2(look.x, look.z)
		const pitch = Math.asin(-look.y)
		const lens = aim.fov

		const name = tune.loading.mapName
		const root = make(
			'main',
			'moba-front front-descent',
			null,
			`<h1 class="front-descent-name" aria-label="${name}">${[...name]
				.map(
					(letter, i) =>
						`<span aria-hidden="true" style="--i:${i}">${letter === ' ' ? '&nbsp;' : letter}</span>`,
				)
				.join('')}</h1>`,
		)
		root.dataset.phase = 'crane'
		root.setAttribute('aria-label', 'Rising over the plaza')
		const lettering = root.querySelector('.front-descent-name')
		const crane = tune.loading.crane
		root.style.setProperty('--name-at', `${tune.shot.apex.time * crane.nameAt}s`)
		root.style.setProperty('--name-letter', `${crane.letter}s`)
		root.style.setProperty('--name-time', `${crane.letterTime}s`)
		document.body.append(root)
		document.body.style.setProperty('--crane-fade', `${tune.shot.apex.time}s`)
		document.body.classList.add('front-craning')
		if (plaza) plaza.inert = true
		backdrop.shot('apex').then(() => gate.arrive())

		let unframe = scope.camera.frame(() => {
			const e = easeShot(gate.state.crane)
			const tilt = pitch + ((crane.pitch * Math.PI) / 180 - pitch) * e
			const eye = { x: from.x, y: from.y + crane.rise * e, z: from.z }
			const ahead = Math.cos(tilt)
			return {
				eye,
				target: {
					x: eye.x + Math.sin(yaw) * ahead,
					y: eye.y - Math.sin(tilt),
					z: eye.z + Math.cos(yaw) * ahead,
				},
				fov: lens,
			}
		})
		// Registered after the match's follow camera, so it wins until landing.
		function descend() {
			const aspect = innerWidth / innerHeight
			const establishing = descentFrame(0, hero, tune.loading, kit.follow, FLOOR, aspect)
			const far = Math.max(
				...previousFar,
				Math.hypot(establishing.eye.y, establishing.eye.z) +
					Math.hypot(FLOOR.halfX, FLOOR.halfZ) +
					tune.loading.farMargin,
			)
			for (const camera of cameras)
				if (camera.far !== far) {
					camera.far = far
					camera.updateProjectionMatrix()
				}
			return descentFrame(gate.state.progress, hero, tune.loading, kit.follow, FLOOR, aspect)
		}

		// At the apex the canvas is clear: swap the plaza run for the match behind the sky.
		function apex() {
			match = app.modes.start('moba', {
				session: app.session,
				options: { setup, difficulty, ready: () => gate.state.phase === 'landed' && !capturing },
			})
			scope.clock.scale(() => 0)
			if (plaza) plaza.inert = false
			parent = canvas.parentNode
			next = canvas.nextSibling
			root.prepend(backdrop.el, canvas)
			canvas.classList.add('front-canvas')
			canvas.inert = false
			root.dataset.phase = 'apex'
			root.setAttribute('aria-label', `Dropping into ${name}`)
			document.body.classList.remove('front-craning')
			document.body.classList.add('moba-descending')
			app.audio.setMusicScene('wind')
			const local = app.session.local[0]
			hero = localLoadingHero(match.snapshot(), local)
			unframe()
			unframe = scope.camera.frame(descend)
			restore = scope.setStylePreset({ line: tune.loading.line, hatch: 1, alpha: true })
			// The first lane frame compiles its shaders behind the sky, not on landing.
			Promise.resolve()
				.then(() => app.renderer.compileAsync?.(app.scene, app.camera.view))
				.catch(() => {})
				.then(() => {
					if (!scope.signal.aborted) built = true
				})
		}

		const colors = Object.fromEntries(
			Object.entries(PALETTE).map(([role, value]) => [role, new THREE.Color(value)]),
		)
		const cream = new THREE.Color(PALETTE.cream)
		function draw({ phase, crane: rise, progress }) {
			const key = `${phase}:${rise}:${progress}`
			if (key === drawn) return
			drawn = key
			// Never fully clear: Chrome stops compositing an opacity-0 canvas, and the lane's
			// GPU work then piles up into one long stall on the first visible frame.
			const floor = tune.loading.crane.floor
			if (phase === 'crane') {
				canvas.style.opacity = String(floor + (1 - floor) * (1 - easeShot(rise)))
				return
			}
			const eased = easeShot(progress)
			backdrop.fade(eased)
			canvas.style.opacity = String(floor + (1 - floor) * eased)
			const name = Math.min(1, progress / Math.max(0.01, tune.loading.uiFadeEnd))
			lettering.style.opacity = String(1 - easeShot(name))
			restore.update({
				line: tune.loading.line + (1 - tune.loading.line) * eased,
				hatch: 1 - eased,
				alpha: true,
			})
			app.setPalette(
				Object.fromEntries(
					Object.entries(colors).map(([role, color]) => [
						role,
						role === 'ink' || role === 'cream'
							? PALETTE[role]
							: color
									.clone()
									.lerp(cream, tune.loading.pastel * (1 - eased))
									.getHex(),
					]),
				),
			)
		}

		// Every key goes nowhere until landing; releases still reach input.
		function key(event) {
			if (event.code === 'Backquote' || event.target?.closest?.('.lil-gui')) return
			event.preventDefault()
			event.stopImmediatePropagation()
		}
		window.addEventListener('keydown', key, { capture: true, signal: scope.signal })

		scope.system('present', ({ dt }) => {
			if (ending) return
			const before = gate.state.phase
			if (before === 'apex') {
				apexTime += dt
				if (built && apexTime >= buildHold) gate.ready()
			}
			if (!capturing) {
				const remaining =
					capture && gate.state.phase === 'descent'
						? Math.max(0, (capture.progress - gate.state.progress) * tune.loading.duration)
						: dt
				gate.step(Math.min(dt, remaining))
			}
			const state = gate.state
			if (before === 'crane' && state.phase !== 'crane') apex()
			if (before === 'apex' && state.phase === 'descent') {
				root.dataset.phase = 'descent'
				app.audio.blip(tune.loading.drop)
			}
			const flying = state.phase === 'descent' || state.phase === 'landed'
			if (capture && flying && state.progress >= capture.progress) {
				capturing = true
				capture.resolve(state)
				capture = null
			}
			draw(state)
			app.camera.update(0)
			if (state.phase === 'landed' && !capturing) {
				ending = true
				app.intents.cancel()
				app.clock.reset()
				// Prime the actual follow spring with neutral intents before its first live step.
				unframe()
				app.camera.update(0)
				app.audio.blip(tune.loading.arrival)
				app.audio.setMusicScene('play')
				dispose()
				backdrop.dispose()
			}
		})

		scope.debug.expose({
			descent: {
				get state() {
					return {
						...gate.state,
						apexTime,
						built,
						tick: match?.snapshot().t ?? null,
						camera: app.camera.view.position.toArray(),
					}
				},
				// Stub a slow build: the lane counts as built no sooner than `seconds` after the apex.
				holdBuild(seconds) {
					if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Invalid build hold')
					if (gate.state.phase !== 'crane' && gate.state.phase !== 'apex')
						throw new Error('The descent already started')
					buildHold = seconds
				},
				// Pause on the next actual render-time crossing, not an injected camera pose.
				captureAt(progress) {
					if (![0, 0.5, 1].includes(progress)) throw new Error('Invalid descent capture')
					capturing = false
					return new Promise((resolve) => {
						capture = { progress, resolve }
					})
				},
				resume() {
					capturing = false
				},
			},
		})
		return () => {
			capture?.resolve(null)
			if (!ending) backdrop.dispose()
			restore?.()
			unframe()
			if (match) app.setPalette({})
			cameras.forEach((camera, index) => {
				camera.far = previousFar[index]
				camera.updateProjectionMatrix()
			})
			canvas.style.opacity = ''
			if (parent) {
				canvas.classList.remove('front-canvas')
				parent.insertBefore(canvas, next)
			}
			if (plaza) plaza.inert = false
			document.body.classList.remove('front-craning', 'moba-descending')
			document.body.style.removeProperty('--crane-fade')
			root.remove()
		}
	})
	return dispose
}
