import { createBackdrop } from './backdrop.js'
import { createControls } from './controls.js'
import { tune } from './tune.js'
import './front.css'

// Separate menu run: no map, no bodies, no WebGL draws. Practice uses the existing match.
export function mobaFront(app) {
	app.modes.define('moba-front', {
		scheme: 'pointClick',
		start(run) {
			run.renderDemand(() => false)
			run.clock.pause(() => true)
			run.intents.suspend(() => true)
			app.intents.cancel()
			app.audio.setMusicScene('front')
			const backdrop = createBackdrop()
			const el = document.createElement('main')
			el.className = 'moba-front'
			el.setAttribute('aria-labelledby', 'front-title')
			el.innerHTML = `<header><p>Dodge this · the far lane</p>
				<h1 id="front-title">Find your footing.</h1>
				<p>A quiet place to learn a loud game.</p></header>
				<section aria-label="Choose a mode"><button type="button" class="front-practice">
				<svg viewBox="0 0 240 120" aria-hidden="true">
					<path d="M16 107 Q120 82 224 107" fill="none"/>
					<g fill="var(--front-straw)">
						<path d="M76 102 V54 M52 67 H100 M160 102 V40 M134 54 H186" fill="none"/>
						<path d="M66 51 L86 51 L91 79 L61 79Z M148 38 L172 38 L179 68 L141 68Z"/>
						<circle cx="76" cy="36" r="12"/><circle cx="160" cy="22" r="13"/>
					</g>
					<path d="M71 34 L81 39 M81 34 L71 39 M155 20 L165 25 M165 20 L155 25 M69 62 H83 M153 49 H167"/>
				</svg><span class="front-mode-name">Practice</span>
				<span>Just you, your bow &amp; the dummies.</span>
				<span class="front-enter">Step onto the lane →</span></button></section>
				<footer><button type="button" class="front-back">← Back to the hub</button>
				<p class="front-prompts" aria-live="polite"></p><span>Fletcher · 01</span></footer>`
			el.prepend(backdrop.el)
			const buttons = [...el.querySelectorAll('button')]
			const outside = [...document.body.children].filter((child) => child.tagName !== 'SCRIPT')
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
				el.querySelector('.front-prompts').textContent =
					next === 'gamepad'
						? 'D-pad / stick · choose    A · enter    B · back'
						: next === 'mouse'
							? 'Point · choose    Click · enter'
							: 'Tab / arrows · choose    Enter · enter    Esc · back'
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
