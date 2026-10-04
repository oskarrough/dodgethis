import * as THREE from 'three'
import { PALETTE } from '../../../core/style.js'
import { tune as kit } from '../tune.js'
import { FLOOR } from '../obstacles.js'
import { createControls } from './controls.js'
import { createLoadingState, descentFrame, localLoadingHero } from './loading-state.js'
import { projectRidge } from './geometry.js'
import { tune } from './tune.js'
import './loading.css'

// Parent-owned presentation scope survives starting the real match. The match itself
// owns every body, map mesh and collider; cancellation aborts it through modes.start.
export function startLoading(
	app,
	{ el, backdrop, returnHero, buildWait = 0, difficulty = 'easy', setup },
) {
	let dispose
	dispose = app.use((scope) => {
		const gate = createLoadingState(tune.loading)
		let capturing = false
		let capture = null
		let restore = null
		let unframe = null
		let match = null
		let ending = false
		const canvas = app.renderer.domElement
		scope.clock.pause(() => true)
		scope.clock.scale(() => 0)
		scope.intents.suspend(() => true)
		app.intents.cancel()
		// mode start is synchronous today; waiting remains explicit for future async assets.
		const rasterReady = backdrop.prepareDescent()
		const session = app.session
		match = app.modes.start('moba', {
			session,
			options: { setup, difficulty, ready: () => gate.state.phase === 'landed' && !capturing },
		})
		const parent = canvas.parentNode
		const next = canvas.nextSibling
		const hero = localLoadingHero(match.snapshot(), app.session.local[0])
		const cameras = [app.camera.view, app.camera.aim]
		const previousFar = cameras.map((camera) => camera.far)
		app.audio.setMusicScene('wind')
		el.className = 'moba-front front-loading'
		el.setAttribute('aria-label', 'Loading the lane')
		el.replaceChildren(backdrop.el)
		const figures = (team) =>
			`<div class="front-loading-team ${team}" aria-label="${team === 'A' ? 'Your' : 'Opposing'} ridge">${Array.from({ length: 3 }, (_, i) => `<svg viewBox="0 0 40 76" aria-label="${i ? 'Unoccupied seat' : 'Fletcher'}" class="${i ? 'vacant' : ''}"><path d="M12 20 Q7 4 20 3 Q33 4 28 20 L24 27 L32 48 L27 54 L28 76 H22 L19 54 L16 76 H10 L12 52 L7 46 L16 27Z"/><path d="M30 28 Q41 44 30 58 M30 28 V58" fill="none"/></svg>`).join('')}</div>`
		const ui = document.createElement('section')
		ui.className = 'front-loading-ui'
		ui.innerHTML = `<h1>${tune.loading.mapName}</h1><p class="front-load-status" aria-live="polite">Preparing the view</p>${figures('A')}${figures('B')}<footer><button class="front-back front-return" aria-label="Back to hero select"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M27 10 L10 24 L27 38 L27 30 L38 30 L38 18 L27 18Z"/></svg><kbd class="front-return-key"></kbd></button><button class="front-skip">Start now</button><p class="front-prompts"></p></footer>`
		function positionFigures() {
			const size = Math.max(
				tune.loading.figureWidth.min,
				Math.min(tune.loading.figureWidth.max, innerWidth * tune.loading.figureWidth.fraction),
			)
			ui.querySelectorAll('.front-loading-team').forEach((team, teamIndex) => {
				team.querySelectorAll('svg').forEach((figure, index) => {
					const foot = projectRidge(
						innerWidth,
						innerHeight,
						innerWidth * (tune.loading.figureStart[teamIndex] + index * tune.loading.figureSpacing),
					)
					figure.style.width = `${size}px`
					figure.style.left = `${foot.x - size / 2}px`
					figure.style.top = `${foot.y - (size * 76) / 40}px`
				})
			})
		}
		positionFigures()
		window.addEventListener('resize', positionFigures, { signal: scope.signal })
		el.append(canvas, ui)
		canvas.classList.add('front-canvas')
		canvas.inert = false
		document.body.append(el)
		document.body.classList.add('moba-loading')
		restore = scope.setStylePreset({ line: tune.loading.line, hatch: 1, alpha: true })
		const colors = Object.fromEntries(
			Object.entries(PALETTE).map(([role, value]) => [role, new THREE.Color(value)]),
		)
		const cream = new THREE.Color(PALETTE.cream)
		function draw(progress) {
			const eased = progress * progress * (3 - 2 * progress)
			backdrop.descent(eased)
			const uiProgress = Math.min(1, progress / tune.loading.uiFadeEnd)
			ui.style.opacity = String(1 - uiProgress * uiProgress * (3 - 2 * uiProgress))
			ui.style.visibility = uiProgress === 1 ? 'hidden' : ''
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
		unframe = scope.camera.frame(() => {
			const frame = descentFrame(
				gate.state.progress,
				hero,
				tune.loading,
				kit.follow,
				FLOOR,
				innerWidth / innerHeight,
			)
			const establishing = descentFrame(
				0,
				hero,
				tune.loading,
				kit.follow,
				FLOOR,
				innerWidth / innerHeight,
			)
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
			return frame
		})
		draw(0)
		app.camera.update(0)
		function cancel() {
			if (ending) return
			ending = true
			gate.cancel()
			app.audio.blip({ ...tune.back, type: 'sine' })
			backdrop.resume()
			// Cleanup before the new preview installs its palette and framing.
			dispose()
			returnHero()
		}
		const buttons = [...ui.querySelectorAll('button')]
		function skip() {
			if (gate.state.phase !== 'hold' || gate.state.skipped) return
			gate.skip()
			app.audio.blip(tune.loading.skip)
		}
		let device = ''
		function setDevice(next) {
			if (device === next) return
			device = next
			ui.querySelector('.front-return-key').textContent =
				next === 'gamepad' ? 'B' : next === 'keyboard' ? 'Esc' : ''
			const go = { gamepad: 'A', keyboard: 'Enter' }[next]
			const prompt = document.createElement('span')
			if (go)
				prompt.append(
					Object.assign(document.createElement('kbd'), { textContent: go }),
					'Start now',
				)
			ui.querySelector('.front-prompts').replaceChildren(...(go ? [prompt] : []))
		}
		const controls = createControls({
			count: buttons.length,
			initialBackHeld: !!app.input.pad()?.buttons[1],
			focus(index) {
				if (buttons[index].disabled) return controls.point(0)
				buttons.forEach((button, i) => button.classList.toggle('selected', index === i))
				buttons[index].focus({ preventScroll: true })
			},
			activate(index) {
				if (index === 0) cancel()
				else skip()
			},
			back: cancel,
			device: setDevice,
		})
		setDevice(app.input.activeDevice())
		buttons.forEach((button, index) => {
			button.onpointermove = () => {
				if (button.disabled) return
				setDevice('mouse')
				controls.point(index)
			}
			button.onclick = () => {
				setDevice('mouse')
				controls.point(index)
				if (index === 0) cancel()
				else skip()
			}
		})
		controls.point(1)
		function key(event) {
			if (event.code === 'Backquote' || event.target?.closest?.('.lil-gui')) return
			controls.key(event)
			// Tab only changes focus. Match listeners never see loading gestures.
			event.preventDefault()
			event.stopImmediatePropagation()
		}
		window.addEventListener('keydown', key, { capture: true, signal: scope.signal })
		scope.system('input', () => controls.pad(app.input.consumeMenuInput(), app.input.pad()))
		let status = ''
		scope.system('present', ({ dt }) => {
			if (ending) return
			if (!capturing) {
				const remaining =
					capture && gate.state.phase === 'descent'
						? Math.max(0, (capture.progress - gate.state.progress) * tune.loading.duration)
						: dt
				gate.step(Math.min(dt, remaining))
			}
			if (capture && gate.state.phase !== 'hold' && gate.state.progress >= capture.progress) {
				capturing = true
				capture.resolve(gate.state)
				capture = null
			}
			const state = gate.state
			const text = !state.ready
				? state.skipped
					? 'Starting soon · preparing the view'
					: 'Preparing the view'
				: state.phase === 'hold'
					? 'Ready to descend'
					: 'Dropping in'
			if (status !== text) {
				status = text
				ui.querySelector('.front-load-status').textContent = text
			}
			buttons[1].disabled = state.phase !== 'hold'
			draw(state.progress)
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
		Promise.all([rasterReady, new Promise((resolve) => setTimeout(resolve, buildWait * 1000))])
			.then(([ready]) => {
				if (ready && !scope.signal.aborted) gate.ready()
			})
			.catch(() => {
				if (!scope.signal.aborted) cancel()
			})
		scope.debug.expose({
			loading: {
				get state() {
					return {
						...gate.state,
						tick: match.snapshot().t,
						camera: app.camera.view.position.toArray(),
					}
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
			unframe?.()
			app.setPalette({})
			cameras.forEach((camera, index) => {
				camera.far = previousFar[index]
				camera.updateProjectionMatrix()
			})
			canvas.classList.remove('front-canvas')
			parent.insertBefore(canvas, next)
			document.body.classList.remove('moba-loading')
			el.remove()
		}
	})
	return dispose
}
