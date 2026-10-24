import { el } from '../../core/dom.js'
import { tune as frontTune } from './front/tune.js'
import { DEFAULT_HERO } from './heroes.js'
import { abilityOf } from './ability.js'

const titleCase = (word) => word[0].toUpperCase() + word.slice(1)
// An ability id without a display name, as words: gloveSlap → Glove slap.
const spaced = (id) => titleCase(id.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase())
// The versus table, and a dungeon's: there every enemy is a boss or a pack, so the party is
// counted by what it dealt and healed, and the other team is empty.
const versus = {
	labels: ['Hero', 'Kills', 'Deaths', 'Hero damage', 'Siege damage', 'XP'],
	stats: ['kills', 'deaths', 'heroDamage', 'structureDamage', 'xp'],
}
const party = {
	labels: ['Hero', 'Damage', 'Healing', 'Deaths', 'XP'],
	stats: ['damage', 'healing', 'deaths', 'xp'],
}
// Whole numbers: a decimal of damage is precision nobody can use.
const number = (value) => Math.round(value).toLocaleString()

// One run's facts, not a second combat simulation. Only the local death gets a card.
export function createRecap({ sim, hero, canvas, paper = (node) => node }) {
	const { labels, stats } = sim.dungeon ? party : versus
	const teams = sim.dungeon ? [hero.team] : [hero.team, hero.team === 'A' ? 'B' : 'A']
	const structures = new Map((sim.lane?.structures ?? []).map((unit) => [unit.id, unit.kind]))
	let shownDeath = null
	let root, heading, hits, help
	if (canvas) {
		root = paper(el('aside', 'moba-death', document.body))
		root.hidden = true
		root.setAttribute('aria-label', 'Death recap')
		heading = el('h2', '', root)
		heading.setAttribute('aria-live', 'polite')
		el('p', 'moba-recap-caption', root).textContent = 'Last hits taken, by source'
		hits = el('ol', '', root)
		// The respawn timer is on the unit frame already; the card doesn't repeat it.
		help = el('p', 'moba-recap-caption', root)
	}
	// One line per source, hardest hitter first: its total, how many hits and with what.
	function bySource(list) {
		const groups = new Map()
		for (const hit of list) {
			const group = groups.get(hit.source) ?? {
				source: hit.source,
				damage: 0,
				count: 0,
				abilities: [],
			}
			groups.set(hit.source, group)
			group.damage += hit.damage
			group.count++
			const unit = sim.heroes?.find((h) => h.id === hit.source)
			const ability = hit.ability && abilityOf(hit.ability, unit)
			const name = ability ? (ability.name ?? spaced(ability.id)) : null
			if (name && !group.abilities.includes(name)) group.abilities.push(name)
		}
		return [...groups.values()].sort((a, b) => b.damage - a.damage)
	}
	const heroName = (unit) => titleCase(unit.definition?.id ?? unit.heroId ?? DEFAULT_HERO)
	const sourceName = (id) => {
		const row = sim.matchStats?.[id]
		if (row) return `${heroName(row)}${id === hero.id ? ' (you)' : row.bot ? ' bot' : ''}`
		if (structures.has(id)) return titleCase(structures.get(id))
		if (id?.startsWith('minion-')) return 'Minions'
		if (id?.startsWith('dummy')) return 'Training dummy'
		return id ? titleCase(id) : 'Environment'
	}
	function update({ device, hidden = false }) {
		if (!root) return
		const death = sim.matchStats?.[hero.id]?.death
		if (death && death.tick !== shownDeath) {
			shownDeath = death.tick
			heading.textContent = `Killed by ${sourceName(death.source)}`
			hits.replaceChildren()
			for (const group of bySource(death.hits)) {
				const item = el('li', '', hits)
				el('b', 'moba-recap-name', item).textContent = sourceName(group.source)
				el('span', 'moba-recap-damage', item).textContent = number(group.damage)
				el('span', 'moba-recap-hits', item).textContent = [
					group.count === 1 ? '1 hit' : `${group.count} hits`,
					...group.abilities,
				].join(' · ')
			}
		}
		const dead = hero.dead && !sim.lane?.match.winner
		canvas.classList.toggle('moba-dead-world', dead)
		root.hidden = !dead || !death || hidden
		if (root.hidden) return
		const hint =
			device === 'gamepad'
				? 'Left stick to look around · LS click to centre'
				: 'Arrows or screen edges to look around · Space to centre'
		if (help.textContent !== hint) help.textContent = hint
	}
	function buildTable(parent) {
		const wrap = el('div', 'moba-results', parent)
		const table = el('table', '', wrap)
		const header = el('tr', '', el('thead', '', table))
		for (const label of labels) {
			const cell = el('th', '', header)
			cell.scope = 'col'
			cell.textContent = label
		}
		const body = el('tbody', '', table)
		for (const team of teams) {
			const teamRow = el('tr', 'moba-result-team', body)
			const teamCell = el('th', '', teamRow)
			teamCell.colSpan = header.children.length
			teamCell.textContent = team === hero.team ? 'Your team' : 'Enemy team'
			for (const [id, row] of Object.entries(sim.matchStats ?? {})) {
				if (row.team !== team) continue
				const line = el('tr', '', body)
				line.dataset.local = String(id === hero.id)
				const name = el('th', '', line)
				name.scope = 'row'
				// The hero is the name; only your own row says so.
				name.textContent = `${heroName(row)}${id === hero.id ? ' (you)' : ''}`
				for (const stat of stats) el('td', '', line).textContent = number(row[stat] ?? 0)
			}
		}
		return wrap
	}
	// The end screen's table, live; Tab or Select toggles it. Rebuilt only when a number moves.
	let board = null
	let boardKey = ''
	function updateBoard(show) {
		if (!canvas) return
		if (!show) {
			if (board) board.hidden = true
			return
		}
		board ??= paper(el('aside', 'moba-scoreboard', document.body))
		board.hidden = false
		const key = Object.entries(sim.matchStats ?? {})
			.map(([id, row]) => [id, ...stats.map((stat) => number(row[stat]))].join())
			.join('|')
		if (key === boardKey && board.firstChild) return
		boardKey = key
		board.replaceChildren()
		buildTable(board)
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
		const wrap = buildTable()
		if (!sim.dungeon)
			el('p', 'moba-result-note', wrap).textContent =
				'XP: minion soak shared between nearby heroes; takedowns and siege credited to the killer. Passive and minion-earned team XP excluded.'
		card.querySelector('.actions').before(wrap)
	}
	return {
		update,
		updateBoard,
		showTable,
		dispose() {
			canvas?.classList.remove('moba-dead-world')
			root?.remove()
			board?.remove()
		},
	}
}
