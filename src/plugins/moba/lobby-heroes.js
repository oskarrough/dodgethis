import { ICONS } from './hud.js'
import './lobby-heroes.css'

// The plaza's hero strip: one tile per hero, docked left of the HUD's hero card at its
// height, so it sits in the band the plaza camera already keeps clear. Yours is big and
// framed gold; clicking it opens the numbers sheet. Locked tiles say "soon" and wobble.
// Narrow screens have no room beside the card, so the strip stands on it instead.
const GAP = 10
const MARGIN = 8

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
		button.innerHTML = `<span class="lobby-hero-strip-face">${ICONS[definition.id] ?? ''}</span><span class="lobby-hero-strip-name">${definition.id}</span>${definition.playable ? '' : '<small>soon</small>'}`
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
		layout()
	}

	// Measured on resize and when the card changes size, never per frame.
	let card = null
	const observer = new ResizeObserver(() => layout())
	function layout() {
		const found = document.querySelector('.moba-portrait')
		if (found !== card) {
			if (card) observer.unobserve(card)
			card = found
			if (card) observer.observe(card)
		}
		const rect = card?.getBoundingClientRect()
		const height = rect?.height || 84
		strip.style.setProperty('--strip-h', `${height}px`)
		const width = strip.offsetWidth
		const beside = rect && rect.left - GAP - width >= MARGIN
		strip.dataset.dock = beside ? 'beside' : 'above'
		if (!rect) {
			strip.style.left = `${MARGIN}px`
			strip.style.bottom = `${MARGIN}px`
		} else if (beside) {
			strip.style.left = `${rect.left - GAP - width}px`
			strip.style.bottom = `${innerHeight - rect.bottom}px`
		} else {
			strip.style.left = `${Math.max(MARGIN, rect.left)}px`
			strip.style.bottom = `${innerHeight - rect.top + GAP}px`
		}
	}
	// The HUD may mount after the strip; look again until it shows up.
	let frame = 0
	const find = () => {
		layout()
		if (!card) frame = requestAnimationFrame(find)
	}
	find()
	addEventListener('resize', layout)
	sync(current)

	return {
		el: strip,
		sync,
		setDevice(device) {
			key.textContent = device === 'gamepad' ? '✛↑' : device === 'keyboard' ? 'H' : ''
			strip.dataset.device = device
		},
		dispose() {
			cancelAnimationFrame(frame)
			removeEventListener('resize', layout)
			observer.disconnect()
			strip.remove()
		},
	}
}
