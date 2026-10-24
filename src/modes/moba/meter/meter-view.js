import './meter.css'
import { el } from '../../../core/dom.js'
import { STEP } from '../../../core/app.js'
import { abilityOf } from '../ability.js'
import { structureName } from '../gates.js'
import { MINION_DEFINITIONS } from '../lane-waves.js'
import { createMeter, MODES, standings } from './meter.js'

// The damage meter (docs/feature-map.md, "Match: HUD"): a small card in the bottom-left corner that
// counts damage done, healing done, damage taken and deaths per hero. Arrows step between the current
// fight, the fights before it (each boss encounter is one) and the whole match. Click a row to see what
// it was made of; M shows and hides the card, and the choice is remembered.
const KEY = 'KeyM'
const STORE = 'dodgethis.meter'
const TITLES = {
	damage: 'Damage done',
	healing: 'Healing done',
	taken: 'Damage taken',
	deaths: 'Deaths',
}
const RATE = { damage: 'dps', healing: 'hps', taken: 'dtps' }

const read = () => {
	try {
		return globalThis.localStorage?.getItem(STORE)
	} catch {
		return null
	}
}
const write = (value) => {
	try {
		globalThis.localStorage?.setItem(STORE, value)
	} catch {
		/* Still toggles for this match. */
	}
}
const short = (n) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : Math.round(n).toLocaleString('en'))
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const titleCase = (word) => word[0].toUpperCase() + word.slice(1)
// An ability id without a display name, as words: gloveSlap → Glove slap.
const spaced = (id) => titleCase(id.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase())

