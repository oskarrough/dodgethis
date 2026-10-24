// The Tuner ("Tune" on screen): live numbers you can try while playing. Backquote (` / the key above Tab) opens it;
// it opens on the screen's featured values, lists what else it can tune (folders to open, values to
// find, actions to run) and pins values as rows whose input fits the unit: a strip with a looping
// playhead for a duration, a speedometer for a speed, a fan for an angle, − and + for a count,
// a switch, a few choices side by side. ?knobs=lob,fog pins from the address. "copy" puts changed values
// on the clipboard as JSON; "share" opens a GitHub issue so a maintainer can make them the default.
// Values come from the registry: every tune value, plus hand-made controls (src/core/registry.js).
import './tuner.css'
import { folderOf, shareIssue } from './tuner-share.js'
import { units } from './units.js'

const STORE = 'dt-tuner'
const OLD_STORE = 'dt-desk' // pins and values saved before the desk was renamed
const MAX = 36

function kindOf(c) {
	if (c.unit === 'color') return 'swatch'
	if (c.choices) return 'choice'
	if (c.readonly && typeof c.getValue() === 'string') return 'readout'
	if (!['number', 'boolean'].includes(typeof c.getValue())) return null
	return units[c.unit]?.instrument ?? 'knob'
}

function range(c) {
	const v = typeof c.initialValue === 'number' ? c.initialValue : 0
	const defaults = units[c.unit]?.range ?? c.guess
	const min = Math.min(c.min ?? defaults?.[0] ?? 0, defaults?.[0] ?? v, v)
	const max = Math.max(c.max ?? defaults?.[1] ?? 1, defaults?.[1] ?? v, v)
	return [min, max]
}

function read() {
	try {
		return {
			queries: [],
			values: {},
			...JSON.parse(localStorage.getItem(STORE) ?? localStorage.getItem(OLD_STORE)),
		}
	} catch {
		return { queries: [], values: {} }
	}
}

