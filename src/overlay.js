// The full-screen modal for the non-playing phases: the start menu, the
// round-over card, the match-over card. It's the game's only "menu UI"; the
// gameplay HUD and combat log live elsewhere.
//
// show() renders a title + subtitle + lines + a row of actions. Each action is a
// button (click) optionally bound to a key, and Enter always triggers the first
// (default) action — so every screen is operable by mouse or keyboard. This is
// the rough analog of a Godot menu scene whose buttons emit a "pressed" signal.
//
// Action shape: { label, key?, keyLabel?, onSelect }
//   key      — a KeyboardEvent.code ('Digit3', 'KeyM', …) that triggers it
//   keyLabel — short hint shown on the button ('Enter', '3', 'R')
import { sfx } from './audio.js'

export function createOverlay(selector = '.overlay') {
	const el = document.querySelector(selector)
	let actions = []

	function show({ title = '', subtitle = '', lines = [], actions: acts = [] }) {
		actions = acts
		const card = document.createElement('div')
		card.className = 'card'

		if (title) {
			const h = document.createElement('h1')
			h.textContent = title
			card.append(h)
		}
		if (subtitle) {
			const s = document.createElement('p')
			s.className = 'sub'
			s.textContent = subtitle
			card.append(s)
		}
		for (const ln of lines) {
			const p = document.createElement('p')
			p.className = 'line'
			p.innerHTML = ln // lines may carry colored <span>s for the score
			card.append(p)
		}
		if (acts.length) {
			const row = document.createElement('div')
			row.className = 'actions'
			for (const a of acts) {
				const b = document.createElement('button')
				b.textContent = a.keyLabel ? `${a.label}  (${a.keyLabel})` : a.label
				b.addEventListener('pointerenter', () => sfx.hover())
				b.addEventListener('pointerdown', () => sfx.press())
				b.addEventListener('click', (e) => {
					e.stopPropagation()
					sfx.confirm()
					select(a)
				})
				row.append(b)
			}
			card.append(row)
		}

		el.replaceChildren(card)
		el.hidden = false
		sfx.menuOpen()
	}

	function hide() {
		if (!el.hidden) sfx.menuClose()
		el.hidden = true
		actions = []
	}

	function select(a) {
		if (a && a.onSelect) a.onSelect()
	}

	// Keyboard: Enter = default action, or any action's bound key.
	window.addEventListener('keydown', (e) => {
		if (el.hidden) return
		if (e.code === 'Enter' && actions[0]) {
			e.preventDefault()
			sfx.click()
			select(actions[0])
			return
		}
		const a = actions.find((x) => x.key === e.code)
		if (a) {
			e.preventDefault()
			sfx.click()
			select(a)
		}
	})

	return {
		show,
		hide,
		get visible() {
			return !el.hidden
		},
	}
}
