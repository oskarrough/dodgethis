import { el } from '../../core/dom.js'
import { tune } from './tune.js'
import { tune as frontTune } from './front/tune.js'

const titleCase = (word) => word[0].toUpperCase() + word.slice(1)
const number = (value) => value.toLocaleString(undefined, { maximumFractionDigits: 1 })

// One run's facts, not a second combat simulation. Only the local death gets a card.
export function createRecap({ sim, hero, canvas }) {
	const rows = new Map(
		sim.heroes.map((unit) => [
			unit.id,
			{ unit, kills: 0, deaths: 0, heroDamage: 0, structureDamage: 0, xp: 0 },
		]),
	)
	const structures = new Map(sim.lane.structures.map((unit) => [unit.id, unit.kind]))
	const recent = []
	let death = null
	let root, heading, hits, countdown, help
	let lastCountdown = ''
	if (canvas) {
		root = el('aside', 'moba-death', document.body)
		root.hidden = true
		root.setAttribute('aria-label', 'Death recap')
		heading = el('h2', '', root)
		heading.setAttribute('aria-live', 'polite')
		el('p', 'moba-recap-caption', root).textContent = 'Last damage taken · newest first'
		hits = el('ol', '', root)
		countdown = el('p', 'moba-respawn-sticker', root)
		help = el('p', 'moba-recap-caption', root)
	}
	const heroName = (unit) => titleCase(unit.definition?.id ?? unit.heroId ?? 'fletcher')
	const sourceName = (id) => {
		const row = rows.get(id)
		if (row) return `${heroName(row.unit)}${id === hero.id ? ' (you)' : ' bot'}`
		if (structures.has(id)) return titleCase(structures.get(id))
		if (id?.startsWith('minion-')) return 'Minions'
		return 'Unknown source'
	}
	function present(fact) {
		const source = rows.get(fact.source)
		const target = rows.get(fact.target)
		if (fact.type === 'hit') {
			if (source && target) source.heroDamage += fact.damage
			else if (source && structures.has(fact.target)) source.structureDamage += fact.damage
			if (fact.target === hero.id) {
				recent.unshift({
					source: sourceName(fact.source),
					damage: fact.damage,
				})
				recent.length = Math.min(recent.length, tune.hud.recapSources)
			}
		} else if (fact.type === 'death' && target) {
			target.deaths++
			if (source && source.unit.team !== target.unit.team) source.kills++
			if (fact.target === hero.id) {
				death = { killer: sourceName(fact.source), hits: [...recent] }
				if (root) {
					heading.textContent = `Killed by ${death.killer}`
					hits.replaceChildren()
					for (const hit of death.hits) {
						const item = el('li', '', hits)
						el('span', '', item).textContent = hit.source
						el('b', '', item).textContent = number(hit.damage)
					}
				}
			}
		} else if (fact.type === 'spawn' && fact.target === hero.id) {
			recent.length = 0
			death = null
		} else if (fact.type === 'xp') {
			for (const [id, amount] of Object.entries(fact.contributions ?? {})) {
				const row = rows.get(id)
				if (row) row.xp += amount
			}
		}
	}
	function update({ alpha, step, device, hidden = false }) {
		if (!root) return
		const dead = hero.dead && !sim.lane.match.winner
		canvas.classList.toggle('moba-dead-world', dead)
		root.hidden = !dead || !death || hidden
		if (root.hidden) return
		const seconds = Math.max(0, (hero.respawnTick - sim.tick - alpha) * step)
		const text = `Respawn in ${seconds.toFixed(1)} s`
		if (text !== lastCountdown) {
			countdown.textContent = text
			lastCountdown = text
		}
		const hint =
			device === 'gamepad'
				? 'Left stick to look around · LS click to centre'
				: 'Arrows or screen edges to look around · Space to centre'
		if (help.textContent !== hint) help.textContent = hint
	}
	function showTable(card) {
		if (!card) return
		for (const [key, value] of Object.entries(frontTune.tile)) {
			const unit = ['snap', 'press'].includes(key)
				? 's'
				: key === 'lift'
					? 'px'
					: key === 'tilt'
						? 'deg'
						: ''
			card.style.setProperty(`--tile-${key}`, `${value}${unit}`)
		}
		const wrap = el('div', 'moba-results')
		const table = el('table', '', wrap)
		el('caption', '', table).textContent = 'Your match, by hero'
		const header = el('tr', '', el('thead', '', table))
		for (const label of ['Hero', 'Kills', 'Deaths', 'Hero damage', 'Siege damage', 'XP']) {
			const cell = el('th', '', header)
			cell.scope = 'col'
			cell.textContent = label
		}
		const body = el('tbody', '', table)
		for (const team of [hero.team, hero.team === 'A' ? 'B' : 'A']) {
			const teamRow = el('tr', 'moba-result-team', body)
			const teamCell = el('th', '', teamRow)
			teamCell.colSpan = header.children.length
			teamCell.textContent = team === hero.team ? 'Your team' : 'Enemy team'
			let bot = 0
			for (const row of rows.values()) {
				if (row.unit.team !== team) continue
				const line = el('tr', '', body)
				line.dataset.local = String(row.unit.id === hero.id)
				const name = el('th', '', line)
				name.scope = 'row'
				name.textContent = `${heroName(row.unit)} · ${row.unit.id === hero.id ? 'You' : `bot ${++bot}`}`
				for (const stat of ['kills', 'deaths', 'heroDamage', 'structureDamage', 'xp'])
					el('td', '', line).textContent = number(row[stat])
			}
		}
		el('p', 'moba-result-note', wrap).textContent =
			'XP: minion soak shared between nearby heroes; takedowns and siege credited to the killer. Passive and minion-earned team XP excluded.'
		card.querySelector('.actions').before(wrap)
	}
	return {
		present,
		update,
		showTable,
		dispose() {
			canvas?.classList.remove('moba-dead-world')
			root?.remove()
		},
	}
}
