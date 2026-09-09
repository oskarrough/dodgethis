// Full-screen non-playing modal with persistent cursor navigation by keyboard or gamepad; actions are { label, key?, keyLabel?, onSelect }, where key is a KeyboardEvent.code and keyLabel is its button hint.
import { sfx } from './audio.js'

export function createOverlay(selector = '.overlay') {
	const el = document.querySelector(selector)
	let actions = []
	let buttons = []
	let index = 0
	let previousFocus = null
	let outside = []
	let device = 'keyboard'

	// Clear round-over keeps the court and score readable; match-over may retain the curtain.
	function show({ title = '', subtitle = '', lines = [], actions: acts = [], clear = false } = {}) {
		actions = acts
		buttons = []
		index = 0
		if (el.hidden) previousFocus = document.activeElement
		el.classList.toggle('clear', clear)
		const card = document.createElement('div')
		card.className = 'card dialog-card'
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
				b.className = 'sticker'
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
		}

		el.replaceChildren(card)
		renderPrompts()
		el.hidden = false
		// Clear mode keeps chrome and debug active; curtain mode makes the page outside the dialog inert.
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
	}

	function setDevice(next) {
		if (device === next) return
		device = next
		renderPrompts()
	}

	// Gamepad movement changes selection and confirm invokes it.
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
