import { createBackdrop } from './backdrop.js'
import { createControls } from './controls.js'
import { tune } from './tune.js'
import { applySkin, paintedCard, paintedEdge, paintedWash } from './skin.js'
import { parseMatchSetup } from '../setup.js'
import { playableMaps, mapLayout } from '../maps/index.js'
import './front.css'

// The MOBA maps are the front door; Dodgeball is a bonus sticker under them, last in the cursor order.
const bonus = {
	mode: 'dodgeball',
	name: 'Dodgeball',
	glyph:
		'<circle cx="32" cy="32" r="22" class="front-glyph-fill"/><path d="M12 25 Q34 27 41 53 M25 10 Q24 33 11 41 M41 11 Q38 34 53 41"/>',
}
const maps = playableMaps.map((id) => {
	const layout = mapLayout(id)
	const { halfX, halfZ } = layout.bounds
	const padding = tune.tile.outlinePadding
	const rect = (x, z) => `<rect x="${-x}" y="${-z}" width="${x * 2}" height="${z * 2}"/>`
	const plan = layout.preview ?? ''
	const name = layout.name
	const art = tune.tile.art[id]
	// A map with an illustration shows it; a new map shows its chalk plan until it gets one.
	const picture = art
		? `<img alt="" decoding="async" srcset="${tune.tile.artWidths.map((w) => `${art}-${w}.webp ${w}w`).join(', ')}" sizes="(max-width: 700px) 45vw, 27vw" src="${art}-${tune.tile.artWidths[0]}.webp">`
		: `<svg viewBox="${`${-halfX - padding} ${-halfZ - padding} ${(halfX + padding) * 2} ${(halfZ + padding) * 2}`}" aria-hidden="true"><g fill="none" stroke-width="${tune.tile.outlineWidth}">${rect(halfX, halfZ)}${plan}</g></svg>`
	return { mode: 'moba', map: id, name, picture }
})

