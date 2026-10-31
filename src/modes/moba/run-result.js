import { el } from '../../core/dom.js'
import { STEP } from '../../core/app.js'
import { clock } from './tooltip.js'
import { pickedTalents } from './talents.js'
import mechanicViews from './mechanics/all-mechanic-views.js'
import './run-result.css'

// A dungeon run's end, drawn on the result page in place of the lane's table: the Wardens as the
// top bar marks them, then the run's time, your level and the party's deaths, each a figure with
// a small drawing for its label, and your talent build. The only words are names.
const CLOCK =
	'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.2 2.2"/></svg>'

export function runResult(card, { sim, hero }) {
	const goal = Object.values(mechanicViews)
		.map((view) => view.goal)
		.find((g) => g?.marks)
	const root = el('section', 'moba-run')
	const row = el('div', 'moba-run-marks', root)
	const marks = goal?.marks(sim) ?? []
	for (const m of marks) {
		const mark = el('i', 'moba-mark', row, m.icon)
		el('i', 'moba-mark-lock', mark, goal.lock ?? '')
		el('i', 'moba-mark-strike', mark)
		mark.dataset.state = m.state
		mark.dataset.last = String(!!m.last)
		mark.setAttribute('aria-label', `${m.name}${m.state === 'down' ? ' fallen' : ''}`)
	}
	row.setAttribute(
		'aria-label',
		`${marks.filter((m) => m.state === 'down').length} of ${marks.length}`,
	)
	const end = sim.dungeon?.run.endedTick ?? sim.lane?.match.endedTick ?? sim.tick
	const party = sim.heroes.filter((h) => h.team === hero.team)
	const deaths = party.reduce((sum, h) => sum + (sim.matchStats?.[h.id]?.deaths ?? 0), 0)
	const facts = el('div', 'moba-run-facts', root)
	const fact = (kind, label, value, icon) => {
		const node = el('p', `moba-run-fact ${kind}`, facts)
		node.setAttribute('aria-label', `${label} ${value}`)
		if (icon) el('span', 'moba-run-icon', node, icon).setAttribute('aria-hidden', 'true')
		el('b', '', node).textContent = value
		return node
	}
	fact('time', 'Time', clock(end * STEP), CLOCK)
	// Your level wears the unit frame's badge; the deaths, the top bar's hollow dot of a fallen hero.
	const level = fact('level', 'Level', String(hero.level ?? 1))
	level.querySelector('b').className = 'moba-run-lv'
	fact('deaths', 'Deaths', String(deaths), '<i></i>')
	// Your talent build, one pick per row in the order taken: its drawing and its name.
	const picks = pickedTalents(hero.heroId, hero.talents)
	if (picks.length) {
		const build = el('ol', 'moba-run-talents', root)
		for (const talent of picks) {
			const item = el('li', '', build)
			el('span', 'moba-run-talent-icon', item, talent.icon).setAttribute('aria-hidden', 'true')
			el('span', '', item).textContent = talent.name
		}
	}
	card.querySelector('.actions').before(root)
	return root
}
