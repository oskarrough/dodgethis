import { createBackdrop } from './backdrop.js'
import { createControls } from './controls.js'
import { tune } from './tune.js'
import { createHeroCard, registerKitTune } from './hero.js'
import { createPreview } from './preview.js'
import { startLoading } from './loading.js'
import { parseMatchSetup } from '../setup.js'
import './front.css'
import './hero.css'

// Cut-out stickers pinned on the desert. The glyphs are drawn in the backdrop's ink.
const modes = [
	{
		mode: 'dodgeball',
		name: 'Dodgeball',
		line: 'Court battles',
		glyph: `<circle cx="32" cy="32" r="22" class="front-glyph-fill"/><path d="M12 25 Q34 27 41 53 M25 10 Q24 33 11 41 M41 11 Q38 34 53 41"/>`,
	},
	{
		mode: 'moba',
		name: 'MOBA',
		line: 'Lane practice',
		glyph: `<g transform="rotate(-30 32 32)"><path d="M22 6 Q54 32 22 58 Q44 32 22 6Z" class="front-glyph-fill"/><path d="M22 6 L22 58 M6 32 L50 32"/><path d="M48 25 L59 32 L48 39Z" class="front-glyph-fill"/><path d="M6 32 L2 26 M6 32 L2 38 M12 32 L8 26 M12 32 L8 38"/></g>`,
	},
]
const levels = ['easy', 'normal', 'hard'].map((id, i) => ({
	difficulty: id,
	id,
	name: id[0].toUpperCase() + id.slice(1),
	line: ['Bots go easy', 'A fair fight', 'Bots play to win'][i],
	glyph: [0, 1, 2]
		.map(
			(pip) =>
				`<path d="M${8 + pip * 18} 40 L${17 + pip * 18} 24 L${26 + pip * 18} 40Z" class="${pip <= i ? 'front-pip-on' : ''}"/>`,
		)
		.join(''),
}))
function tileMarkup(tile) {
	const data = tile.mode ? `data-mode="${tile.mode}"` : `data-difficulty="${tile.difficulty}"`
	return `<button type="button" class="front-tile" ${data}><span class="front-tile-face"></span><svg viewBox="0 0 64 64" aria-hidden="true">${tile.glyph}</svg><span class="front-tile-name">${tile.name}</span><span class="front-tile-line">${tile.line}</span></button>`
}

