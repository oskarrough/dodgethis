// The desk: live numbers you can try while playing. Backquote (` / the key above Tab) opens it;
// it lists what this screen can tune (folders to open, values to find, actions to run) and pins
// values as instruments shaped like what they control: a clock for a duration, a speedometer for
// a speed, a ring for a radius. ?knobs=lob,fog pins from the address. "copy" puts changed values
// on the clipboard as JSON; "share" opens a GitHub issue so a maintainer can make them the default.
// "all values" opens the old lil-gui panel, which still registers them.
import './desk.css'
import { folderOf, shareIssue } from './desk-share.js'
import { units } from './units.js'

const STORE = 'dt-desk'
const MAX = 36

function kindOf(c) {
	if (c.unit === 'color') return 'swatch'
	if (!['number', 'boolean'].includes(typeof c.getValue())) return null
	return units[c.unit]?.instrument ?? 'knob'
}

function range(c) {
	const v = typeof c.initialValue === 'number' ? c.initialValue : 0
	const defaults = units[c.unit]?.range
	const min = Math.min(c._min ?? defaults?.[0] ?? 0, defaults?.[0] ?? v, v)
	const max = Math.max(c._max ?? defaults?.[1] ?? 1, defaults?.[1] ?? v, v)
	return [min, max]
}

function pathOf(c) {
	const parts = [c.property]
	for (let g = c.parent; g?.parent; g = g.parent) parts.unshift(g._title)
	return parts.join('/')
}

function read() {
	try {
		return { queries: [], values: {}, ...JSON.parse(localStorage.getItem(STORE)) }
	} catch {
		return { queries: [], values: {} }
	}
}

