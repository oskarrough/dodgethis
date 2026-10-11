// The sound board, a small desktop app for picking every sound in the game by ear. The bar shows how many sounds
// Oskar has picked; the strip is every sound as a light in the order a player meets them; then sources on the
// left, the stage in the middle (the sound map, or a tool), and the inspector with the deck on the right. State
// lives in state.js; the panes redraw on its 'change' and 'select'.
import {
	swap,
	uses,
	GROUPS,
	ORDER,
	idsIn,
	shortName,
	pickable,
	status,
	flags,
	where,
	go,
	step,
	on,
	measureAll,
	previewMusic,
	stopPreview,
	play,
} from './state.js'
import { tool, fight } from './tools.js'
import { drawInspector, actions } from './inspector.js'
import { openPalette } from './palette.js'

const $ = (id) => document.getElementById(id)
function el(tag, props = {}, ...children) {
	const node = Object.assign(document.createElement(tag), props)
	node.append(...children)
	return node
}

// The bar: how far along the pick is.
function drawProgress() {
	const kept = pickable.filter((id) => status(id) === 'kept').length
	const trying = pickable.filter((id) => status(id) === 'trying').length
	const leds = 24
	const on = Math.round((kept / pickable.length) * leds)
	const tried = Math.ceil((trying / pickable.length) * leds)
	$('progress').replaceChildren(
		el('b', { textContent: kept }),
		`/ ${pickable.length} picked`,
		el(
			'span',
			{ className: 'leds' },
			...Array.from({ length: leds }, (_, i) =>
				el('i', { className: i < on ? 'on' : i < on + tried ? 'try' : '' }),
			),
		),
		trying ? `${trying} trying` : '',
	)
}

