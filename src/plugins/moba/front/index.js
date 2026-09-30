import { createBackdrop } from './backdrop.js'
import { createControls } from './controls.js'
import { tune } from './tune.js'
import { createHeroCard, registerKitTune } from './hero.js'
import { createPreview } from './preview.js'
import { startLoading } from './loading.js'
import './front.css'
import './hero.css'

// One backdrop through modes and selection; only the replica preview requests WebGL.
export function mobaFront(app) {
	registerKitTune(app)
	let activeBackdrop = null
	app.debug.tune('front', tune, (folder, values) => {
		const loading = folder.addFolder('loading')
		for (const key of ['hold', 'dwell', 'duration', 'rasterFade'])
			loading
				.add(values.loading, key, app.clock.step, 3, app.clock.step)
				.name(key === 'rasterFade' ? 'raster fade (next loading)' : key)
		for (const key of ['line', 'pastel'])
			loading.add(values.loading, key, key === 'line' ? 0.1 : 0, 1, 0.01)
		loading.add(values.loading, 'scale', 1, 1.1, 0.01)
		loading.add(values.loading, 'height', 20, 40, 1)
		loading.add(values.loading, 'arcHeight', 40, 80, 1)
		loading.add(values.loading, 'riseEnd', 0.1, 0.6, 0.01)
		loading.add(values.loading, 'pitchEnd', 0.65, 0.9, 0.01)
		loading.add(values.loading, 'uiFadeEnd', 0.1, 0.3, 0.01)
		loading.add(values.loading, 'fitMargin', 1.1, 1.5, 0.01)
		loading.add(values.loading, 'back', 0, 140, 1)
		loading.add(values.loading, 'targetY', 0, 19, 1)
		loading.add(values.loading, 'fov', 30, 90, 1)
		folder
			.add(values, 'skyFade', app.clock.step, 2, app.clock.step)
			.name('sky fade (s)')
			.onChange(() => activeBackdrop?.retune())
		for (const [key, min, max, step] of [
			['depth', 0, 0.045, 0.001],
			['response', app.clock.step, 1, app.clock.step],
			['settle', 0.001, 1, 0.001],
		])
			folder
				.add(values.parallax, key, min, max, step)
				.name('parallax ' + key)
				.onChange(() => activeBackdrop?.retune())
		values.confirm.frequencies.forEach((_, index) =>
			folder
				.add(values.confirm.frequencies, String(index), 20, 2400, 1)
				.name('confirm tone ' + (index + 1)),
		)
		for (const name of ['confirm', 'back']) {
			const sound = values[name]
			if (name === 'back') {
				folder.add(sound, 'freq', 20, 2400, 1).name('back tone')
				folder.add(sound, 'slideTo', 20, 2400, 1).name('back slide')
			}
			folder.add(sound, 'dur', app.clock.step, 2, app.clock.step).name(name + ' duration (s)')
			folder.add(sound, 'gain', 0, 1, 0.01).name(name + ' gain')
		}
	})
	app.modes.define('moba-front', {
		scheme: 'pointClick',
		start(run, { options = {} } = {}) {
			let transferred = false
			let preview = null
			let card = null
			let screen = 'modes'
			run.renderDemand(() => screen === 'hero')
			run.system('present', ({ dt }) => {
				preview?.update(dt)
				card?.refresh()
			})
			run.clock.pause(() => true)
			run.intents.suspend(() => true)
			app.intents.cancel()
			app.audio.setMusicScene('wind')
			const el = options.el ?? document.createElement('main')
			el.className = 'moba-front'
			el.setAttribute('aria-label', 'Choose a mode')
			el.innerHTML = `<button type="button" class="front-practice" aria-label="Practice">
				<svg viewBox="0 0 190 130" aria-hidden="true">
					<path d="M92 44 L100 44 L98 130 L90 130Z" fill="var(--ui-cream)"/>
					<path d="M16 14 L174 5 L172 69 L20 76Z" fill="var(--ui-cream)"/>
					<path d="M24 66 L168 60 M93 78 L93 124" fill="none"/>
					<circle cx="29" cy="23" r="1.5"/><circle cx="161" cy="15" r="1.5"/>
				</svg><span class="front-mode-name">Practice</span></button>
				<footer><button type="button" class="front-back">Back to the hub</button>
				<p class="front-prompts" aria-live="polite"></p></footer>`
			const backdrop = options.backdrop ?? createBackdrop(el)
			activeBackdrop = backdrop
			el.prepend(backdrop.el)
			let buttons = [...el.querySelectorAll('button')]
			const practice = el.querySelector('.front-practice')
			const backButton = el.querySelector('.front-back')
			const canvas = app.renderer.domElement
			const canvasParent = canvas.parentNode
			const canvasNext = canvas.nextSibling
			const outside = [...document.body.children].filter(
				(child) => child.tagName !== 'SCRIPT' && !child.matches('.lil-gui'),
			)
			const previous = outside.map((child) => child.inert)
			for (const child of outside) child.inert = true
			document.body.append(el)
			let controls
			let pointerMoved = false
			window.addEventListener(
				'pointermove',
				() => {
					pointerMoved = true
				},
				{ signal: run.signal },
			)
			function showHero() {
				if (screen === 'hero') return
				screen = 'hero'
				pointerMoved = false
				setDevice(device, true)
				practice.hidden = true
				backButton.textContent = 'Back'
				el.setAttribute('aria-label', 'Choose your hero')
				el.classList.add('selecting-hero')
				card = createHeroCard()
				el.append(card.el)
				canvas.inert = false
				canvas.classList.add('front-canvas')
				el.append(canvas)
				preview = createPreview(app, run)
				buttons = [...card.el.querySelectorAll('button'), backButton]
				bindControls()
			}
			function showModes() {
				if (screen !== 'hero') return leave('dodgeball')
				app.audio.blip({ ...tune.back, type: 'sine' })
				preview.dispose()
				preview = null
				card.el.remove()
				card = null
				screen = 'modes'
				setDevice(device, true)
				canvas.classList.remove('front-canvas')
				canvasParent.insertBefore(canvas, canvasNext)
				canvas.inert = true
				practice.hidden = false
				backButton.textContent = 'Back to the hub'
				el.classList.remove('selecting-hero')
				el.setAttribute('aria-label', 'Choose a mode')
				buttons = [practice, backButton]
				bindControls()
			}
			function activate(index) {
				const button = buttons[index]
				if (button === backButton) return showModes()
				if (screen === 'hero' && button.dataset.slot) return preview.start(button.dataset.slot)
				if (button.classList.contains('front-numbers')) {
					preview.stop()
					card.toggle()
					return
				}
				for (const freq of tune.confirm.frequencies)
					app.audio.blip({ freq, dur: tune.confirm.dur, gain: tune.confirm.gain, type: 'sine' })
				if (screen === 'modes') showHero()
				else {
					transferred = true
					startLoading(app, {
						el,
						backdrop,
						buildWait: options.buildWait ?? buildWait,
						returnHero: () =>
							app.modes.start('moba-front', { options: { hero: true, el, backdrop } }),
					})
				}
			}
			let leaving = false
			function leave(mode) {
				if (leaving) return
				leaving = true
				if (mode !== 'moba') {
					app.audio.blip({ ...tune.back, type: 'sine' })
					const url = new URL(location.href)
					url.searchParams.delete('mode')
					history.replaceState(null, '', url)
				}
				app.intents.cancel()
				app.modes.start(mode)
			}
			let buildWait = 0
			let device = ''
			function setDevice(next, force = false) {
				if (device === next && !force) return
				device = next
				el.dataset.device = next
				const prompts =
					next === 'gamepad'
						? [
								'D-pad / stick · choose',
								screen === 'hero' ? 'A · preview / lock' : 'A · go',
								'B · back',
							]
						: next === 'mouse'
							? ['Point · choose', screen === 'hero' ? 'Click · preview / lock' : 'Click · go']
							: [
									'Tab / arrows · choose',
									screen === 'hero' ? 'Enter · preview / lock' : 'Enter · go',
									'Esc · back',
								]
				el.querySelector('.front-prompts').replaceChildren(
					...prompts.map((text) => {
						const span = document.createElement('span')
						span.textContent = text
						return span
					}),
				)
			}
			setDevice('keyboard')
			function bindControls() {
				let focused = -1
				controls = createControls({
					count: buttons.length,
					initialBackHeld: !!app.input.pad()?.buttons[1],
					focus(index) {
						buttons.forEach((button, i) => button.classList.toggle('selected', i === index))
						const key = buttons[index].dataset.slot
						if (focused !== index) {
							focused = index
							if (preview) {
								if (key) preview.start(key)
								else preview.stop()
							}
						}
						if (document.activeElement !== buttons[index])
							buttons[index].focus({ preventScroll: true })
						buttons[index].scrollIntoView({ block: 'nearest', inline: 'nearest' })
					},
					activate,
					back: showModes,
					device: setDevice,
				})
				buttons.forEach((button, index) => {
					button.onpointerenter = () => {
						if (!pointerMoved) return
						setDevice('mouse')
						controls.point(index)
					}
					button.onpointermove = () => {
						setDevice('mouse')
						controls.point(index)
					}
					button.onfocus = () => controls.point(index)
					button.onclick = () => {
						setDevice('mouse')
						controls.point(index)
						activate(index)
					}
				})
				controls.point(0)
			}
			bindControls()
			if (options.hero) showHero()
			window.addEventListener('keydown', (event) => controls.key(event), { signal: run.signal })
			run.system('input', () => {
				controls.pad(app.input.consumeMenuInput(), app.input.pad())
			})
			run.debug.expose({
				front: {
					crossfade: backdrop.crossfade,
					waitForBuild(seconds) {
						if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Invalid build wait')
						buildWait = seconds
					},
					freezePreview: (value) => preview?.freeze(value),
					get preview() {
						return preview?.state ?? null
					},
					get screen() {
						return screen
					},
				},
			})
			run.signal.addEventListener(
				'abort',
				() => {
					if (activeBackdrop === backdrop) activeBackdrop = null
					preview?.dispose()
					canvas.classList.remove('front-canvas')
					canvasParent.insertBefore(canvas, canvasNext)
					if (!transferred) backdrop.dispose()
					el.remove()
					outside.forEach((child, i) => {
						child.inert = previous[i]
					})
				},
				{ once: true },
			)
			return {
				epoch: 0,
				snapshot: () => ({ screen }),
				apply: () => false,
				validFact: () => false,
			}
		},
	})
}