export function createDesk(gui) {
	const state = read()
	const fromUrl = new URLSearchParams(location.search).get('knobs')
	if (fromUrl)
		for (const q of fromUrl.split(',')) if (q && !state.queries.includes(q)) state.queries.push(q)
	const save = () => localStorage.setItem(STORE, JSON.stringify(state))

	const root = document.createElement('section')
	root.className = 'desk'
	root.hidden = true
	root.innerHTML = `<header class="desk-head"><b title="press \` to hide · change a number, then share it as a GitHub issue">desk</b><span class="desk-chips"></span>
		<button data-act="copy" title="copy changed values as JSON, to paste into a GitHub issue">copy</button>
		<button data-act="share" title="open a GitHub issue with what you changed">share</button>
		<button data-act="reset" title="put every changed value back">reset</button>
		<button data-act="panel" title="the old panel with every value as a slider">all values</button>
		<input class="desk-find" type="search" placeholder="find a value: lob, speed, fog…" /></header>
		<nav class="desk-index"></nav><div class="desk-board"></div><p class="desk-note"></p>`
	document.body.append(root)
	const chips = root.querySelector('.desk-chips')
	const find = root.querySelector('.desk-find')
	const index = root.querySelector('.desk-index')
	find.addEventListener('input', () => renderIndex())
	find.addEventListener('focus', () => renderIndex())
	find.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') {
			find.value = ''
			find.blur()
			browse = null
			renderIndex()
		}
		if (e.key !== 'Enter') return
		pin(find.value.trim())
		find.value = ''
		find.blur()
	})
	const board = root.querySelector('.desk-board')
	const note = root.querySelector('.desk-note')
	if (state.at) Object.assign(root.style, { left: `${state.at[0]}px`, top: `${state.at[1]}px` })
	for (const type of ['keydown', 'keyup', 'wheel', 'contextmenu'])
		root.addEventListener(type, (e) => e.stopPropagation())

	let modules = []
	let shown = true
	let browse = null // the folder the index has drilled into, or null at the top
	let shownKeys = ''
	const restored = new Set()

	function matches() {
		const qs = state.queries.map((q) => q.toLowerCase())
		const found = []
		for (const c of gui.controllersRecursive()) {
			const key = pathOf(c)
			if (!restored.has(key) && key in state.values) {
				restored.add(key)
				if (c.getValue() !== state.values[key]) c.setValue(state.values[key])
			}
			const hay = `${key} ${c._name}`.toLowerCase()
			if (qs.some((q) => hay.includes(q)) && kindOf(c)) found.push({ key, c })
		}
		return found
	}

	// The index answers "what can I tune here?": with nothing typed it lists this screen's folders
	// (click to open one, or pin it whole) and its actions; typing lists matching folders and values.
	function renderIndex() {
		const query = find.value.trim().toLowerCase()
		const open =
			query || browse !== null || document.activeElement === find || !state.queries.length
		index.hidden = !open
		if (!open) return
		const controllers = gui.controllersRecursive()
		const folders = new Map()
		for (const c of controllers) {
			if (!kindOf(c)) continue
			const parts = pathOf(c).split('/').slice(0, -1)
			for (let i = 1; i <= parts.length; i++) {
				const path = parts.slice(0, i).join('/')
				folders.set(path, (folders.get(path) ?? 0) + 1)
			}
		}
		const items = []
		const crumb = document.createElement('p')
		crumb.className = 'desk-crumb'
		if (query) {
			crumb.textContent = 'Click to pin, or Enter to pin everything matching.'
			// A whole word beats the start of a word beats anywhere inside one: "lob" finds Lob before globes.
			const score = (text) => {
				const words = text.toLowerCase().split(/[^a-z0-9]+/)
				if (words.includes(query)) return 0
				if (words.some((w) => w.startsWith(query))) return 1
				return text.toLowerCase().includes(query) ? 2 : 3
			}
			const hits = []
			for (const [path, n] of folders) {
				const rank = score(path)
				if (rank < 3) hits.push([rank, 0, chip(path, `${path} · ${n}`, () => pin(path))])
			}
			for (const c of controllers) {
				const key = pathOf(c)
				const kind = kindOf(c)
				const rank = kind ? Math.min(score(c._name), score(key) + 1) : 3
				if (rank < 3)
					hits.push([
						rank,
						1,
						chip(key, c._name, () => pin(key), kind, key.split('/').slice(0, -1).join(' / ')),
					])
			}
			hits.sort((a, b) => a[0] - b[0] || a[1] - b[1])
			items.push(...hits.slice(0, 24).map((h) => h[2]))
			if (!items.length) crumb.textContent = 'Nothing on this screen matches.'
		} else {
			const depth = browse === null ? 0 : browse.split('/').length
			const here = [...folders].filter(
				([path]) =>
					path.split('/').length === depth + 1 &&
					(browse === null || path.startsWith(`${browse}/`)),
			)
			if (browse === null) crumb.textContent = 'On this screen. Click a folder to look inside.'
			else {
				crumb.innerHTML = '<button class="desk-back">‹ back</button> '
				crumb.firstChild.onclick = () => {
					browse = browse.includes('/') ? browse.slice(0, browse.lastIndexOf('/')) : null
					renderIndex()
				}
				const all = document.createElement('button')
				all.className = 'desk-pinall'
				all.textContent = `pin all of ${browse} (${folders.get(browse)})`
				all.onclick = () => pin(browse)
				crumb.append(all)
			}
			for (const [path, n] of here) {
				const deeper = [...folders.keys()].some((p) => p.startsWith(`${path}/`))
				const name = path.split('/').at(-1)
				items.push(
					chip(path, `${name} · ${n}`, () => {
						if (deeper) {
							browse = path
							renderIndex()
						} else pin(path)
					}),
				)
			}
			// Leaves in a folder that also has subfolders are pinned one by one.
			if (browse !== null)
				for (const c of controllers) {
					const key = pathOf(c)
					const kind = kindOf(c)
					if (kind && key.slice(0, key.lastIndexOf('/')) === browse)
						items.push(chip(key, c._name, () => pin(key), kind))
				}
			const actions = controllers.filter((c) => typeof c.getValue() === 'function')
			if (browse === null && actions.length) {
				const h = document.createElement('p')
				h.className = 'desk-crumb'
				h.textContent = 'Actions'
				items.push(h)
				for (const c of actions) {
					const folder = pathOf(c).split('/').slice(0, -1).join(' / ')
					const b = chip(pathOf(c), c._name, () => c.getValue().call(c.object), null, folder)
					b.classList.add('desk-action')
					items.push(b)
				}
			}
		}
		index.replaceChildren(crumb, ...items)
	}

	function chip(key, label, onclick, kind, where) {
		const b = document.createElement('button')
		b.className = 'desk-pick'
		b.title = key
		if (kind) b.dataset.kind = kind
		b.textContent = label
		if (where) b.append(Object.assign(document.createElement('small'), { textContent: where }))
		b.onclick = onclick
		return b
	}

	function rebuild() {
		const found = matches()
		root.hidden = !shown
		gui.show(shown && !!state.panel)
		renderIndex()
		chips.replaceChildren(
			...state.queries.map((q) => {
				const chip = document.createElement('button')
				chip.className = 'desk-chip'
				chip.textContent = q
				chip.title = 'unpin'
				chip.onclick = () => unpin(q)
				return chip
			}),
		)
		const keys = found.map((f) => f.key).join('|')
		if (keys === shownKeys) return
		shownKeys = keys
		modules = found.slice(0, MAX).map(({ key, c }) => instrument(key, c, kindOf(c), changed))
		const groups = new Map()
		for (const m of modules) {
			const folder = m.key.split('/').slice(0, -1).join(' / ') || 'engine'
			if (!groups.has(folder)) groups.set(folder, [])
			groups.get(folder).push(m.el)
		}
		board.replaceChildren(
			...[...groups].map(([title, els]) => {
				const group = document.createElement('section')
				group.innerHTML = `<h3></h3><div class="desk-grid"></div>`
				group.firstChild.textContent = title
				group.lastChild.append(...els)
				return group
			}),
		)
		note.textContent =
			found.length > MAX
				? `${found.length - MAX} more match; narrow the pin.`
				: found.length
					? ''
					: state.queries.length
						? 'Nothing registered matches yet. Values appear when their screen loads.'
						: ''
	}

	function changed(key, c) {
		if (c.getValue() === c.initialValue) delete state.values[key]
		else state.values[key] = c.getValue()
		save()
	}

	function pin(query) {
		if (!query || state.queries.includes(query)) return
		state.queries.push(query)
		browse = null
		find.value = ''
		save()
		rebuild()
	}

	function unpin(query) {
		state.queries = state.queries.filter((q) => q !== query)
		save()
		rebuild()
	}

	function collectChanges() {
		const found = new Map()
		for (const c of gui.controllersRecursive()) {
			const key = pathOf(c)
			if (!(key in state.values)) continue
			const to = c.getValue()
			if (to === c.initialValue) continue
			found.set(key, { key, property: c.property, folder: folderOf(key), from: c.initialValue, to })
		}
		for (const [key, to] of Object.entries(state.values)) {
			if (found.has(key)) continue
			found.set(key, {
				key,
				property: key.split('/').at(-1),
				folder: folderOf(key),
				from: undefined,
				to,
			})
		}
		return [...found.values()]
	}

	root.querySelector('.desk-head').addEventListener('click', async (e) => {
		const act = e.target.dataset?.act
		if (act === 'copy') {
			const text = JSON.stringify(state.values, null, '\t')
			await navigator.clipboard?.writeText(text).catch(() => {})
			console.info('[desk]', text)
			e.target.textContent = Object.keys(state.values).length ? 'copied' : 'no changes'
			setTimeout(() => (e.target.textContent = 'copy'), 1200)
		}
		if (act === 'share') {
			const changes = collectChanges()
			if (!changes.length) {
				e.target.textContent = 'no changes'
				setTimeout(() => (e.target.textContent = 'share'), 1200)
				return
			}
			const hero = new URLSearchParams(location.search).get('hero')
			const { url, omittedJson, json } = shareIssue({ changes, values: state.values, hero })
			await navigator.clipboard?.writeText(json).catch(() => {})
			console.info('[desk]', url)
			const opened = window.open(url, '_blank', 'noopener,noreferrer')
			if (!opened) {
				await navigator.clipboard?.writeText(url).catch(() => {})
				e.target.textContent = 'link copied'
				note.textContent = omittedJson
					? 'Pop-up blocked, so the issue link is on the clipboard. Paste the JSON from copy into the issue.'
					: 'Pop-up blocked, so the issue link is on the clipboard.'
			} else {
				e.target.textContent = omittedJson ? 'paste the JSON' : 'opened'
				note.textContent = omittedJson
					? "GitHub's link was too long, so paste the JSON you just copied into the issue."
					: ''
			}
			setTimeout(() => (e.target.textContent = 'share'), 2000)
		}
		if (act === 'reset') {
			for (const c of gui.controllersRecursive()) if (pathOf(c) in state.values) c.reset()
			state.values = {}
			save()
		}
		if (act === 'panel') {
			state.panel = !state.panel
			save()
			rebuild()
		}
	})
	dragHeader(root, (at) => {
		state.at = at
		save()
	})

	let frame = 0
	function tick(now) {
		frame = requestAnimationFrame(tick)
		if (root.hidden) return
		for (const m of modules) m.draw(now)
	}
	frame = requestAnimationFrame(tick)

	let pending = false
	return {
		pin,
		// Backquote hides the desk along with the panel; pins and values stay.
		show(on) {
			shown = on
			rebuild()
		},
		// Registrations come in bursts as a screen loads: rebuild once per frame.
		refresh() {
			if (pending) return
			pending = true
			requestAnimationFrame(() => {
				pending = false
				rebuild()
			})
		},
		dispose() {
			cancelAnimationFrame(frame)
			root.remove()
		},
	}
}

