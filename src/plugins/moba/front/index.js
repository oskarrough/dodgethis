import { createBackdrop } from './backdrop.js'
import { createControls } from './controls.js'
import { tune } from './tune.js'
import './front.css'

// Separate menu run: no map, no bodies, no WebGL draws. Practice uses the existing match.
export function mobaFront(app) {
	let activeBackdrop = null
	app.debug.tune('front', tune, (folder, values) => {
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
		start(run) {
			run.renderDemand(() => false)
			run.clock.pause(() => true)
			run.intents.suspend(() => true)
			app.intents.cancel()
			app.audio.setMusicScene('wind')
			const el = document.createElement('main')
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
			const backdrop = createBackdrop(el)
			activeBackdrop = backdrop
			el.prepend(backdrop.el)
			const buttons = [...el.querySelectorAll('button')]
			const outside = [...document.body.children].filter(
				(child) => child.tagName !== 'SCRIPT' && !child.matches('.lil-gui'),
			)
			const previous = outside.map((child) => child.inert)
			for (const child of outside) child.inert = true
			document.body.append(el)
			let leaving = false
			function leave(mode) {
				if (leaving) return
				leaving = true
				if (mode === 'moba') {
					for (const freq of tune.confirm.frequencies)
						app.audio.blip({ freq, dur: tune.confirm.dur, gain: tune.confirm.gain, type: 'sine' })
				} else {
					app.audio.blip({ ...tune.back, type: 'sine' })
					const url = new URL(location.href)
					url.searchParams.delete('mode')
					history.replaceState(null, '', url)
				}
				app.intents.cancel()
				app.modes.start(mode)
			}
			let device = ''
			function setDevice(next) {
				if (device === next) return
				device = next
				el.dataset.device = next
				const prompts =
					next === 'gamepad'
						? ['D-pad / stick · choose', 'A · go', 'B · back']
						: next === 'mouse'
							? ['Point · choose', 'Click · go']
							: ['Tab / arrows · choose', 'Enter · go', 'Esc · back']
				el.querySelector('.front-prompts').replaceChildren(
					...prompts.map((text) => {
						const span = document.createElement('span')
						span.textContent = text
						return span
					}),
				)
			}
			setDevice('keyboard')
			const controls = createControls({
				count: buttons.length,
				focus(index) {
					buttons.forEach((button, i) => button.classList.toggle('selected', i === index))
					if (document.activeElement !== buttons[index])
						buttons[index].focus({ preventScroll: true })
				},
				activate: (index) => leave(index === 0 ? 'moba' : 'dodgeball'),
				back: () => leave('dodgeball'),
				device: setDevice,
			})
			buttons.forEach((button, index) => {
				button.addEventListener('pointerenter', () => {
					setDevice('mouse')
					controls.point(index)
				})
				button.addEventListener('focus', () => controls.point(index))
				button.addEventListener('click', () => leave(index === 0 ? 'moba' : 'dodgeball'))
			})
			window.addEventListener('keydown', (event) => controls.key(event), { signal: run.signal })
			run.system('input', () => {
				controls.pad(app.input.consumeMenuInput(), app.input.pad())
			})
			controls.point(0)
			run.debug.expose({ front: { crossfade: backdrop.crossfade } })
			run.signal.addEventListener(
				'abort',
				() => {
					if (activeBackdrop === backdrop) activeBackdrop = null
					backdrop.dispose()
					el.remove()
					outside.forEach((child, i) => {
						child.inert = previous[i]
					})
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
