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
	let previousFocus = null
	let outside = []
	let device = 'keyboard'
	let controls = null

	// clear: round-over keeps court + scoreboard readable (no dim / blur veil).
	// Match-over may keep the default curtain.
	function show({ title = '', subtitle = '', lines = [], actions: acts = [], clear = false } = {}) {
		actions = acts
		buttons = []
		index = 0
		if (el.hidden) previousFocus = document.activeElement
		el.classList.toggle('clear', clear)
		const card = document.createElement('div')
		card.className = 'card'
		card.setAttribute('role', 'dialog')
		card.setAttribute('aria-modal', 'true')

		if (title) {
			const h = document.createElement('h1')
			h.id = 'overlay-title'
			h.textContent = title
			card.setAttribute('aria-labelledby', h.id)
			card.append(h)
		} else {
			card.setAttribute('aria-label', 'Game menu')
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
			p.textContent = ln
			card.append(p)
		}
		if (acts.length) {
			const row = document.createElement('div')
			row.className = 'actions'
			acts.forEach((a, i) => {
				const b = document.createElement('button')
				const cursor = document.createElement('span')
				cursor.className = 'cursor'
				cursor.setAttribute('aria-hidden', 'true')
				cursor.textContent = '▶'
				const label = document.createElement('span')
				label.className = 'label'
				b.append(cursor, label)
				b.addEventListener('pointerenter', () => {
					setIndex(i)
					sfx.hover()
				})
				b.addEventListener('focus', () => setIndex(i))
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
			controls = document.createElement('p')
			controls.className = 'controls'
			card.append(controls)
		}

		el.replaceChildren(card)
		renderPrompts()
		el.hidden = false
		// Keep match chrome + debug readable during clear round-over; only the
		// dialog captures focus. Curtain phases still inert the rest of the page.
		outside = [...document.body.children].filter((child) => child !== el)
		if (clear) {
			outside = []
		} else {
			for (const child of outside) child.inert = true
		}
		render()
		buttons[0]?.focus()
		sfx.menuOpen()
	}

	function hide() {
		if (!el.hidden) sfx.menuClose()
		el.hidden = true
		el.classList.remove('clear')
		actions = []
		buttons = []
		controls = null
		index = 0
		for (const child of outside) child.inert = false
		outside = []
		previousFocus?.focus()
		previousFocus = null
	}

	function select(a) {
		if (a && a.onSelect) a.onSelect()
	}

	function setIndex(i, focus = false) {
		const n = actions.length
		if (!n) return
		index = ((i % n) + n) % n // wrap both directions
		render()
		if (focus) buttons[index].focus()
	}

	function render() {
		buttons.forEach((b, i) => b.classList.toggle('selected', i === index))
	}

	function renderPrompts() {
		const pad = device === 'gamepad'
		buttons.forEach((b, i) => {
			const action = actions[i]
			b.querySelector('.label').textContent =
				!pad && action.keyLabel ? `${action.label}  (${action.keyLabel})` : action.label
		})
		if (controls)
			controls.textContent = pad
				? 'D-pad / left stick: choose · A: confirm'
				: 'Arrow keys: choose · Enter: confirm'
	}

	function setDevice(next) {
		if (device === next) return
		device = next
		renderPrompts()
	}

	// Keyboard: arrows / WASD move the cursor, Enter/Space confirm, and any
	// action's bound key shortcuts straight to it.
	function handleGamepad({ move, confirm }) {
		if (el.hidden || !actions.length) return
		if (move) {
			setIndex(index + move, true)
			sfx.nav()
		}
		if (confirm) {
			sfx.click()
			select(actions[index])
		}
	}

	window.addEventListener('keydown', (e) => {
		if (el.hidden || !actions.length) return
		if (e.code === 'Tab') {
			const focusable = buttons
			const current = focusable.indexOf(document.activeElement)
			const direction = e.shiftKey ? -1 : 1
			const next =
				(((current + direction) % focusable.length) + focusable.length) % focusable.length
			e.preventDefault()
			focusable[next].focus()
			return
		}
		if (
			e.code === 'ArrowDown' ||
			e.code === 'ArrowRight' ||
			e.code === 'KeyS' ||
			e.code === 'KeyD'
		) {
			e.preventDefault()
			setIndex(index + 1, true)
			sfx.nav()
			return
		}
		if (e.code === 'ArrowUp' || e.code === 'ArrowLeft' || e.code === 'KeyW' || e.code === 'KeyA') {
			e.preventDefault()
			setIndex(index - 1, true)
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
		handleGamepad,
		setDevice,
		get visible() {
			return !el.hidden
		},
	}
}