function dragHeader(root, done) {
	const head = root.querySelector('.desk-head')
	head.addEventListener('pointerdown', (e) => {
		if (e.target.closest('button, input')) return
		const box = root.getBoundingClientRect()
		const dx = e.clientX - box.left
		const dy = e.clientY - box.top
		head.setPointerCapture(e.pointerId)
		const move = (m) => {
			root.style.left = `${Math.max(0, m.clientX - dx)}px`
			root.style.top = `${Math.max(0, m.clientY - dy)}px`
		}
		head.addEventListener('pointermove', move)
		head.addEventListener(
			'pointerup',
			() => {
				head.removeEventListener('pointermove', move)
				done([parseFloat(root.style.left), parseFloat(root.style.top)])
			},
			{ once: true },
		)
	})
}

const svg = (body, box = '0 0 100 60') => `<svg viewBox="${box}" aria-hidden="true">${body}</svg>`
const polar = (cx, cy, r, deg) => [
	cx + r * Math.cos((deg * Math.PI) / 180),
	cy - r * Math.sin((deg * Math.PI) / 180),
]

// One instrument: a face you drag (up or right for more, Shift for fine), a label, and a readout
// you can click to type into (counters too: click the big number). Double-click puts the value back.
function instrument(key, c, kind, changed) {
	if (kind === 'swatch') return swatch(key, c, changed)
	const el = document.createElement('div')
	el.className = 'desk-mod'
	el.dataset.kind = kind
	el.title = `${key}\ndrag · shift for fine · wheel steps · click the number to type · double-click resets`
	const [min, max] = range(c)
	if (typeof c._min === 'number') c._min = min
	if (typeof c._max === 'number') c._max = max
	const stepCandidates = [c._step, units[c.unit]?.step, c.unit === 's' ? 0.05 : null].filter(
		(s) => s > 0,
	)
	const step = stepCandidates.length ? Math.min(...stepCandidates) : (max - min) / 200
	const log = kind === 'tone' && min > 0
	const toFrac = (v) =>
		log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min || 1)
	const fromFrac = (f) => (log ? min * (max / min) ** f : min + f * (max - min))
	const snap = (v) => {
		const s = Math.round((v - min) / step) * step + min
		return Math.min(max, Math.max(min, +s.toFixed(6)))
	}
	const set = (v) => {
		c.setValue(typeof v === 'boolean' ? v : snap(v))
		changed(key, c)
	}
	const radians = c.unit === 'rad'
	const unit = units[c.unit]?.suffix ?? ' ?'
	const decimals = Math.max(0, Math.min(4, -Math.floor(Math.log10(step) + 1e-9)))
	const show = (v) =>
		typeof v === 'boolean'
			? `${v ? 'on' : 'off'}${units[c.unit] ? '' : ' ?'}`
			: `${+v.toFixed(decimals)}${unit}`

	el.innerHTML = `<div class="desk-face">${FACES[kind]?.(max) ?? ''}</div>
		<label>${c._name}</label><output></output>`
	const face = el.querySelector('.desk-face')
	const out = el.querySelector('output')
	const part = (s) => face.querySelector(s)
	const draw = DRAW[kind](part, { min, max, toFrac, radians, seconds: c.unit === 'ms' ? 0.001 : 1 })

	const typeValue = () => {
		if (typeof c.getValue() === 'boolean') return
		const typed = prompt(`${key}`, c.getValue())
		if (typed !== null && Number.isFinite(+typed)) set(+typed)
	}
	if (typeof c.getValue() === 'boolean') face.addEventListener('click', () => set(!c.getValue()))
	else {
		if (kind !== 'counter')
			face.addEventListener('pointerdown', (e) => {
				if (e.target.closest('button')) return
				face.setPointerCapture(e.pointerId)
				let f = toFrac(c.getValue())
				let last = [e.clientX, e.clientY]
				const span = kind === 'clock' ? Math.max(80, face.clientWidth) : 220
				const move = (m) => {
					const fine = m.shiftKey ? 0.1 : 1
					if (kind === 'clock') f += ((m.clientX - last[0]) / span) * fine
					else f += ((m.clientX - last[0] - (m.clientY - last[1])) / span) * fine
					f = Math.min(1, Math.max(0, f))
					last = [m.clientX, m.clientY]
					set(fromFrac(f))
				}
				face.addEventListener('pointermove', move)
				face.addEventListener(
					'pointerup',
					() => {
						face.removeEventListener('pointermove', move)
						if (kind === 'tone') blip(c.getValue())
					},
					{ once: true },
				)
			})
		face.addEventListener('wheel', (e) => {
			e.preventDefault()
			set(c.getValue() + (e.deltaY < 0 ? step : -step))
		})
		face.addEventListener('click', (e) => {
			const by = e.target.closest('button')?.dataset.by
			if (by) set(c.getValue() + +by * step)
			if (kind === 'tone' && e.detail === 1 && !by) blip(c.getValue())
		})
	}
	el.addEventListener('dblclick', () => {
		c.reset()
		changed(key, c)
	})
	out.addEventListener('click', typeValue)
	el.querySelector('.counter-num')?.addEventListener('click', (e) => {
		e.stopPropagation()
		typeValue()
	})

	let seen
	return {
		key,
		el,
		draw(now) {
			const v = c.getValue()
			if (v === seen && kind !== 'clock' && kind !== 'tone') return
			draw(v, now)
			if (v === seen) return
			seen = v
			out.textContent = show(v)
			el.classList.toggle('is-changed', v !== c.initialValue)
		},
	}
}

