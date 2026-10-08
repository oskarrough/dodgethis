import { createBackdrop } from './backdrop.js'
import { createControls } from './controls.js'
import { tune } from './tune.js'
import { parseMatchSetup } from '../setup.js'
import { tune as mapTune } from '../tune.js'
import './front.css'

const modes = [
	{
		mode: 'dodgeball',
		name: 'Dodgeball',
		glyph:
			'<circle cx="32" cy="32" r="22" class="front-glyph-fill"/><path d="M12 25 Q34 27 41 53 M25 10 Q24 33 11 41 M41 11 Q38 34 53 41"/>',
	},
	...['overthrow', 'flagfall'].map((id) => {
		const flagfall = id === 'flagfall'
		const data = flagfall ? mapTune.flagfall.bounds : mapTune.map
		const { halfX, halfZ } = data
		const padding = tune.tile.outlinePadding
		const rect = (x, z) => `<rect x="${-x}" y="${-z}" width="${x * 2}" height="${z * 2}"/>`
		const plan = flagfall
			? `${rect(mapTune.flagfall.yard.halfX, mapTune.flagfall.yard.halfZ)}${[-1, 1].map((side) => `<path d="M${-halfX},${side * mapTune.flagfall.lane.innerZ} H${halfX}"/>`).join('')}`
			: `<path d="M${-halfX},0 H${halfX}"/>${[-1, 1].map((side) => `<path d="M${side * mapTune.map.baseWallX},${-halfZ} V${-mapTune.map.throat / 2} M${side * mapTune.map.baseWallX},${mapTune.map.throat / 2} V${halfZ}"/>`).join('')}`
		const name = flagfall ? mapTune.flagfall.name : mapTune.map.name
		return {
			mode: 'moba',
			map: id,
			name,
			viewBox: `${-halfX - padding} ${-halfZ - padding} ${(halfX + padding) * 2} ${(halfZ + padding) * 2}`,
			glyph: `<g fill="none" stroke-width="${tune.tile.outlineWidth}">${rect(halfX, halfZ)}${plan}</g>`,
		}
	}),
]

