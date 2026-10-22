// The desk: a small floating board of instruments for the tune values you're working on.
// It reads the debug panel's controllers, so anything registered there can be pinned here:
// press Enter in the panel's filter, or open the page with ?knobs=arrow,fletcher.
// Each value gets an instrument shaped like what it controls: a playhead that runs for a
// duration, a speedometer for speeds, a mast for heights, a fan for angles, a ring for sizes.
// "copy" puts the changed values on the clipboard as JSON to paste back to an agent.
import './desk.css'
import { units } from './units.js'

const STORE = 'dt-desk'
const MAX = 36

function kindOf(c) {
	if (!['number', 'boolean'].includes(typeof c.getValue())) return null
	return units[c.unit]?.instrument ?? 'knob'
}

function range(c) {
	const v = c.initialValue
	const defaults = units[c.unit]?.range
	const min = c._min ?? Math.min(defaults?.[0] ?? 0, v)
	const max = c._max ?? Math.max(defaults?.[1] ?? 1, v)
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
	root.innerHTML = `<header class="desk-head"><b>desk</b><span class="desk-chips"></span>
		<button data-act="copy" title="copy changed values as JSON">copy</button>
		<button data-act="reset" title="put every value back">reset</button>
		<button data-act="close" title="unpin everything">close</button></header>
		<div class="desk-board"></div><p class="desk-note"></p>`
	document.body.append(root)
	const chips = root.querySelector('.desk-chips')
	const board = root.querySelector('.desk-board')
	const note = root.querySelector('.desk-note')
	if (state.at) Object.assign(root.style, { left: `${state.at[0]}px`, top: `${state.at[1]}px` })
	for (const type of ['keydown', 'keyup', 'wheel', 'contextmenu'])
		root.addEventListener(type, (e) => e.stopPropagation())

	let modules = []
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

	function rebuild() {
		const found = matches()
		root.hidden = !state.queries.length
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
					: 'Nothing registered matches yet. Values appear when their screen loads.'
	}

	function changed(key, c) {
		if (c.getValue() === c.initialValue) delete state.values[key]
		else state.values[key] = c.getValue()
		save()
	}

	function pin(query) {
		if (!query || state.queries.includes(query)) return
		state.queries.push(query)
		save()
		rebuild()
	}

	function unpin(query) {
		state.queries = state.queries.filter((q) => q !== query)
		save()
		rebuild()
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
		if (act === 'reset') {
			for (const c of gui.controllersRecursive()) if (pathOf(c) in state.values) c.reset()
			state.values = {}
			save()
		}
		if (act === 'close') {
			state.queries = []
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
		if (e.target.closest('button')) return
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
// you can click to type into. Double-click puts the value back.
function instrument(key, c, kind, changed) {
	const el = document.createElement('div')
	el.className = 'desk-mod'
	el.dataset.kind = kind
	el.title = `${key}\ndrag · shift for fine · wheel steps · double-click resets`
	const [min, max] = range(c)
	const step = c._step ?? units[c.unit]?.step ?? (max - min) / 200
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

	if (typeof c.getValue() === 'boolean') face.addEventListener('click', () => set(!c.getValue()))
	else {
		face.addEventListener('pointerdown', (e) => {
			if (e.target.closest('button')) return
			face.setPointerCapture(e.pointerId)
			let f = toFrac(c.getValue())
			let last = [e.clientX, e.clientY]
			const move = (m) => {
				f += ((m.clientX - last[0] - (m.clientY - last[1])) / 220) * (m.shiftKey ? 0.1 : 1)
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
	out.addEventListener('click', () => {
		if (typeof c.getValue() === 'boolean') return
		const typed = prompt(`${key}`, c.getValue())
		if (typed !== null && Number.isFinite(+typed)) set(+typed)
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
