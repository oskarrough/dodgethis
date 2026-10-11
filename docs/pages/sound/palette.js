// The palette (⌘K or /): type a few letters to jump to any sound or tool, or to try any library file in the
// selected sound. Every word must match somewhere in the line; sounds come first, then tools, then files.
import { uses, library, where, go, deckTo, preview, gainFor } from './state.js'

function el(tag, props = {}, ...children) {
	const node = Object.assign(document.createElement(tag), props)
	node.append(...children)
	return node
}

const TOOLS = ['Map', 'Rules', 'Mix', 'Changes', 'Silent']
const entries = () => [
	...Object.entries(uses).map(([id, use]) => ({
		text: `${id} ${use.about} ${use.source}`,
		label: id,
		hint: use.about,
		run: () => go({ use: id }),
	})),
	...TOOLS.map((tool) => ({
		text: `${tool} tool`,
		label: tool,
		hint: 'tool',
		run: () => go({ tool: tool === 'Map' ? null : tool }),
	})),
	...library.map((path) => ({
		text: path,
		label: path,
		hint: where().use ? `try in ${where().use}` : 'listen',
		file: path,
		run: () => (where().use ? deckTo(path) : preview(path)),
	})),
]

const input = el('input', {
	type: 'search',
	placeholder: 'Sound, tool or file…',
	ariaLabel: 'Find',
})
const list = el('ol')
const dialog = el('dialog', { className: 'palette' }, input, list)
document.body.append(dialog)
let shown = []
let at = 0

function draw() {
	const words = input.value.toLowerCase().split(/\s+/).filter(Boolean)
	shown = words.length
		? entries()
				.filter((e) => words.every((w) => e.text.toLowerCase().includes(w)))
				.slice(0, 40)
		: []
	at = Math.min(at, Math.max(shown.length - 1, 0))
	list.replaceChildren(
		...shown.map((e, i) => {
			const li = el(
				'li',
				{},
				el('span', { textContent: e.label }),
				el('small', { textContent: e.hint }),
			)
			if (i === at) li.ariaSelected = 'true'
			li.addEventListener('click', () => choose(i))
			li.addEventListener('mouseenter', () => {
				at = i
				for (const [j, item] of [...list.children].entries())
					item.ariaSelected = j === i ? 'true' : null
			})
			return li
		}),
	)
	list.querySelector('[aria-selected]')?.scrollIntoView({ block: 'nearest' })
}
function choose(i) {
	const e = shown[i]
	if (!e) return
	dialog.close()
	e.run()
}
input.addEventListener('input', () => {
	at = 0
	draw()
})
input.addEventListener('keydown', (e) => {
	if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
		e.preventDefault()
		at = (at + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % Math.max(shown.length, 1)
		draw()
		// A file under the cursor plays, so arrowing through files is listening.
		const file = shown[at]?.file
		if (file) preview(file, gainFor(where().use, file))
	} else if (e.key === 'Enter') {
		e.preventDefault()
		choose(at)
	}
})

export function openPalette() {
	input.value = ''
	shown = []
	list.replaceChildren()
	dialog.showModal()
	input.focus()
}
addEventListener('keydown', (e) => {
	const typing = e.target.closest?.('input, select, textarea')
	if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
		e.preventDefault()
		openPalette()
	}
})