// The splash is the only menu before the playable lobby.
export function mobaFront(app, map) {
	let activeBackdrop = null
	let activeFront = null
	app.debug.tune('front', tune, (folder, values) => {
		const loading = folder.addFolder('loading')
		for (const key of ['duration'])
			loading.add(values.loading, key, app.clock.step, 3, app.clock.step)
		for (const key of ['line', 'pastel'])
			loading.add(values.loading, key, key === 'line' ? 0.1 : 0, 1, 0.01)
		const shots = folder.addFolder('backdrop shots (next move)')
		shots.add(values.shot, 'ease', 1, 5, 0.1).name('ease power')
		for (const name of ['splash', 'lobby', 'apex']) {
			shots.add(values.shot[name], 'lift', -800, 800, 10).name(name + ' lift')
			shots.add(values.shot[name], 'zoom', 1, 1.5, 0.01).name(name + ' zoom')
			shots
				.add(values.shot[name], 'time', app.clock.step, 2, app.clock.step)
				.name(name + ' time (s)')
		}
		values.shot.depth.forEach((_, i) =>
			shots.add(values.shot.depth, i, 0, 2, 0.05).name(`layer ${i + 1} depth`),
		)
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
		for (const name of ['back', 'move', 'enter', 'deny']) {
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
		tile.add(values.tile, 'drop', app.clock.step, 1, app.clock.step).name('drop out (s)')
		tile.add(values.tile, 'pop', app.clock.step, 1, app.clock.step).name('pop in (s)')
		tile.add(values.deny, 'shake', app.clock.step, 1, app.clock.step).name('deny shake (s)')
	})

	app.modes.define('moba-front', {
		scheme: 'pointClick',
		start(run, { options = {} } = {}) {
			// Existing composition/menu entry requests now name a destination, not a selection screen.
			if (options.hero && !options.notice) {
				queueMicrotask(() => {
					if (!run.signal.aborted) app.modes.start('moba-lobby', { options })
				})
				return {
					epoch: 0,
					snapshot: () => ({ screen: 'lobby' }),
					apply: () => false,
					validFact: () => false,
				}
			}
			const setup = parseMatchSetup(new URLSearchParams(location.search), options.setup ?? options)
			const heldKeys = new Set(options.heldKeys ?? [])
			window.addEventListener('keydown', (e) => heldKeys.add(e.code), {
				capture: true,
				signal: run.signal,
			})
			window.addEventListener('keyup', (e) => heldKeys.delete(e.code), { signal: run.signal })
			run.renderDemand(() => false)
			run.clock.pause(() => true)
			run.intents.suspend(() => true)
			app.intents.cancel()
			app.audio.setMusicScene('wind')
			map.dispose()
			const url = new URL(location.href)
			url.searchParams.delete('play')
			url.searchParams.delete('mode')
			if (url.href !== location.href) history.replaceState(null, '', url)
			const el = document.createElement('main')
			el.className = 'moba-front'
			el.dataset.screen = 'modes'
			el.setAttribute('aria-label', 'Choose a game or map')
			// Everything but the backdrop moves as one sticker sheet: it drops out under the lobby
			// shot and pops back in on return.
			// The title's o is the Ball; now and then one letter sidesteps a throw you never saw.
			const title = [...'DodgeThis']
				.map((c, i) => `<span class="front-letter${i === 1 ? ' front-ball' : ''}">${c}</span>`)
				.join('')
			el.innerHTML = `<div class="front-chrome"><h1 class="front-heading" aria-label="DodgeThis"><span aria-hidden="true">${title}</span></h1><p class="front-notice" role="status" hidden></p>
				<div class="front-tiles front-modes" role="group" aria-label="Game or map">${modes.map((tile) => `<button type="button" class="front-tile" data-mode="${tile.mode}" ${tile.map ? `data-map="${tile.map}"` : ''}><span class="front-tile-face"></span><svg viewBox="${tile.viewBox ?? '0 0 64 64'}" aria-hidden="true">${tile.glyph}</svg>${tile.map ? '<small class="front-tile-kicker">MOBA</small>' : ''}<span class="front-tile-name">${tile.name}</span></button>`).join('')}</div>
				<footer><p class="front-prompts" aria-live="polite"></p></footer></div>`
			const chrome = el.querySelector('.front-chrome')
			const notice = el.querySelector('.front-notice')
			notice.textContent = options.notice ?? ''
			notice.hidden = !options.notice
			// The lobby hands its backdrop back on Esc; only a cold entry builds one.
			const backdrop = options.backdrop ?? createBackdrop()
			activeBackdrop = backdrop
			el.prepend(backdrop.el)
			const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
			if (!reduced) {
				const letters = [...el.querySelectorAll('.front-letter')]
				const ball = el.querySelector('.front-ball')
				let blip = 0
				const play = (target, name) => {
					target.classList.remove(name)
					void target.offsetWidth
					target.classList.add(name)
				}
				const next = () => {
					blip = setTimeout(
						() => {
							if (Math.random() < 0.3) play(ball, 'front-glint')
							else {
								const letter = letters[Math.floor(Math.random() * letters.length)]
								letter.style.setProperty('--dodge', Math.random() < 0.5 ? -1 : 1)
								play(letter, 'front-dodge')
							}
							next()
						},
						tune.title.calm[0] + Math.random() * (tune.title.calm[1] - tune.title.calm[0]),
					)
				}
				next()
				run.signal.addEventListener('abort', () => clearTimeout(blip))
			}
			let pop = null
			if (options.backdrop) {
				backdrop.shot('splash')
				// The tiles land as the camera settles.
				const time = reduced ? 0 : tune.tile.pop
				pop = chrome.animate(
					[{ translate: '0 100vh' }, { translate: '0 -3vh', offset: 0.7 }, { translate: '0 0' }],
					{
						duration: time * 1000,
						delay: reduced ? 0 : Math.max(0, tune.shot.splash.time - time) * 1000,
						easing: 'cubic-bezier(0.2, 0.8, 0.4, 1)',
						fill: 'backwards',
					},
				)
			}
			const outside = [...document.body.children].filter(
				(child) => child.tagName !== 'SCRIPT' && !child.matches('.lil-gui'),
			)
			const inert = outside.map((child) => child.inert)
			outside.forEach((child) => (child.inert = true))
			document.body.append(el)
			// The lobby takes `el` and the backdrop in it; the tiles fall away above it on their own sheet.
			const sheet = document.createElement('div')
			sheet.className = 'moba-front front-leaving'
			sheet.inert = true
			sheet.setAttribute('aria-hidden', 'true')
			const front = {
				retune() {
					for (const [key, unit] of [
						['snap', 's'],
						['press', 's'],
						['scale', ''],
						['lift', 'px'],
						['tilt', 'deg'],
					])
						for (const target of [el, sheet])
							target.style.setProperty('--tile-' + key, tune.tile[key] + unit)
				},
			}
			activeFront = front
			front.retune()
			const buttons = [...el.querySelectorAll('.front-tile')]
			let transferred = false
			let leaving = false
			function activate(index) {
				if (leaving) return
				leaving = true
				const mode = buttons[index].dataset.mode
				const url = new URL(location.href)
				url.searchParams.set('mode', mode)
				if (mode === 'moba') {
					setup.map = buttons[index].dataset.map
					url.searchParams.set('map', setup.map)
				}
				history.replaceState(null, '', url)
				if (mode === 'moba') {
					tune.enter.frequencies.forEach((freq, i) =>
						app.audio.blip({ ...tune.enter, freq, delay: i * tune.enter.gap }),
					)
					transferred = true
					dropTiles()
					app.modes.start('moba-lobby', {
						options: { el, backdrop, setup, heldKeys: [...heldKeys], device },
					})
					document.body.append(sheet)
				} else {
					app.audio.sfx.switch()
					app.modes.start(mode)
				}
			}
			function dropTiles() {
				if (pop?.playState === 'running') pop.commitStyles()
				pop?.cancel()
				sheet.append(chrome)
				chrome
					.animate([{ translate: '0 100vh', rotate: '4deg' }], {
						duration: (reduced ? 0 : tune.tile.drop) * 1000,
						easing: 'cubic-bezier(0.5, 0, 0.9, 0.4)',
						fill: 'forwards',
					})
					.finished.then(
						() => sheet.remove(),
						() => sheet.remove(),
					)
			}
			function deny() {
				app.audio.blip(tune.deny)
				el.querySelector('.front-modes').animate(
					[0, -1, 1, -0.5, 0].map((x) => ({ translate: `${x * 1.5}vmin 0` })),
					tune.deny.shake * 1000,
				)
			}
			let device = ''
			function setDevice(next) {
				if (device === next) return
				device = next
				el.dataset.device = next
				el.querySelector('.front-prompts').innerHTML =
					next === 'gamepad'
						? '<span><kbd class="front-arrows">✛</kbd>Choose</span><span><kbd>A</kbd>Go</span>'
						: next === 'keyboard'
							? '<span><kbd class="front-arrows">←→</kbd>Choose</span><span><kbd>Enter</kbd>Go</span>'
							: ''
			}
			setDevice(matchMedia('(any-hover: none)').matches ? 'mouse' : 'keyboard')
			let focused = -1
			const controls = createControls({
				count: buttons.length,
				initialBackHeld: !!app.input.pad()?.buttons[1],
				focus(index) {
					buttons.forEach((button, i) => {
						button.classList.toggle('selected', i === index)
						button.setAttribute('aria-current', String(i === index))
					})
					if (focused !== index && focused >= 0) app.audio.blip(tune.move)
					focused = index
					if (document.activeElement !== buttons[index])
						buttons[index].focus({ preventScroll: true })
				},
				activate,
				back: deny,
				device: setDevice,
			})
			let pointerMoved = false
			window.addEventListener('pointermove', () => (pointerMoved = true), { signal: run.signal })
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
				button.onclick = (event) => {
					setDevice(event.pointerType === 'touch' ? 'touch' : 'mouse')
					controls.point(index)
					activate(index)
				}
			})
			// Back from the lobby, the chosen map is still the one in hand.
			controls.point(options.backdrop ? buttons.findIndex((b) => b.dataset.map === setup.map) : 0)
			window.addEventListener(
				'keydown',
				(event) => {
					if (!options.heldKeys?.includes(event.code)) controls.key(event)
				},
				{ signal: run.signal },
			)
			window.addEventListener(
				'keyup',
				(event) => {
					options.heldKeys = options.heldKeys?.filter((code) => code !== event.code)
				},
				{ signal: run.signal },
			)
			run.system('input', () => controls.pad(app.input.consumeMenuInput(), app.input.pad()))
			run.debug.expose({
				screen: 'splash',
				front: {
					crossfade: backdrop.crossfade,
					get screen() {
						return 'modes'
					},
				},
			})
			run.signal.addEventListener(
				'abort',
				() => {
					if (activeBackdrop === backdrop) activeBackdrop = null
					if (activeFront === front) activeFront = null
					// Handed over, `el` and its backdrop belong to the lobby and stay in the document.
					if (!transferred) {
						backdrop.dispose()
						el.remove()
					}
					outside.forEach((child, i) => (child.inert = inert[i]))
				},
				{ once: true },
			)
			return {
				epoch: 0,
				snapshot: () => ({ screen: 'modes' }),
				apply: () => false,
				validFact: () => false,
			}
		},
	})
}
