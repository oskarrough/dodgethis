import * as THREE from 'three'
import { PALETTE } from '../../../core/style.js'
import { el as make } from '../../../core/dom.js'
import { tune as kit } from '../tune.js'
import { matchRecipe } from '../maps/index.js'
import { easeShot } from './backdrop.js'
import { createDescentState, descentFrame } from './descent-state.js'
import { tune } from './tune.js'
import './descent.css'

// The crane and descent: one camera move from the lobby to the match; its only input is Esc/B to quit.
// The lobby run lives until the apex, where the match starts behind the sky. The MOBA map
// scope keeps the world, so the lane is rebuilt on it.
export function startLoading(
	app,
	{ el: lobby, backdrop, difficulty = 'easy', setup, roster, handoff },
) {
	let session = app.session
	let contract = app.modes.current
	const ownsRun = () => app.session === session && app.modes.current === contract
	let dispose
	dispose = app.use((scope) => {
		const reduced = matchMedia('(prefers-reduced-motion: reduce)')
		const gate = createDescentState(() => ({
			crane: reduced.matches ? tune.loading.reducedDuration : tune.shot.apex.time,
			preview: tune.loading.preview,
			duration: reduced.matches ? tune.loading.reducedDuration : tune.loading.duration,
			creep: reduced.matches ? 0 : tune.loading.creep,
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
		let revealTime = 0
		let dived = false
		let buildHold = 0
		let drawn = ''
		scope.clock.pause(() => true)
		scope.intents.suspend(() => true)
		app.intents.cancel()

		const aim = app.camera.aim
		const from = aim.position.clone()
		const look = aim.getWorldDirection(new THREE.Vector3())
		const yaw = Math.atan2(look.x, look.z)
		const pitch = Math.asin(-look.y)
		const lens = aim.fov

		const { layout, palette } = matchRecipe(setup?.map)
		const name = layout.name
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
		root.setAttribute('aria-label', 'Rising over the lobby')
		const lettering = root.querySelector('.front-descent-name')
		const crane = tune.loading.crane
		root.style.setProperty('--name-at', `${tune.shot.apex.time * crane.nameAt}s`)
		root.style.setProperty('--name-letter', `${crane.letter}s`)
		root.style.setProperty('--name-time', `${crane.letterTime}s`)
		document.body.append(root)
		document.body.style.setProperty('--crane-fade', `${tune.shot.apex.time}s`)
		document.body.classList.add('front-craning')
		if (lobby) lobby.inert = true
		backdrop.shot('apex').then(() => gate.arrive())
		// The lobby's dusk lifts to the splash's day as the crane rises into the sky.
		backdrop.tint(0, tune.shot.apex.time)

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
			const establishing = descentFrame(0, hero, tune.loading, kit.follow, layout.bounds, aspect)
			const far = Math.max(
				...previousFar,
				Math.hypot(establishing.eye.y, establishing.eye.z) +
					Math.hypot(layout.bounds.halfX, layout.bounds.halfZ) +
					tune.loading.farMargin,
			)
			for (const camera of cameras)
				if (camera.far !== far) {
					camera.far = far
					camera.updateProjectionMatrix()
				}
			return descentFrame(
				gate.state.progress,
				hero,
				tune.loading,
				kit.follow,
				layout.bounds,
				aspect,
			)
		}

		// At the apex the canvas is clear: swap the lobby run for the match behind the sky.
		function apex() {
			if (!ownsRun()) {
				dispose()
				return false
			}
			match = app.modes.start('moba', {
				session,
				roster,
				options: {
					setup,
					difficulty,
					handoff,
					ready: () => gate.state.phase === 'landed' && !capturing,
				},
			})
			contract = match
			session = app.session
			scope.clock.scale(() => 0)
			if (lobby) lobby.inert = false
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
			hero = match.loadingHero()
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
			return true
		}

		const colors = Object.fromEntries(
			Object.entries({ ...PALETTE, ...palette }).map(([role, value]) => [
				role,
				new THREE.Color(value),
			]),
		)
		const cream = new THREE.Color(PALETTE.cream)
		function draw({ phase, crane: rise, progress }) {
			const key = `${phase}:${rise}:${progress}:${revealTime}`
			if (key === drawn) return
			drawn = key
			// Never fully clear: Chrome stops compositing an opacity-0 canvas, and the lane's
			// GPU work then piles up into one long stall on the first visible frame.
			const floor = tune.loading.crane.floor
			if (phase === 'crane') {
				canvas.style.opacity = String(floor + (1 - floor) * (1 - easeShot(rise)))
				return
			}
			const shown =
				reduced.matches && built && apexTime >= buildHold
					? 1
					: easeShot(
							Math.min(1, revealTime / Math.max(tune.loading.reducedDuration, tune.loading.reveal)),
						)
			backdrop.fade(shown)
			canvas.style.opacity = String(floor + (1 - floor) * shown)
			const eased = easeShot(progress)
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
							? (palette[role] ?? PALETTE[role])
							: color
									.clone()
									.lerp(cream, tune.loading.pastel * (1 - eased))
									.getHex(),
					]),
				),
			)
		}

		// Esc or B quits to the splash from anywhere in the crane or the dive. Local play only:
		// a shared session can't walk out on its guests.
		let quitting = false
		function quit() {
			if (ending || quitting || !app.session.actions.includes('restart')) return
			quitting = true
			app.audio.blip({ ...tune.back, type: 'sine' })
			dispose()
			app.modes.start('moba-front', { options: { setup, backdrop, heldKeys: ['Escape'] } })
		}
		let padBack = !!app.input.pad()?.buttons[1]
		// Every other key goes nowhere until landing; releases still reach input.
		function key(event) {
			if (event.code === 'Backquote' || event.target?.closest?.('.lil-gui')) return
			event.preventDefault()
			event.stopImmediatePropagation()
			if (event.code === 'Escape' && !event.repeat) quit()
		}
		window.addEventListener('keydown', key, { capture: true, signal: scope.signal })

		scope.system('present', ({ dt }) => {
			if (ending) return
			if (!ownsRun()) return dispose()
			const back = !!app.input.pad()?.buttons[1]
			if (back && !padBack) return quit()
			padBack = back
			const before = gate.state.phase
			if (before === 'apex' && !capturing) {
				apexTime += dt
				if (built && apexTime >= buildHold) {
					const reveal = reduced.matches ? 0 : Math.max(0, tune.loading.reveal)
					revealTime = Math.min(reveal, revealTime + dt)
					if (revealTime >= reveal) gate.ready()
				}
			}
			if (!capturing) gate.step(dt)
			const state = gate.state
			if (before === 'crane' && state.phase !== 'crane' && !apex()) return
			if (before === 'apex' && state.phase === 'descent') root.dataset.phase = 'descent'
			if (
				!dived &&
				state.phase !== 'crane' &&
				state.phase !== 'apex' &&
				state.elapsed >= tune.loading.preview
			) {
				dived = true
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
						revealTime,
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
			if (!ending && !quitting) backdrop.dispose()
			restore?.()
			unframe()
			if (match && ownsRun()) app.setPalette(palette)
			cameras.forEach((camera, index) => {
				camera.far = previousFar[index]
				camera.updateProjectionMatrix()
			})
			// A replacement run already owns the canvas and its intro opacity.
			if (ownsRun()) {
				canvas.style.opacity = ''
				if (parent) {
					canvas.classList.remove('front-canvas')
					parent.insertBefore(canvas, next)
				}
			}
			if (lobby) lobby.inert = false
			document.body.classList.remove('front-craning', 'moba-descending')
			document.body.style.removeProperty('--crane-fade')
			root.remove()
		}
	})
	return dispose
}
