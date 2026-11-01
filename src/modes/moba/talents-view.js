import './talents.css'
import { el } from '../../core/dom.js'
import { queueAction } from '../../core/input.js'
import { treeOf, rowLevel, openRow } from './talents.js'
import { renderCardTemplate, sentenceHtml } from './tooltip.js'
import { HEROES } from './heroes.js'

// The talent tree on screen (talents.js holds the rules). A chip under the unit frame says the tree
// is there, and wakes when a row opens; T (the pad's d-pad up) opens the whole tree beside play,
// which never pauses. In the tree, 1 2 3 or a click take the open row's talent, and the pad's
// d-pad left, up and right take its three; B closes it. A pick is an intent, so it waits on nothing.

const KEY_TREE = 'KeyT'
const PAD_B = 1
const PAD_UP = 12
const PAD_LEFT = 14
const PAD_RIGHT = 15
const DIGITS = ['Digit1', 'Digit2', 'Digit3']

export function createTalentsView(parent = document.body) {
	const chip = el('button', 'moba-talent-chip', parent)
	chip.type = 'button'
	chip.tabIndex = -1
	const chipLevel = el('b', 'level', chip) // rows waiting on a pick
	const chipText = el('span', 'text', chip)
	const chipKey = el('span', 'key-cap', chip)
	const panel = el('section', 'moba-talents', parent)
	panel.setAttribute('aria-label', 'Talents')
	panel.hidden = true
	chip.hidden = true

	let heroId = null
	let rows = []
	let open = false
	let shownKey = ''
	let device = 'keyboard'
	let row = -1
	let previousPad = []

	function build(id) {
		heroId = id
		const tree = treeOf(id)
		panel.innerHTML = ''
		const head = el('header', '', panel)
		el('h2', '', head, 'Talents')
		el(
			'p',
			'lede',
			head,
			`Each level from ${rowLevel(0)} to ${rowLevel(tree.rows.length - 1)} opens a row of three. ${HEROES[id].name} keeps one from each until the run ends.`,
		)
		const close = el('button', 'close', head)
		close.type = 'button'
		close.tabIndex = -1
		close.setAttribute('aria-label', 'Close the talent tree')
		close.onclick = () => toggle(false)
		const ids = { prefix: 'moba-talent', next: 0 }
		rows = tree.rows.map((talents, r) => {
			const node = el('div', 'row', panel)
			const index = el('div', 'index', node)
			el('b', '', index, String(rowLevel(r)))
			el('span', '', index, 'level')
			const cells = talents.map((talent, column) => {
				const cell = el('button', 'talent', node)
				cell.type = 'button'
				cell.tabIndex = -1
				const icon = el('span', 'icon', cell, talent.icon)
				icon.setAttribute('aria-hidden', 'true')
				el('b', 'name', cell, talent.name)
				const key = el('span', 'key-cap', cell)
				el(
					'p',
					'text',
					cell,
					sentenceHtml(renderCardTemplate(talent.text, `heroes.${id}.talents.${talent.id}`), ids),
				)
				cell.addEventListener('pointerdown', (e) => {
					if (e.button === 0) e.preventDefault() // keep focus on the game
				})
				cell.onclick = () => {
					if (r === row) take(column)
				}
				return { cell, key }
			})
			return { node, cells }
		})
		shownKey = ''
	}

	function take(column) {
		if (row < 0) return
		queueAction(`talent${column + 1}`)
	}
	function toggle(on = !open) {
		open = on && !!heroId
		shownKey = ''
	}
	chip.addEventListener('pointerdown', (e) => {
		if (e.button === 0) e.preventDefault()
	})
	chip.onclick = () => toggle()

	// Capture, so the tree's keys never reach the kit (the WASD presets aim with 1 2 3) or the menu's Esc.
	const onKey = (e) => {
		if (e.ctrlKey || e.metaKey || e.altKey || chip.hidden) return
		if (e.target?.closest?.('input, textarea, select, [contenteditable]')) return
		if (e.code === KEY_TREE) {
			if (!e.repeat) toggle()
		} else if (open && e.code === 'Escape') toggle(false)
		else if (open && DIGITS.includes(e.code)) {
			if (!e.repeat) take(DIGITS.indexOf(e.code))
		} else return
		e.preventDefault()
		e.stopPropagation()
	}
	globalThis.window?.addEventListener('keydown', onKey, { capture: true })

	return {
		// `frame.hero` is the local hero; `frame.pad` the pad's buttons; `frame.device` the last used.
		update(frame) {
			const hero = frame.hero
			const tree = hero && Array.isArray(hero.talents) ? treeOf(hero.heroId) : null
			if (!tree) {
				chip.hidden = true
				panel.hidden = true
				open = false
				return
			}
			if (hero.heroId !== heroId) build(hero.heroId)
			device = frame.device ?? 'keyboard'
			row = openRow(hero)
			// Pad: up opens the tree; in it, left, up and right take the open row's three, and B closes.
			const buttons = frame.pad?.buttons ?? []
			const edge = (i) => buttons[i] && !previousPad[i]
			if (open && row >= 0) [PAD_LEFT, PAD_UP, PAD_RIGHT].forEach((b, c) => edge(b) && take(c))
			else if (edge(PAD_UP)) toggle()
			if (open && edge(PAD_B)) toggle(false)
			previousPad = buttons.slice()

			const pad = device === 'gamepad'
			const key = [hero.talents.join(','), hero.level, row, open, pad].join('|')
			if (key === shownKey) return
			shownKey = key
			chip.hidden = false
			chip.classList.toggle('awake', row >= 0)
			chip.setAttribute('aria-pressed', String(open))
			// How many rows wait on a pick, like unspent points.
			const waiting = tree.rows.filter(
				(_, r) => hero.talents[r] == null && hero.level >= rowLevel(r),
			)
			chipLevel.textContent = row >= 0 ? String(waiting.length) : ''
			chipText.textContent = row >= 0 ? 'A talent awaits' : 'Talents'
			chipKey.textContent = pad ? '▲' : 'T'
			panel.hidden = !open
			if (!open) return
			rows.forEach(({ node, cells }, r) => {
				const picked = hero.talents[r]
				const state =
					picked != null
						? 'done'
						: r === row
							? 'open'
							: hero.level >= rowLevel(r)
								? 'waiting'
								: 'locked'
				node.dataset.state = state
				cells.forEach(({ cell, key: badge }, column) => {
					cell.classList.toggle('picked', picked === column)
					cell.disabled = state !== 'open'
					badge.textContent =
						state === 'open' ? (pad ? ['◀', '▲', '▶'][column] : `${column + 1}`) : ''
				})
			})
		},
		dispose() {
			globalThis.window?.removeEventListener('keydown', onKey, { capture: true })
			chip.remove()
			panel.remove()
		},
	}
}
