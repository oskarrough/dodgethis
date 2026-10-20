import { el } from '../../core/dom.js'
import { abilityOf } from './ability.js'
import './cast-bar.css'

// A WoW-style cast bar: spell, filling bar, seconds left and target. Hidden for casts under `min` seconds.
export function createCastBar(parent, { kind = 'player', min = 0.3 } = {}) {
	const root = el('div', `moba-castbar moba-castbar-${kind}`, parent)
	root.hidden = true
	const fill = el('i', 'moba-castbar-fill', root)
	const name = el('b', 'moba-castbar-name', root)
	const target = el('span', 'moba-castbar-target', root)
	const left = el('span', 'moba-castbar-left', root)
	let last = null // { unit, cast, k }
	let ending = 0
	let interrupted = false

	function show(unit, cast, units, step, blend) {
		const total = cast.total * step
		const k = Math.max(0, Math.min(1, 1 - (cast.left - blend) / Math.max(1, cast.total)))
		const ability = abilityOf(cast.ability, unit)
		if (last?.cast !== cast) {
			root.classList.remove('done', 'interrupted')
			root.style.setProperty('--cast-color', ability?.castColor ?? '')
			name.textContent = ability?.name ?? cast.ability
			const ally = units.find((u) => u.id === cast.targetId)
			target.textContent = ally && ally !== unit ? `→ ${ally.definition?.name ?? ally.id}` : ''
			interrupted = false
		}
		last = { unit, cast, k }
		ending = 0
		root.hidden = false
		fill.style.transform = `scaleX(${k})`
		left.textContent = `${Math.max(0, total * (1 - k)).toFixed(1)} s`
	}

	// After the cast ends the bar holds briefly: a flash when it landed, red when cancelled.
	function finish(dt) {
		if (!last) return
		if (!ending) {
			ending = interrupted ? 1 : 0.45
			root.classList.add(interrupted ? 'interrupted' : 'done')
			if (interrupted) left.textContent = 'Interrupted'
			else fill.style.transform = 'scaleX(1)'
		}
		ending -= dt
		if (ending > 0) return
		root.hidden = true
		last = null
		ending = 0
	}

	return {
		node: root,
		update(dt, { unit, units = [], step, blend = 0 }) {
			const cast = unit && !unit.dead ? unit.cast : null
			if (unit?.dead && last) interrupted = true
			if (cast && cast.total * step >= min) show(unit, cast, units, step, blend)
			else if (last && last.cast !== cast) finish(dt)
		},
		cancelled(fact) {
			if (last && fact.hero === last.unit.id && fact.ability === last.cast.ability)
				interrupted = true
		},
	}
}