// One backdrop through modes and selection; only the replica preview requests WebGL.
export function mobaFront(app, map) {
	registerKitTune(app)
	let activeBackdrop = null
	let activeFront = null
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
		for (const name of ['confirm', 'back', 'move', 'enter', 'pick', 'deny']) {
			const sound = values[name]
			if (sound.freq !== undefined) {
				folder.add(sound, 'freq', 20, 2400, 1).name(name + ' tone')
				folder.add(sound, 'slideTo', 20, 2400, 1).name(name + ' slide')
			}
			folder.add(sound, 'dur', app.clock.step, 2, app.clock.step).name(name + ' duration (s)')
			folder.add(sound, 'gain', 0, 1, 0.01).name(name + ' gain')
		}
		const tile = folder.addFolder('menu tiles')
		for (const [key, min, max, step] of [
			['snap', app.clock.step, 0.5, 0.01],
			['press', app.clock.step, 0.3, 0.01],
			['scale', 1, 1.2, 0.01],
			['lift', 0, 24, 1],
			['tilt', 0, 8, 0.5],
		])
			tile.add(values.tile, key, min, max, step).onChange(() => activeFront?.retune())
		tile.add(values.deny, 'shake', app.clock.step, 1, app.clock.step).name('deny shake (s)')
	})
	app.modes.define('moba-front', {
		scheme: 'pointClick',
		start(run, { options = {} } = {}) {
			let transferred = false
			let preview = null
			let card = null
			let screen = 'modes'
			const setup = parseMatchSetup(new URLSearchParams(location.search), options.setup ?? options)
			const local = app.session.local[0]
			setup.heroId = setup.picks?.[local]?.heroId ?? setup.heroId
			let difficulty = setup.difficulty
			const picked = new Set(
				['hero', 'bots'].filter((key) => new URLSearchParams(location.search).has(key)),
			)
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
			el.innerHTML = `<h1 class="front-heading"></h1>
				<div class="front-tiles front-modes" role="group" aria-label="Game mode">${modes.map(tileMarkup).join('')}</div>
				<div class="front-tiles front-difficulty" role="group" aria-label="Opponent difficulty">${levels.map(tileMarkup).join('')}</div>
				<footer><button type="button" class="front-back front-return" aria-label="Back">
					<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M27 10 L10 24 L27 38 L27 30 L38 30 L38 18 L27 18Z"/></svg><kbd class="front-return-key"></kbd></button>
				<p class="front-prompts" aria-live="polite"></p></footer>`
			const backdrop = options.backdrop ?? createBackdrop()
			activeBackdrop = backdrop
			el.prepend(backdrop.el)
			const heading = el.querySelector('.front-heading')
			const modeChoices = el.querySelector('.front-modes')
			const difficultyChoices = el.querySelector('.front-difficulty')
			const backButton = el.querySelector('.front-return')
			const canvas = app.renderer.domElement
			const canvasParent = canvas.parentNode
			const canvasNext = canvas.nextSibling
			const outside = [...document.body.children].filter(
				(child) => child.tagName !== 'SCRIPT' && !child.matches('.lil-gui'),
			)
			const previous = outside.map((child) => child.inert)
			for (const child of outside) child.inert = true
			document.body.append(el)
			const front = {
				retune() {
					for (const [key, unit] of [
						['snap', 's'],
						['press', 's'],
						['scale', ''],
						['lift', 'px'],
						['tilt', 'deg'],
					])
						el.style.setProperty('--tile-' + key, tune.tile[key] + unit)
				},
			}
			activeFront = front
			front.retune()
			let buttons = []
			let controls
			let pointerMoved = false
			window.addEventListener(
				'pointermove',
				() => {
					pointerMoved = true
				},
				{ signal: run.signal },
			)
			// Splash, difficulty and hero are one screen each; Back walks that list in reverse.
			function show(next, focus) {
				if (screen === 'hero' && next !== 'hero') {
					preview.dispose()
					preview = null
					card.el.remove()
					card = null
					canvas.classList.remove('front-canvas')
					canvasParent.insertBefore(canvas, canvasNext)
					canvas.inert = true
					el.classList.remove('selecting-hero')
				}
				screen = next
				if (next === 'modes') map.dispose()
				pointerMoved = false
				el.dataset.screen = next
				// Menus preserve the selection, never the direct-play bypass.
				const url = new URL(location.href)
				url.searchParams.delete('play')
				if (picked.has('hero')) url.searchParams.set('hero', setup.heroId)
				if (picked.has('bots')) url.searchParams.set('bots', difficulty)
				if (next === 'modes') url.searchParams.delete('mode')
				else url.searchParams.set('mode', 'moba')
				if (url.href !== location.href) history.replaceState(null, '', url)
				for (const choice of difficultyChoices.querySelectorAll('button'))
					choice.setAttribute('aria-pressed', String(choice.dataset.difficulty === difficulty))
				modeChoices.hidden = next !== 'modes'
				difficultyChoices.hidden = next !== 'difficulty'
				heading.hidden = next === 'hero'
				heading.textContent = next === 'modes' ? 'Dodge this' : 'Practice'
				backButton.hidden = next === 'modes'
				el.setAttribute(
					'aria-label',
					next === 'modes'
						? 'Choose a mode'
						: next === 'difficulty'
							? 'Choose opponents'
							: 'Choose your hero',
				)
				if (next === 'hero') {
					el.classList.add('selecting-hero')
					card = createHeroCard(
						(slot) => (slot ? preview?.start(slot) : preview?.stop()),
						setup.heroId,
					)
					el.append(card.el)
					canvas.inert = false
					canvas.classList.add('front-canvas')
					el.append(canvas)
					preview = createPreview(app, run, card.heroId)
					buttons = [...card.el.querySelectorAll('button'), backButton]
				} else
					buttons = [
						...(next === 'modes' ? modeChoices : difficultyChoices).querySelectorAll('button'),
						backButton,
					].filter((button) => !button.hidden)
				setDevice(device, true)
				bindControls(
					focus ??
						(next === 'hero'
							? buttons.findIndex((button) => button.dataset.hero === card.heroId)
							: 0),
				)
			}
			function back() {
				if (screen === 'hero') show('difficulty', difficultyIndex())
				else if (screen === 'difficulty') show('modes', 1)
				else return deny()
				app.audio.blip({ ...tune.back, type: 'sine' })
			}
			function deny() {
				app.audio.blip(tune.deny)
				modeChoices.animate(
					[0, -1, 1, -0.5, 0].map((x) => ({ translate: `${x * 1.5}vmin 0` })),
					tune.deny.shake * 1000,
				)
			}
			const difficultyIndex = () => levels.findIndex((level) => level.id === difficulty)
			function activate(index) {
				const button = buttons[index]
				if (button === backButton) return back()
				if (button.dataset.mode === 'dodgeball') return leave('dodgeball')
				if (button.dataset.mode === 'moba') {
					tune.enter.frequencies.forEach((freq, i) =>
						app.audio.blip({ ...tune.enter, freq, delay: i * tune.enter.gap }),
					)
					return show('difficulty', difficultyIndex())
				}
				if (button.dataset.difficulty) {
					difficulty = button.dataset.difficulty
					picked.add('bots')
					const freq = tune.pick.frequencies[difficultyIndex()]
					app.audio.blip({
						freq,
						slideTo: freq * tune.pick.slide,
						dur: tune.pick.dur,
						gain: tune.pick.gain,
						type: 'triangle',
					})
					return show('hero')
				}
				if (button.dataset.hero) {
					picked.add('hero')
					const url = new URL(location.href)
					url.searchParams.set('hero', button.dataset.hero)
					history.replaceState(null, '', url)
					if (button.dataset.hero === card.heroId)
						return controls.point(
							buttons.findIndex((button) => button.classList.contains('front-lock')),
						)
					preview.dispose()
					card.choose(button.dataset.hero)
					preview = createPreview(app, run, card.heroId)
					setup.heroId = card.heroId
					return
				}
				if (button.dataset.slot) return card.select(button.dataset.slot)
				if (button.classList.contains('front-numbers')) {
					preview.stop()
					card.toggle()
					return
				}
				for (const freq of tune.confirm.frequencies)
					app.audio.blip({ freq, dur: tune.confirm.dur, gain: tune.confirm.gain, type: 'sine' })
				picked.add('hero')
				const url = new URL(location.href)
				url.searchParams.set('hero', setup.heroId)
				history.replaceState(null, '', url)
				setup.picks = {
					...setup.picks,
					[local]: { ...setup.picks?.[local], heroId: setup.heroId },
				}
				transferred = true
				startLoading(app, {
					el,
					backdrop,
					buildWait: options.buildWait ?? buildWait,
					difficulty,
					setup: { ...setup, difficulty },
					returnHero: () =>
						app.modes.start('moba-front', {
							options: { hero: true, el, backdrop, setup: { ...setup, difficulty } },
						}),
				})
			}
			let leaving = false
			function leave(mode) {
				if (leaving) return
				leaving = true
				app.audio.sfx.switch()
				const url = new URL(location.href)
				url.searchParams.set('mode', mode)
				history.replaceState(null, '', url)
				app.intents.cancel()
				app.modes.start(mode)
			}
			let buildWait = 0
			let device = ''
			function setDevice(next, force = false) {
				if (device === next && !force) return
				device = next
				el.dataset.device = next
				backButton.querySelector('kbd').textContent =
					next === 'gamepad' ? 'B' : next === 'keyboard' ? 'Esc' : ''
				const go = screen === 'hero' ? 'Preview / lock' : 'Go'
				const prompts =
					next === 'gamepad'
						? [
								['✛', 'Choose'],
								['A', go],
							]
						: next === 'keyboard'
							? [
									['←→', 'Choose'],
									['Enter', go],
								]
							: []
				el.querySelector('.front-prompts').replaceChildren(
					...prompts.map(([key, text]) => {
						const span = document.createElement('span')
						const kbd = document.createElement('kbd')
						kbd.textContent = key
						kbd.classList.toggle('front-arrows', !/\w/.test(key))
						span.append(kbd, text)
						return span
					}),
				)
			}
			// Touch screens start with no prompts; the first key or pad press brings them back.
			setDevice(matchMedia('(any-hover: none)').matches ? 'mouse' : 'keyboard')
			function bindControls(initial = 0) {
				let focused = -1
				controls = createControls({
					count: buttons.length,
					initialBackHeld: !!app.input.pad()?.buttons[1],
					focus(index) {
						buttons.forEach((button, i) => button.classList.toggle('selected', i === index))
						const key = buttons[index].dataset.slot
						if (focused !== index) {
							if (focused >= 0) app.audio.blip(tune.move)
							focused = index
							if (preview) card.preview(key)
						}
						if (document.activeElement !== buttons[index])
							buttons[index].focus({ preventScroll: true })
						buttons[index].scrollIntoView({ block: 'nearest', inline: 'nearest' })
					},
					activate,
					back,
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
				controls.point(Math.max(0, Math.min(buttons.length - 1, initial)))
			}
			show(
				options.hero ? 'hero' : options.screen === 'difficulty' ? 'difficulty' : 'modes',
				options.screen === 'difficulty' ? difficultyIndex() : undefined,
			)
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
					get difficulty() {
						return difficulty
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
					if (activeFront === front) activeFront = null
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
