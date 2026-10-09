import { el } from '../../core/dom.js'
import { tune as frontTune } from './front/tune.js'

const titleCase = (word) => word[0].toUpperCase() + word.slice(1)
const number = (value) => value.toLocaleString(undefined, { maximumFractionDigits: 1 })

// One run's facts, not a second combat simulation. Only the local death gets a card.
export function createRecap({ sim, hero, canvas }) {
	const structures = new Map((sim.lane?.structures ?? []).map((unit) => [unit.id, unit.kind]))
	let shownDeath = null
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
		const row = sim.matchStats?.[id]
		if (row) return `${heroName(row)}${id === hero.id ? ' (you)' : row.bot ? ' bot' : ''}`
		if (structures.has(id)) return titleCase(structures.get(id))
		if (id?.startsWith('minion-')) return 'Minions'
		if (id?.startsWith('dummy')) return 'Training dummy'
		return id ? titleCase(id) : 'Environment'
	}
	function update({ alpha, step, device, hidden = false }) {
		if (!root) return
		const death = sim.matchStats?.[hero.id]?.death
		if (death && death.tick !== shownDeath) {
			shownDeath = death.tick
			heading.textContent = `Killed by ${sourceName(death.source)}`
			hits.replaceChildren()
			for (const hit of death.hits) {
				const item = el('li', '', hits)
				el('span', '', item).textContent = sourceName(hit.source)
				el('b', '', item).textContent = number(hit.damage)
			}
		}
		const dead = hero.dead && !sim.lane?.match.winner
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
			for (const [id, row] of Object.entries(sim.matchStats ?? {})) {
				if (row.team !== team) continue
				const line = el('tr', '', body)
				line.dataset.local = String(id === hero.id)
				const name = el('th', '', line)
				name.scope = 'row'
				name.textContent = `${heroName(row)} · ${id === hero.id ? 'You' : row.bot ? `bot ${++bot}` : 'Player'}`
				for (const stat of ['kills', 'deaths', 'heroDamage', 'structureDamage', 'xp'])
					el('td', '', line).textContent = number(row[stat])
			}
		}
		el('p', 'moba-result-note', wrap).textContent =
			'XP: minion soak shared between nearby heroes; takedowns and siege credited to the killer. Passive and minion-earned team XP excluded.'
		card.querySelector('.actions').before(wrap)
	}
	return {
		update,
		showTable,
		dispose() {
			canvas?.classList.remove('moba-dead-world')
			root?.remove()
		},
	}
}