export function createMeterView({ sim, local }) {
	const meter = createMeter({ step: STEP })
	if (typeof document === 'undefined')
		return {
			meter,
			present: (fact) => meter.add(fact, fact.tick ?? sim.tick, describe),
			dispose() {},
		}

	const saved = read()
	const state = {
		shown: saved ? saved === 'on' : true,
		mode: MODES.includes(saved?.split(':')[1]) ? saved.split(':')[1] : 'damage',
		view: 'live', // 'live' follows the open segment; otherwise a segment or the overall
		drill: null,
		dirty: true,
	}

	const root = el('aside', 'moba-tally', document.body)
	root.setAttribute('aria-label', 'Damage meter')
	const head = el('header', '', root)
	const modeButton = el('button', 'meter-mode', head)
	modeButton.type = 'button'
	modeButton.title = 'Next tally (right-click goes back)'
	const reset = el('button', 'meter-reset', head)
	reset.type = 'button'
	reset.textContent = '↺'
	reset.title = 'Clear every fight'
	const nav = el('div', 'meter-nav', head)
	const prev = el('button', 'meter-step', nav)
	prev.type = 'button'
	prev.textContent = '‹'
	prev.title = 'Earlier fight'
	const label = el('span', 'meter-segment', nav)
	const next = el('button', 'meter-step', nav)
	next.type = 'button'
	next.textContent = '›'
	next.title = 'Later fight'
	const list = el('ol', 'meter-rows', root)
	const foot = el('p', 'meter-foot', root)

	function describe(id) {
		const unit = sim.find?.(id) ?? sim.heroes.find((h) => h.id === id)
		const hero = !!unit && sim.heroes.includes(unit)
		const kind = unit?.kind
		// Heroes have no kind; minions, structures and pack enemies do.
		const base = kind
			? Object.hasOwn(MINION_DEFINITIONS, kind)
				? `${titleCase(kind)} minion`
				: (unit.definition?.name ?? titleCase(structureName(kind)))
			: (unit?.definition?.name ?? unit?.name ?? null)
		return {
			id,
			hero,
			team: unit?.team ?? null,
			basic: unit?.definition?.basic?.id ?? null,
			name: hero && id === local ? `${base} (you)` : (base ?? 'the world'),
		}
	}

	// The views in arrow order: oldest fight … newest fight, then the overall.
	const views = () => [...meter.segments, meter.overall]
	function viewed() {
		if (state.view === 'live') return meter.current() ?? meter.overall
		return views().includes(state.view) ? state.view : meter.overall
	}
	function stepView(by) {
		const all = views()
		const at = all.indexOf(viewed())
		const to = all[Math.max(0, Math.min(all.length - 1, at + by))]
		state.view = to === meter.current() && to.end == null ? 'live' : to
		state.drill = null
		render()
	}
	function setMode(by) {
		state.mode = MODES[(MODES.indexOf(state.mode) + by + MODES.length) % MODES.length]
		state.drill = null
		write(`${state.shown ? 'on' : 'off'}:${state.mode}`)
		render()
	}
	function show(on) {
		state.shown = on
		root.hidden = !on
		write(`${on ? 'on' : 'off'}:${state.mode}`)
		if (on) render()
	}

	function line(name, value, share, { team, rate, drill, note } = {}) {
		const li = el('li', '', list)
		if (team) li.dataset.team = team
		li.style.setProperty('--share', share)
		el('span', 'meter-name', li).textContent = name
		const figure = el('span', 'meter-value', li)
		figure.textContent = value
		if (rate) el('small', '', figure).textContent = rate
		if (note) el('small', 'meter-note', li).textContent = note
		if (drill) {
			li.tabIndex = 0
			li.onclick = drill
			li.onkeydown = (e) => e.code === 'Enter' && drill()
		}
		return li
	}

	function render() {
		state.dirty = false
		if (!state.shown) return
		const seg = viewed()
		const seconds = seg === meter.overall ? meter.overallSeconds() : meter.seconds(seg)
		const live = seg.kind === 'encounter' && seg.end == null
		modeButton.textContent = TITLES[state.mode]
		label.textContent =
			seg === meter.overall
				? `Overall · ${clock(seconds)}`
				: `${live ? '● ' : ''}${seg.name} · ${clock(seconds)}`
		label.title = seg.result ? `${seg.name}: ${seg.result}` : seg.name
		const all = views()
		prev.disabled = all.indexOf(seg) <= 0
		next.disabled = all.indexOf(seg) >= all.length - 1
		list.replaceChildren()
		const drilled = state.drill && seg.rows.get(state.drill)
		root.classList.toggle('drilled', !!drilled)
		if (drilled) return renderDrill(drilled, seconds)
		const { rows, top, total } = standings(seg, state.mode)
		rows.forEach((r) => {
			const value = r[state.mode]
			const rate = RATE[state.mode] ? `(${short(value / seconds)})` : null
			line(r.name, short(value), top ? value / top : 0, {
				team: r.team,
				rate,
				note:
					state.mode === 'deaths'
						? null
						: `${Math.round((value / total) * 100)}%${state.mode === 'healing' && r.overheal ? ` · ${Math.round((r.overheal / (r.healing + r.overheal)) * 100)}% over` : ''}`,
				drill: () => {
					state.drill = r.id
					render()
				},
			})
		})
		if (!rows.length)
			el('li', 'meter-empty', list).textContent =
				state.mode === 'deaths' ? 'Nobody has fallen.' : 'Nothing yet.'
		foot.textContent = rows.length
			? `${short(total)}${RATE[state.mode] ? ` · ${short(total / seconds)} ${RATE[state.mode]}` : ''}`
			: ''
	}

	function renderDrill(r, seconds) {
		const back = line(`‹ ${r.name}`, '', 0)
		back.classList.add('meter-back')
		back.tabIndex = 0
		back.onclick = back.onkeydown = (e) => {
			if (e.type === 'keydown' && e.code !== 'Enter') return
			state.drill = null
			render()
		}
		if (state.mode === 'deaths') {
			for (const fall of r.falls)
				line(fall.by ? `by ${fall.by}` : 'fell', clock(fall.at * STEP), 1, { team: r.team })
			foot.textContent = `${r.deaths} ${r.deaths === 1 ? 'death' : 'deaths'}`
			return
		}
		const parts = Object.entries(r.parts[state.mode]).sort((a, b) => b[1] - a[1])
		const top = parts[0]?.[1] ?? 0
		const total = r[state.mode]
		for (const [key, value] of parts)
			line(
				state.mode === 'taken' ? key : (abilityOf(key)?.name ?? spaced(key)),
				short(value),
				top ? value / top : 0,
				{
					team: r.team,
					rate: `(${short(value / seconds)})`,
					note: `${Math.round((value / total) * 100)}%`,
				},
			)
		foot.textContent = `${short(total)} · ${short(total / seconds)} ${RATE[state.mode]}`
	}

	modeButton.onclick = () => setMode(1)
	modeButton.oncontextmenu = (e) => {
		e.preventDefault()
		setMode(-1)
	}
	prev.onclick = () => stepView(-1)
	next.onclick = () => stepView(1)
	reset.onclick = () => {
		meter.reset()
		state.view = 'live'
		state.drill = null
		render()
	}
	const onKey = (e) => {
		if (e.code !== KEY || e.repeat || e.defaultPrevented) return
		if (e.target?.closest?.('input, textarea, select, [contenteditable], .tuner')) return
		show(!state.shown)
	}
	window.addEventListener('keydown', onKey)
	// Four redraws a second at most; a segment's clock only moves when a fact lands. Rows hold still
	// under the pointer, so a click lands on the row it was aimed at.
	const timer = setInterval(() => state.dirty && !root.matches(':hover') && render(), 250)
	root.hidden = !state.shown
	render()

	return {
		meter,
		present(fact) {
			if (meter.add(fact, fact.tick ?? sim.tick, describe)) state.dirty = true
		},
		dispose() {
			clearInterval(timer)
			window.removeEventListener('keydown', onKey)
			root.remove()
		},
	}
}