// A colour: click for the picker, drag across for hue and up for lightness (Shift for fine).
// Values keep the controller's own format, a 0xrrggbb number or a '#rrggbb' string.
function swatch(key, c, changed) {
	const el = document.createElement('div')
	el.className = 'desk-mod'
	el.dataset.kind = 'swatch'
	el.title = `${key}\nclick picks · drag across for hue, up for lightness · shift for fine · double-click resets`
	el.innerHTML = `<div class="desk-face"><i class="swatch"></i><input type="color" tabindex="-1"></div>
		<label></label><output></output>`
	el.querySelector('label').textContent = c._name
	const face = el.querySelector('.desk-face')
	const chip = el.querySelector('.swatch')
	const picker = el.querySelector('input')
	const out = el.querySelector('output')
	const hexOf = (v) => c._format.toHexString(v)
	const set = (hex) => {
		c.setValue(c._format.fromHexString(hex))
		changed(key, c)
	}
	picker.addEventListener('input', () => set(picker.value))
	face.addEventListener('pointerdown', (e) => {
		face.setPointerCapture(e.pointerId)
		const [h, s, l] = toHsl(hexOf(c.getValue()))
		let hue = h,
			light = l,
			moved = false
		let last = [e.clientX, e.clientY]
		const move = (m) => {
			const fine = m.shiftKey ? 0.1 : 1
			const dx = m.clientX - last[0],
				dy = m.clientY - last[1]
			last = [m.clientX, m.clientY]
			moved ||= Math.abs(m.clientX - e.clientX) + Math.abs(m.clientY - e.clientY) > 3
			if (!moved) return
			hue = (hue + (dx / 360) * fine + 1) % 1
			light = clamp01(light - (dy / 300) * fine)
			set(fromHsl(hue, s, light))
		}
		face.addEventListener('pointermove', move)
		face.addEventListener(
			'pointerup',
			() => {
				face.removeEventListener('pointermove', move)
				if (!moved) picker.click()
			},
			{ once: true },
		)
	})
	el.addEventListener('dblclick', () => {
		c.reset()
		changed(key, c)
	})
	out.addEventListener('click', () => {
		const typed = prompt(`${key}`, hexOf(c.getValue()))
		if (typed && /^#?[0-9a-f]{6}$/i.test(typed.trim())) set(`#${typed.trim().replace('#', '')}`)
	})

	let seen
	return {
		key,
		el,
		draw() {
			const v = c.getValue()
			if (v === seen) return
			seen = v
			const hex = hexOf(v)
			chip.style.background = hex
			picker.value = hex
			out.textContent = hex
			el.classList.toggle('is-changed', v !== c.initialValue)
		},
	}
}

function toHsl(hex) {
	const n = parseInt(hex.slice(1), 16)
	const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((x) => x / 255)
	const max = Math.max(r, g, b),
		min = Math.min(r, g, b),
		l = (max + min) / 2,
		d = max - min
	if (!d) return [0, 0, l]
	const s = d / (1 - Math.abs(2 * l - 1))
	const h =
		max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
	return [h / 6, s, l]
}

function fromHsl(h, s, l) {
	const k = (n) => (n + h * 12) % 12
	const a = s * Math.min(l, 1 - l)
	const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
	return `#${[f(0), f(8), f(4)]
		.map((x) =>
			Math.round(x * 255)
				.toString(16)
				.padStart(2, '0'),
		)
		.join('')}`
}

const ARC = (r, a0, a1, cx = 50, cy = 54) => {
	const [x0, y0] = polar(cx, cy, r, a0)
	const [x1, y1] = polar(cx, cy, r, a1)
	return `M${x0} ${y0} A${r} ${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} 1 ${x1} ${y1}`
}

const FACES = {
	clock: (max) =>
		`<div class="clock-track" style="--tick:${(max >= 3 ? 1 : 0.1) / max}"><i class="clock-fill"></i><i class="clock-head"></i></div>`,
	gauge: () =>
		svg(`<path class="track" d="${ARC(40, 180, 0)}"/><path class="lit" pathLength="1" d="${ARC(40, 180, 0)}"/>
			${Array.from({ length: 11 }, (_, i) => {
				const [x0, y0] = polar(50, 54, 44, 180 - i * 18)
				const [x1, y1] = polar(50, 54, i % 5 ? 47 : 50, 180 - i * 18)
				return `<line class="tick" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}"/>`
			}).join('')}
			<line class="needle" x1="50" y1="54" x2="50" y2="20"/><circle class="hub" cx="50" cy="54" r="4"/>`),
	mast: () => `<div class="mast"><i class="mast-pole"></i><i class="mast-peg"></i></div>`,
	fan: () => svg(`<line class="track" x1="8" y1="54" x2="92" y2="54"/><path class="wedge"/>`),
	ring: () =>
		svg(
			`<circle class="track" cx="50" cy="50" r="44"/><line class="track" x1="50" y1="2" x2="50" y2="98"/><line class="track" x1="2" y1="50" x2="98" y2="50"/><circle class="disc" cx="50" cy="50"/>`,
			'0 0 100 100',
		),
	meter: () => `<div class="meter">${'<i></i>'.repeat(12)}</div>`,
	tone: () => svg(`<path class="track" d="M4 30 H96"/><path class="wave"/>`, '0 0 100 60'),
	counter: () =>
		`<button data-by="-1">−</button><b class="counter-num"></b><button data-by="1">+</button>`,
	switch: () => `<div class="switch"><i></i></div>`,
	knob: () =>
		svg(
			`<path class="track" d="${ARC(36, 225, -45, 50, 50)}"/><path class="lit" pathLength="1" d="${ARC(36, 225, -45, 50, 50)}"/><circle class="cap" cx="50" cy="50" r="26"/><line class="needle" x1="50" y1="50" x2="50" y2="28"/>`,
			'0 0 100 100',
		),
}

const clamp01 = (f) => Math.min(1, Math.max(0, f))

// Each draw gets the value and the frame time; only the clock and the tone move on their own.
const DRAW = {
	clock: (part, { max, seconds }) => {
		const fill = part('.clock-fill')
		const head = part('.clock-head')
		return (v, now) => {
			fill.style.width = `${clamp01(v / max) * 100}%`
			head.style.left = v > 0 ? `${(((now / (1000 * seconds)) % v) / max) * 100}%` : '0'
		}
	},
	gauge: (part, { toFrac }) => {
		const needle = part('.needle')
		const lit = part('.lit')
		return (v) => {
			const f = clamp01(toFrac(v))
			needle.setAttribute('transform', `rotate(${-90 + f * 180} 50 54)`)
			lit.style.strokeDasharray = `${f} 1`
		}
	},
	mast: (part, { toFrac }) => {
		const pole = part('.mast-pole')
		const peg = part('.mast-peg')
		return (v) => {
			const f = clamp01(toFrac(v))
			pole.style.height = `${f * 100}%`
			peg.style.bottom = `${f * 100}%`
		}
	},
	fan: (part, { radians }) => {
		const wedge = part('.wedge')
		return (v) => {
			const a = Math.min(179.9, Math.max(0, radians ? (v * 180) / Math.PI : v))
			const [x, y] = polar(50, 54, 42, a)
			wedge.setAttribute('d', `M50 54 L92 54 A42 42 0 0 0 ${x} ${y} Z`)
		}
	},
	ring: (part, { toFrac }) => {
		const disc = part('.disc')
		return (v) => disc.setAttribute('r', 2 + clamp01(toFrac(v)) * 42)
	},
	meter: (part, { toFrac }) => {
		const leds = [...part('.meter').children].reverse()
		return (v) => {
			const lit = Math.round(clamp01(toFrac(v)) * leds.length)
			leds.forEach((led, i) => led.classList.toggle('on', i < lit))
		}
	},
	tone: (part, { toFrac }) => {
		const wave = part('.wave')
		return (v, now) => {
			const cycles = 1 + clamp01(toFrac(v)) * 9
			const shift = (now / 900) % 1
			let d = ''
			for (let x = 0; x <= 92; x += 1) {
				const y = 30 - 20 * Math.sin(((x / 92) * cycles + shift) * Math.PI * 2)
				d += `${x ? 'L' : 'M'}${x + 4} ${y.toFixed(1)}`
			}
			wave.setAttribute('d', d)
		}
	},
	counter: (part) => {
		const num = part('.counter-num')
		return (v) => (num.textContent = v)
	},
	switch: (part) => {
		const sw = part('.switch')
		return (v) => sw.classList.toggle('on', v)
	},
	knob: (part, { toFrac }) => {
		const needle = part('.needle')
		const lit = part('.lit')
		return (v) => {
			const f = clamp01(toFrac(v))
			needle.setAttribute('transform', `rotate(${-135 + f * 270} 50 50)`)
			lit.style.strokeDasharray = `${f} 1`
		}
	},
}

let audio
function blip(hz) {
	if (!(hz > 20 && hz < 20000)) return
	audio ??= new AudioContext()
	const osc = audio.createOscillator()
	const gain = audio.createGain()
	osc.frequency.value = hz
	gain.gain.setValueAtTime(0.06, audio.currentTime)
	gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.18)
	osc.connect(gain).connect(audio.destination)
	osc.start()
	osc.stop(audio.currentTime + 0.2)
}