// The splash is the only menu before the playable lobby.
export function mobaFront(app, map) {
	let activeBackdrop = null
	let activeFront = null
	app.debug.tune('front', tune, (folder, values) => {
		const loading = folder.addFolder('loading')
		for (const key of ['duration'])
			loading.add(values.loading, key, app.clock.step, 3, app.clock.step)
		loading.add(values.loading, 'preview', app.clock.step, 8, app.clock.step).name('look time')
		loading.add(values.loading, 'creep', 0, 0.3, 0.01).name('creep while looking')
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
			['wash', 0, 0.6, 0.01],
		])
			tile.add(values.tile, key, min, max, step).onChange(() => activeFront?.retune())
		for (const key of ['line', 'shadow', 'ring'])
			tile
				.add(values.skin, key, 0, 16, 0.5)
				.name('skin ' + key)
				.onChange(() => activeFront?.retune())
		values.skin.cut.forEach((_, i) =>
			tile
				.add(values.skin.cut, i, 0, 40, 1)
				.name(`skin cut ${['tl', 'tr', 'br', 'bl'][i]}`)
				.onChange(() => activeFront?.retune()),
		)
		const plate = folder.addFolder('plate')
		plate.add(values.mist, 'opacity', 0, 1, 0.01).name('mist opacity')
		plate.add(values.mist.period, 0, 20, 400, 1).name('far mist loop (s)')
		plate.add(values.mist.period, 1, 20, 400, 1).name('near mist loop (s)')
		plate.add(values.dusk, 'amount', 0, 1, 0.01).name('dusk wash')
		for (const controller of plate.controllers) controller.onChange(() => activeBackdrop?.retune())
		tile.add(values.tile, 'drop', app.clock.step, 1, app.clock.step).name('drop out (s)')
		tile.add(values.tile, 'pop', app.clock.step, 1, app.clock.step).name('pop in (s)')
		tile.add(values.deny, 'shake', app.clock.step, 1, app.clock.step).name('deny shake (s)')
	})

	app.modes.define('moba-front', {
		scheme: 'pointClick',
		start(run, { options = {} } = {}) {
			// Composition/menu entry requests name a destination, not a selection screen.
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
			const el = document.createElement('main')
			el.className = 'moba-front'
			el.dataset.screen = 'modes'
			el.setAttribute('aria-label', 'Choose a game or map')
			// Everything but the backdrop moves as one sticker sheet: it flies out under the lobby
			// shot and pops back in on return.
			// The title's o is the Ball; now and then one letter sidesteps a throw you never saw.
			const title = [...'DodgeThis']
				.map((c, i) => `<span class="front-letter${i === 1 ? ' front-ball' : ''}">${c}</span>`)
				.join('')
			el.innerHTML = `<div class="front-chrome"><h1 class="front-heading" aria-label="DodgeThis"><span aria-hidden="true">${title}</span></h1><p class="front-notice" role="status" hidden></p>
				<div class="front-tiles front-modes" role="group" aria-label="Game or map">${maps.map((tile, i) => `<button type="button" class="front-tile skin-card" data-mode="${tile.mode}" data-map="${tile.map}" data-light="${tune.skin.light[tile.map] ?? tune.skin.light.bonus}" style="--wash: ${tune.skin.wash[tile.map] ?? tune.skin.wash.bonus}">${paintedCard(i)}<span class="skin-sheet"></span><span class="skin-ring"></span><span class="skin-face"></span><span class="front-tile-art${tile.picture.startsWith('<svg') ? ' front-tile-plan' : ''}">${tile.picture}${paintedEdge(i)}</span><span class="front-tile-label skin-title">${paintedWash(i)}<span class="front-tile-name">${tile.name}</span></span></button>`).join('')}</div>
				<button type="button" class="front-bonus skin-card" data-mode="${bonus.mode}" data-light="${tune.skin.light.bonus}" style="--wash: ${tune.skin.wash.bonus}">${paintedCard(maps.length)}<span class="skin-sheet"></span><span class="skin-ring"></span><span class="skin-face"></span>${paintedWash(maps.length)}<svg viewBox="0 0 64 64" aria-hidden="true">${bonus.glyph}</svg><small class="front-bonus-kicker">Bonus</small><span class="front-bonus-name">${bonus.name}</span></button></div>`
			const chrome = el.querySelector('.front-chrome')
			const notice = el.querySelector('.front-notice')
			notice.textContent = options.notice ?? ''
			notice.hidden = !options.notice
			// The lobby hands its backdrop back on Esc; only a cold entry builds one.
			const backdrop = options.backdrop ?? createBackdrop()
			activeBackdrop = backdrop
			el.prepend(backdrop.el)
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
			let pop = null
			if (options.backdrop) {
				// The lobby's exit has usually started the shot and the dawn home already.
				if (backdrop.shotName !== 'splash') {
					backdrop.shot('splash')
					backdrop.tint(0, tune.shot.splash.time)
				}
				const time = tune.tile.pop
				pop = chrome.animate(
					[{ translate: '0 100vh' }, { translate: '0 -3vh', offset: 0.7 }, { translate: '0 0' }],
					{
						duration: time * 1000,
						delay: Math.max(0, backdrop.remaining - time) * 1000,
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
			// The lobby takes `el` and the backdrop in it; the tiles fly away above it on their own sheet.
			const sheet = document.createElement('div')
			sheet.className = 'moba-front front-leaving'
			sheet.inert = true
			sheet.setAttribute('aria-hidden', 'true')
			const front = {
				retune() {
					for (const target of [el, sheet]) {
						for (const [key, unit] of [
							['snap', 's'],
							['press', 's'],
							['lift', 'px'],
							['scale', ''],
							['tilt', 'deg'],
							['wash', ''],
						])
							target.style.setProperty('--tile-' + key, tune.tile[key] + unit)
						applySkin(target)
					}
				},
			}
			activeFront = front
			front.retune()
			const buttons = [...el.querySelectorAll('.front-tile, .front-bonus')]
			let transferred = false
			let leaving = false
			function activate(index) {
				if (leaving) return
				leaving = true
				const mode = buttons[index].dataset.mode
				if (mode === 'moba') {
					setup.map = buttons[index].dataset.map
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
				const picked = buttons.find((button) => button.classList.contains('selected'))
				const order = [
					chrome.querySelector('.front-heading'),
					notice,
					...buttons.filter((button) => button !== picked),
					picked,
				].filter(Boolean)
				// The title and notice fly up and left, the map cards shrink as they fall, Bonus falls.
				const { title, card, bonus, cardScale } = tune.tile.leave
				const flight = (node) => {
					const [x, y] =
						node === chrome.querySelector('.front-heading') || node === notice
							? title
							: node.classList.contains('front-bonus')
								? bonus
								: card
					const scale = node.classList.contains('front-tile') ? cardScale : 1
					return { translate: `${x * 100}vw ${y * 100}vh`, scale }
				}
				Promise.all(
					order.map(
						(node, i) =>
							node.animate([{ ...flight(node), rotate: i % 2 ? '-4deg' : '4deg' }], {
								duration: tune.tile.drop * 1000,
								delay: i * tune.tile.stagger * 1000,
								easing: 'cubic-bezier(0.5, 0, 0.9, 0.4)',
								fill: 'forwards',
							}).finished,
					),
				).then(
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
