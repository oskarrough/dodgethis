// The full-screen modal for the non-playing phases: the start menu, the
// round-over card, the match-over card. It's the game's only "menu UI"; the
// gameplay HUD and combat log live elsewhere.
//
// show() renders a title + subtitle + lines + a row of actions. Each action is a
// button (click) optionally bound to a key. A single "cursor" selection is
// always active: a blinking ▶ marker + gold fill marks the current action, and
// the D-pad / arrow keys (or WASD) move it; Enter or Space picks it. That's the
// classic handheld-menu feel — D-pad to move, A to confirm — so the menu never
// depends on tab-focus. Number keys still shortcut straight to an action, with
// a "(3)"-style hint on the button.
//
// Action shape: { label, key?, keyLabel?, onSelect }
//   key      — a KeyboardEvent.code ('Digit3', 'KeyM', …) that triggers it
//   keyLabel — short hint shown on the button ('Enter', '3', 'R')
import { sfx } from './audio.js'

export function createOverlay(selector = '.overlay') {
	const el = document.querySelector(selector)
	let actions = []
	let buttons = []
	let index = 0

	function show({ title = '', subtitle = '', lines = [], actions: acts = [] }) {
		actions = acts
		buttons = []
		index = 0
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
			acts.forEach((a, i) => {
				const b = document.createElement('button')
				b.tabIndex = -1 // keyboard goes through the cursor, not tab focus
				const cursor = document.createElement('span')
				cursor.className = 'cursor'
				cursor.textContent = '▶'
				const label = document.createElement('span')
				label.textContent = a.keyLabel ? `${a.label}  (${a.keyLabel})` : a.label
				b.append(cursor, label)
				b.addEventListener('pointerenter', () => {
					setIndex(i)
					sfx.hover()
				})
				b.addEventListener('pointerdown', () => sfx.press())
				b.addEventListener('click', (e) => {
					e.stopPropagation()
					sfx.confirm()
					select(a)
				})
				row.append(b)
				buttons.push(b)
			})
			card.append(row)
		}

		el.replaceChildren(card)
		el.hidden = false
		render()
		sfx.menuOpen()
	}

	function hide() {
		if (!el.hidden) sfx.menuClose()
		el.hidden = true
		actions = []
		buttons = []
		index = 0
	}

	function select(a) {
		if (a && a.onSelect) a.onSelect()
	}

	function setIndex(i) {
		const n = actions.length
		if (!n) return
		index = ((i % n) + n) % n // wrap both directions
		render()
	}

	function render() {
		buttons.forEach((b, i) => b.classList.toggle('selected', i === index))
	}

	// Keyboard: D-pad / WASD move the cursor, Enter/Space confirm, and any
	// action's bound key shortcuts straight to it.
	window.addEventListener('keydown', (e) => {
		if (el.hidden || !actions.length) return
		if (
			e.code === 'ArrowDown' ||
			e.code === 'ArrowRight' ||
			e.code === 'KeyS' ||
			e.code === 'KeyD'
		) {
			e.preventDefault()
			setIndex(index + 1)
			sfx.nav()
			return
		}
		if (e.code === 'ArrowUp' || e.code === 'ArrowLeft' || e.code === 'KeyW' || e.code === 'KeyA') {
			e.preventDefault()
			setIndex(index - 1)
			sfx.nav()
			return
		}
		if (e.code === 'Enter' || e.code === 'Space') {
			e.preventDefault()
			sfx.click()
			select(actions[index])
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
