import { ICONS } from './hud.js'
import './lobby-heroes.css'

// The lobby's hero strip: one tile per hero, stacked down the left edge, apart from the
// HUD so it reads as a menu rather than part of your hero. Yours slides out, framed gold;
// clicking it opens the numbers sheet. Locked tiles say "soon" and wobble.
export function createHeroStrip({ el, heroes, current, pick, openNumbers }) {
	const strip = document.createElement('nav')
	strip.className = 'lobby-hero-strip'
	strip.setAttribute('aria-label', 'Pick a hero')
	strip.innerHTML = '<kbd class="lobby-hero-strip-key"></kbd>'
	const key = strip.firstChild
	const tiles = Object.values(heroes).map((definition) => {
		const button = document.createElement('button')
		button.type = 'button'
		button.dataset.hero = definition.id
		if (!definition.playable) button.setAttribute('aria-disabled', 'true')
		button.innerHTML = `<span class="lobby-hero-strip-face">${ICONS[definition.id] ?? ''}</span><span class="lobby-hero-strip-name"><span>${definition.id}</span></span>${definition.playable ? '' : '<small>soon</small>'}`
		button.onclick = () => {
			if (button.dataset.hero === current) return openNumbers()
			if (!definition.playable) wobble(button)
			pick(definition.id)
		}
		button.onanimationend = () => button.classList.remove('wobble', 'pop')
		strip.append(button)
		return button
	})
	el.append(strip)

	function wobble(button) {
		button.classList.remove('wobble')
		void button.offsetWidth
		button.classList.add('wobble')
	}

	function sync(heroId) {
		const changed = heroId !== current
		current = heroId
		for (const button of tiles) {
			const mine = button.dataset.hero === heroId
			button.setAttribute('aria-pressed', String(mine))
			button.setAttribute(
				'aria-label',
				mine ? `${button.dataset.hero}: show numbers` : button.dataset.hero,
			)
			if (mine && changed) {
				button.classList.remove('pop')
				void button.offsetWidth
				button.classList.add('pop')
			}
		}
	}

	sync(current)

	return {
		el: strip,
		sync,
		setDevice(device) {
			key.textContent = device === 'gamepad' ? '✛↑' : device === 'keyboard' ? '↑↓' : ''
			strip.dataset.device = device
		},
		dispose() {
			strip.remove()
		},
	}
}