// The strip: a light per sound, a group per source, a rule between screens, match and heroes.
function drawStrip() {
	const { use } = where()
	const flagged = flags()
	$('strip').replaceChildren(
		...GROUPS.flatMap(([, sources], g) =>
			sources.map((source, i) =>
				el(
					'div',
					{ className: `source${g && !i ? ' group-start' : ''}` },
					el('span', { textContent: source }),
					el(
						'div',
						{ className: 'lights' },
						...idsIn(source).map((id) => {
							const light = el('button', {
								className: 'light',
								type: 'button',
								title: `${id}: ${uses[id].about}`,
								ariaLabel: id,
							})
							light.dataset.status = status(id)
							if (flagged[id]) light.dataset.flag = ''
							if (id === use) light.ariaCurrent = 'true'
							light.addEventListener('click', () => go({ use: id }))
							return light
						}),
					),
				),
			),
		),
	)
	$('strip')
		.querySelector('[aria-current]')
		?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

// Sources on the left; the selected sound's source opens to list its sounds.
function drawSources() {
	const { use } = where()
	const open = use && uses[use].source
	$('sources').replaceChildren(
		...GROUPS.flatMap(([group, sources]) => [
			el('h2', { textContent: group }),
			el(
				'ul',
				{},
				...sources.map((source) => {
					const ids = idsIn(source)
					const done = ids.filter((id) => status(id) === 'kept').length
					const link = el(
						'a',
						{ href: `#u=${ids[0]}` },
						source,
						el('span', { className: 'count', textContent: `${done}/${ids.length}` }),
					)
					if (source !== open) return el('li', {}, link)
					return el(
						'li',
						{},
						link,
						el(
							'ul',
							{},
							...ids.map((id) => {
								const dot = el('span', { className: 'dot' })
								dot.dataset.status = status(id)
								const a = el('a', { href: `#u=${id}`, title: uses[id].about }, dot, shortName(id))
								if (id === use) a.ariaCurrent = 'true'
								return el('li', {}, a)
							}),
						),
					)
				}),
			),
		]),
	)
}

// The stage: the sound map, or a tool in its place.
const TABS = ['Map', 'Rules', 'Mix', 'Changes', 'Silent']
const map = await import('./map.js')
	.then((m) => m.createMap($('map')))
	.catch((error) => {
		console.warn('No sound map yet', error)
		$('map').replaceChildren(
			el('p', { className: 'empty', textContent: 'The sound map is coming.' }),
		)
		return null
	})
let shownTool = null
function drawStage(force = false) {
	const { tool: name } = where()
	const active = TABS.includes(name) ? name : 'Map'
	const count = { Rules: Object.keys(flags()).length }
	$('tabs').replaceChildren(
		...TABS.map((tab) => {
			const b = el('button', {
				type: 'button',
				role: 'tab',
				textContent: count[tab] ? `${tab} ${count[tab]}` : tab,
				ariaPressed: String(tab === active),
			})
			b.addEventListener('click', () => go({ tool: tab === 'Map' ? null : tab }))
			return b
		}),
	)
	$('map').hidden = active !== 'Map'
	$('tool').hidden = active === 'Map'
	if (active === 'Map') {
		shownTool = null
		return map?.update()
	}
	// The mix redraws only on navigation, so a slider being dragged keeps its place.
	if (shownTool === active && active === 'Mix' && !force) return
	shownTool = active
	const title = { Silent: 'Silent facts' }[active] ?? active
	$('tool').replaceChildren(el('h2', { textContent: title }), ...tool(title))
}

function draw() {
	drawProgress()
	drawStrip()
	drawSources()
	drawStage()
	drawInspector($('inspector'))
}
on('change', draw)
on('select', draw)
// Arriving at a sound plays what it plays now, so the first thing Oskar hears is the thing to judge.
let arrived = null
on('select', () => {
	const { use } = where()
	if (!use || use === arrived || uses[use].music) return
	arrived = use
	setTimeout(() => where().use === use && play(use), 120)
})
on('redraw-tool', () => drawStage(true))
let noticeTimer = 0
on('notice', (text) => {
	$('notice').textContent = text
	clearTimeout(noticeTimer)
	noticeTimer = setTimeout(() => ($('notice').textContent = ''), 4000)
})

// Keys, the same on every pane; letters skip when typing in a field.
addEventListener('keydown', (e) => {
	if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, select, textarea')) return
	const act = {
		ArrowUp: () => step(-1),
		ArrowDown: () => step(1),
		ArrowLeft: actions.previous,
		ArrowRight: actions.next,
		' ': actions.again,
		b: actions.builtin,
		f: actions.fight,
		s: actions.like,
		x: actions.nope,
		n: actions.near,
		k: actions.keep,
		z: actions.undoNope,
		...Object.fromEntries([1, 2, 3, 4, 5].map((n) => [String(n), () => actions.jump(n)])),
		Escape: () => {
			stopPreview()
			previewMusic(null)
		},
	}[e.key.length === 1 ? e.key.toLowerCase() : e.key]
	if (!act) return
	e.preventDefault()
	act()
	// The key's button dips, so the keyboard feels like pressing the box.
	const label =
		{ ' ': '␣', ArrowLeft: '←', ArrowRight: '→', ArrowDown: '↓' }[e.key] ?? e.key.toUpperCase()
	for (const b of document.querySelectorAll(`#inspector button[data-key="${CSS.escape(label)}"]`)) {
		b.classList.add('pressed')
		setTimeout(() => b.classList.remove('pressed'), 120)
	}
})

$('find').addEventListener('click', openPalette)
$('fight').addEventListener('click', () => fight())
$('stop').addEventListener('click', () => previewMusic(null))
$('resync').addEventListener('click', async () => {
	$('resync-status').textContent = 'Syncing…'
	const response = await fetch('/__sound/sync', { method: 'POST' })
	if (!response.ok)
		return ($('resync-status').textContent = `Resync failed: ${await response.text()}`)
	location.reload()
})

if (!where().use && !where().tool)
	go({ use: ORDER.find((id) => status(id) === 'builtin') ?? ORDER[0] })
draw()
swap.loaded.then(() => {
	draw()
	if (!location.search.includes('check')) measureAll()
})