// `source.entries()` lists every value and action on this screen.
export function createTuner(source) {
	const state = read()
	const fromUrl = new URLSearchParams(location.search).get('knobs')
	if (fromUrl)
		for (const q of fromUrl.split(',')) if (q && !state.queries.includes(q)) state.queries.push(q)
	const save = () => localStorage.setItem(STORE, JSON.stringify(state))

	const root = document.createElement('section')
	root.className = 'tuner'
	root.dataset.quiet = '' // a tuning tool, not the game
	root.hidden = true
	root.innerHTML = `<header class="tuner-head"><b title="drag to move · press \` to hide">debug · tune</b>
		<input class="tuner-find" type="search" placeholder="find any value: lob, speed, fog…" /></header>
		<div class="tuner-chips"></div><nav class="tuner-index"></nav><div class="tuner-board"></div>
		<p class="tuner-note"></p><footer class="tuner-foot">
		<button data-act="reset" title="put every changed value back">reset all</button>
		<button data-act="copy" title="copy changed values as JSON, to paste into a GitHub issue">copy</button>
		<button data-act="share" title="open a GitHub issue with what you changed">share</button>
		<small>\` hides</small></footer>`
	document.body.append(root)
	const chips = root.querySelector('.tuner-chips')
	const find = root.querySelector('.tuner-find')
	const index = root.querySelector('.tuner-index')
	find.addEventListener('input', () => renderIndex())
	find.addEventListener('focus', () => renderIndex())
	// Leaving the field folds the index away, after a click on one of its chips has landed.
	find.addEventListener('blur', () => setTimeout(renderIndex, 150))
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
	const board = root.querySelector('.tuner-board')
	const note = root.querySelector('.tuner-note')
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
		for (const c of source.entries()) {
			const key = c.path
			if (!restored.has(key) && key in state.values) {
				restored.add(key)
				if (c.getValue() !== state.values[key]) c.setValue(state.values[key])
			}
			const hay = `${key} ${c.label}`.toLowerCase()
			if (qs.some((q) => hay.includes(q)) && kindOf(c)) found.push({ key, c })
		}
		return found
	}

	// The index answers "what can I tune here?": with nothing typed it lists this screen's folders
	// (click to open one, or pin it whole) and its actions; typing lists matching folders and values.
	function renderIndex() {
		const query = find.value.trim().toLowerCase()
		const open =
			query ||
			browse !== null ||
			document.activeElement === find ||
			(!state.queries.length && !source.featured?.().length)
		index.hidden = !open
		if (!open) return
		const controllers = source.entries()
		const folders = new Map()
		for (const c of controllers) {
			if (!kindOf(c)) continue
			const parts = c.path.split('/').slice(0, -1)
			for (let i = 1; i <= parts.length; i++) {
				const path = parts.slice(0, i).join('/')
				folders.set(path, (folders.get(path) ?? 0) + 1)
			}
		}
		const items = []
		const crumb = document.createElement('p')
		crumb.className = 'tuner-crumb'
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
				const key = c.path
				const kind = kindOf(c)
				const rank = kind ? Math.min(score(c.label), score(key) + 1) : 3
				if (rank < 3)
					hits.push([
						rank,
						1,
						chip(key, c.label, () => pin(key), kind, key.split('/').slice(0, -1).join(' / ')),
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
				crumb.innerHTML = '<button class="tuner-back">‹ back</button> '
				crumb.firstChild.onclick = () => {
					browse = browse.includes('/') ? browse.slice(0, browse.lastIndexOf('/')) : null
					renderIndex()
				}
				const all = document.createElement('button')
				all.className = 'tuner-pinall'
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
					const key = c.path
					const kind = kindOf(c)
					if (kind && key.slice(0, key.lastIndexOf('/')) === browse)
						items.push(chip(key, c.label, () => pin(key), kind))
				}
			const actions = controllers.filter((c) => c.run)
			if (browse === null && actions.length) {
				const h = document.createElement('p')
				h.className = 'tuner-crumb'
				h.textContent = 'Actions'
				items.push(h)
				for (const c of actions) {
					const folder = c.path.split('/').slice(0, -1).join(' / ')
					const b = chip(c.path, c.label, () => c.run(), null, folder)
					b.classList.add('tuner-action')
					items.push(b)
				}
			}
		}
		index.replaceChildren(crumb, ...items)
	}

	function chip(key, label, onclick, kind, where) {
		const b = document.createElement('button')
		b.className = 'tuner-pick'
		b.title = key
		if (kind) b.dataset.kind = kind
		b.textContent = label
		if (where) b.append(Object.assign(document.createElement('small'), { textContent: where }))
		b.onclick = onclick
		return b
	}

	// With nothing pinned the board shows the screen's featured values, in players' words.
	function rebuild() {
		const pinned = matches()
		const featured = state.queries.length ? [] : (source.featured?.() ?? [])
		const found = pinned.length ? pinned : featured.map((c) => ({ key: c.path, c, featured: true }))
		root.hidden = !shown
		renderIndex()
		chips.replaceChildren(
			...state.queries.map((q) => {
				const chip = document.createElement('button')
				chip.className = 'tuner-chip'
				chip.textContent = q
				chip.title = 'unpin'
				chip.onclick = () => unpin(q)
				return chip
			}),
		)
		const keys = found.map((f) => f.key).join('|')
		if (keys === shownKeys) return
		shownKeys = keys
		modules = found.slice(0, MAX).map(({ key, c }) => row(key, c, kindOf(c), changed))
		const groups = new Map()
		for (const [i, m] of modules.entries()) {
			const c = found[i].c
			const title = found[i].featured
				? (c.group ?? c.path.split('/').slice(-2, -1)[0] ?? '')
				: m.key.split('/').slice(0, -1).join(' / ') || 'engine'
			if (!groups.has(title)) groups.set(title, [])
			groups.get(title).push(m.el)
		}
		board.replaceChildren(
			...[...groups].map(([title, els]) => {
				const group = document.createElement('section')
				group.innerHTML = `<h3></h3>`
				group.firstChild.textContent = title
				group.append(...els)
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
		for (const c of source.entries()) {
			const key = c.path
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

	root.querySelector('.tuner-foot').addEventListener('click', async (e) => {
		const act = e.target.dataset?.act
		if (act === 'copy') {
			const text = JSON.stringify(state.values, null, '\t')
			await navigator.clipboard?.writeText(text).catch(() => {})
			console.info('[tuner]', text)
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
			if (omittedJson) await navigator.clipboard?.writeText(json).catch(() => {})
			console.info('[tuner]', url)
			// An <a> click (not window.open) keeps this a user gesture; noopener would make open() look blocked.
			const a = Object.assign(document.createElement('a'), {
				href: url,
				target: '_blank',
				rel: 'noopener noreferrer',
				hidden: true,
			})
			document.body.append(a)
			a.click()
			a.remove()
			e.target.textContent = omittedJson ? 'paste the JSON' : 'opened'
			note.textContent = omittedJson
				? "GitHub's link was too long, so paste the JSON you just copied into the issue."
				: ''
			setTimeout(() => (e.target.textContent = 'share'), 2000)
		}
		if (act === 'reset') {
			for (const c of source.entries()) if (c.path in state.values) c.reset()
			state.values = {}
			save()
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
		// Backquote hides the Tuner; pins and values stay.
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
		setInert(inert) {
			root.inert = inert
		},
		dispose() {
			cancelAnimationFrame(frame)
			root.remove()
		},
	}
}

function dragHeader(root, done) {
	const head = root.querySelector('.tuner-head')
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
const clamp01 = (f) => Math.min(1, Math.max(0, f))

// The tooltip's first lines: where the value lives, its note, and when a change shows.
const about = (key, c) =>
	[key, c.hint, c.when && `applies ${c.when === 'restart' ? 'on restart' : `on ${c.when}`}`]
		.filter(Boolean)
		.join('\n') + '\n'

const HOW = {
	switch: 'click to flip',
	choice: 'click one',
	counter: '− and + step · wheel steps',
	swatch: 'click to pick a colour',
	readout: 'the game keeps this up to date',
}

// A number's range, step and readout, shared by every input that holds one.
function numeric(c, kind) {
	const [min, max] = range(c)
	const steps = [c.step, units[c.unit]?.step, c.unit === 's' ? 0.05 : null].filter((s) => s > 0)
	const step = steps.length ? Math.min(...steps) : (max - min) / 200
	const log = kind === 'tone' && min > 0
	const toFrac = (v) =>
		clamp01(log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min || 1))
	const fromFrac = (f) => (log ? min * (max / min) ** f : min + f * (max - min))
	const snap = (v) => {
		const s = Math.round((v - min) / step) * step + min
		return Math.min(max, Math.max(min, +s.toFixed(6)))
	}
	const suffix = units[c.unit]?.suffix ?? ''
	const decimals = Math.max(0, Math.min(4, -Math.floor(Math.log10(step) + 1e-9)))
	const show = (v) => `${+v.toFixed(decimals)}${suffix}`
	return { min, max, step, toFrac, fromFrac, snap, show }
}

// One row: a label, the input its unit affords, a readout you can click to type into, and ↺ once
// it differs from the default. Double-clicking the label also puts it back.
function row(key, c, kind, changed) {
	const el = document.createElement('div')
	el.className = 'tuner-row'
	el.dataset.kind = kind
	el.innerHTML = `<label></label><div class="tuner-input"></div><output></output>
		<button class="tuner-reset" title="back to the default">↺</button>`
	el.querySelector('label').textContent = c.label
	const out = el.querySelector('output')
	const holder = el.querySelector('.tuner-input')
	const isNumber = typeof c.getValue() === 'number' && kind !== 'swatch'
	const n = isNumber ? numeric(c, kind) : null
	const set = (v) => {
		c.setValue(n ? n.snap(v) : v)
		changed(key, c)
	}
	const input = (INPUTS[kind] ?? INPUTS.bar)(holder, { c, n, set, kind })
	el.title = `${about(key, c)}${HOW[kind] ?? 'drag the bar · shift for fine · wheel steps'} · click the number to type`
	const back = () => {
		c.reset()
		changed(key, c)
	}
	el.querySelector('.tuner-reset').addEventListener('click', back)
	el.querySelector('label').addEventListener('dblclick', back)
	if (isNumber || kind === 'swatch')
		out.addEventListener('click', () =>
			typeInto(out, c, (typed) => {
				if (kind === 'swatch') {
					if (/^#?[0-9a-f]{6}$/i.test(typed))
						set(c.format.fromHexString(`#${typed.replace('#', '')}`))
				} else if (Number.isFinite(+typed) && typed !== '') set(+typed)
			}),
		)
	if (n)
		holder.addEventListener('wheel', (e) => {
			e.preventDefault()
			set(c.getValue() + (e.deltaY < 0 ? n.step : -n.step))
		})

	let seen
	return {
		key,
		el,
		draw(now) {
			const v = c.getValue()
			if (v === seen && !input.moves) return
			input.draw(v, now)
			if (v === seen) return
			seen = v
			if (kind === 'swatch') out.textContent = c.format.toHexString(v)
			else if (n) out.textContent = n.show(v)
			el.classList.toggle('is-changed', kind !== 'readout' && v !== c.initialValue)
		},
	}
}

// Click a readout and it becomes a text field: Enter keeps what you typed, Escape or leaving drops it.
function typeInto(out, c, commit) {
	if (out.querySelector('input')) return
	const field = Object.assign(document.createElement('input'), {
		value: c.format ? c.format.toHexString(c.getValue()) : c.getValue(),
	})
	const shown = out.textContent
	out.replaceChildren(field)
	field.focus()
	field.select()
	let done = false
	const finish = (keep) => {
		if (done) return
		done = true
		out.textContent = shown
		if (keep) commit(field.value.trim())
	}
	field.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') finish(true)
		if (e.key === 'Escape') finish(false)
	})
	field.addEventListener('blur', () => finish(false))
}

// A bar you press anywhere on: the value jumps there and follows the pointer. Shift moves it finely.
function bar(holder, { c, n, set, kind }, extra = '') {
	holder.insertAdjacentHTML('beforeend', `${extra}<div class="tuner-bar"><i></i></div>`)
	const track = holder.querySelector('.tuner-bar')
	const fill = track.firstChild
	track.addEventListener('pointerdown', (e) => {
		track.setPointerCapture(e.pointerId)
		const box = track.getBoundingClientRect()
		let f = clamp01((e.clientX - box.left) / box.width)
		let last = e.clientX
		if (!e.shiftKey) set(n.fromFrac(f))
		else f = n.toFrac(c.getValue())
		const move = (m) => {
			f = m.shiftKey
				? clamp01(f + ((m.clientX - last) / box.width) * 0.1)
				: clamp01((m.clientX - box.left) / box.width)
			last = m.clientX
			set(n.fromFrac(f))
		}
		track.addEventListener('pointermove', move)
		track.addEventListener(
			'pointerup',
			() => {
				track.removeEventListener('pointermove', move)
				if (kind === 'tone') blip(c.getValue())
			},
			{ once: true },
		)
	})
	return (v) => (fill.style.width = `${n.toFrac(v) * 100}%`)
}

// Each input fills the row's middle and returns { draw(value, now), moves? }.
const INPUTS = {
	bar: (holder, ctx) => ({ draw: bar(holder, ctx) }),
	// A speed: a small speedometer beside the bar.
	gauge(holder, ctx) {
		const drawBar = bar(
			holder,
			ctx,
			svg(
				`<path class="track" d="M10 55 A40 40 0 0 1 90 55"/><line class="needle" x1="50" y1="55" x2="50" y2="19"/>`,
			),
		)
		const needle = holder.querySelector('.needle')
		return {
			draw(v) {
				drawBar(v)
				needle.setAttribute('transform', `rotate(${-90 + ctx.n.toFrac(v) * 180} 50 55)`)
			},
		}
	},
	// An angle: a fan opened that far.
	fan(holder, ctx) {
		const drawBar = bar(
			holder,
			ctx,
			svg(`<path class="track" d="M8 56 H92"/><path class="wedge"/>`),
		)
		const wedge = holder.querySelector('.wedge')
		const radians = ctx.c.unit === 'rad'
		return {
			draw(v) {
				drawBar(v)
				const a = Math.min(179.9, Math.max(0, radians ? (v * 180) / Math.PI : v))
				const [x, y] = polar(50, 56, 44, a)
				wedge.setAttribute('d', `M50 56 L94 56 A44 44 0 0 0 ${x} ${y} Z`)
			},
		}
	},
	// A duration: a strip whose playhead loops at that length, so 0.065 s reads as a blink.
	clock(holder, ctx) {
		const drawBar = bar(holder, ctx)
		const head = Object.assign(document.createElement('b'), { className: 'tuner-head-mark' })
		holder.querySelector('.tuner-bar').append(head)
		const seconds = ctx.c.unit === 'ms' ? 0.001 : 1
		return {
			moves: true,
			draw(v, now) {
				drawBar(v)
				const span = ctx.n.max || 1
				head.style.left = v > 0 ? `${(((now / (1000 * seconds)) % v) / span) * 100}%` : '0'
			},
		}
	},
	// A count: − and +.
	counter(holder, { c, n, set }) {
		holder.innerHTML = `<button data-by="-1">−</button><button data-by="1">+</button><small></small>`
		holder.querySelector('small').textContent = n.step === 1 ? '' : `steps of ${n.step}`
		holder.addEventListener('click', (e) => {
			const by = e.target.closest('button')?.dataset.by
			if (by) set(c.getValue() + +by * n.step)
		})
		return { draw() {} }
	},
	switch(holder, { c, set }) {
		holder.innerHTML = `<button class="tuner-switch" aria-label="on or off"><i></i></button>`
		const sw = holder.firstChild
		sw.addEventListener('click', () => set(!c.getValue()))
		return { draw: (v) => sw.classList.toggle('on', !!v) }
	},
	// A few named values side by side; a long list falls back to a menu.
	choice(holder, { c, set }) {
		if (c.choices.length <= 5) {
			holder.innerHTML = `<div class="tuner-seg"></div>`
			const seg = holder.firstChild
			for (const [name, value] of c.choices) {
				const b = Object.assign(document.createElement('button'), { textContent: name })
				b.addEventListener('click', () => set(value))
				b.dataset.value = String(value)
				seg.append(b)
			}
			return {
				draw: (v) => {
					for (const b of seg.children) b.classList.toggle('on', b.dataset.value === String(v))
				},
			}
		}
		const select = document.createElement('select')
		for (const [name, value] of c.choices)
			select.append(Object.assign(document.createElement('option'), { textContent: name, value }))
		select.addEventListener('change', () =>
			set(c.choices.find(([, v]) => String(v) === select.value)?.[1]),
		)
		holder.append(select)
		return { draw: (v) => (select.value = String(v)) }
	},
	swatch(holder, { c, set }) {
		holder.innerHTML = `<button class="tuner-swatch"></button><input type="color" tabindex="-1">`
		const chip = holder.firstChild
		const picker = holder.lastChild
		chip.addEventListener('click', () => picker.click())
		picker.addEventListener('input', () => set(c.format.fromHexString(picker.value)))
		return {
			draw(v) {
				const hex = c.format.toHexString(v)
				chip.style.background = hex
				picker.value = hex
			},
		}
	},
	readout(holder) {
		const text = document.createElement('span')
		holder.append(text)
		return { draw: (v) => (text.textContent = String(v ?? '')) }
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
