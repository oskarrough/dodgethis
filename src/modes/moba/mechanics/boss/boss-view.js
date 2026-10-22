import { el } from '../../../../core/dom.js'
import { reduceFight } from './boss-report.js'

export { dressBoss as dress } from './boss-dress.js'

const number = (value) => value.toLocaleString(undefined, { maximumFractionDigits: 1 })
const percent = (value) => `${number(value * 100)}%`
const seconds = (value) => `${value.toFixed(1)} s`

export function view(_scene, { returnToLobby = () => {}, canReturnToLobby = true } = {}) {
	let facts = null
	let root = null
	if (typeof document !== 'undefined') {
		root = el('aside', 'moba-scoreboard moba-results moba-fight-report', document.body)
		root.hidden = true
		root.tabIndex = 0
		root.setAttribute('aria-label', 'Fight report')
	}
	function section(parent, title) {
		const node = el('section', '', parent)
		el('h3', '', node).textContent = title
		return node
	}
	function table(parent, headings, rows) {
		const wrap = el('div', 'moba-fight-table', parent)
		const node = el('table', '', wrap)
		const head = el('tr', '', el('thead', '', node))
		for (const label of headings) {
			const cell = el('th', '', head)
			cell.scope = 'col'
			cell.textContent = label
		}
		const body = el('tbody', '', node)
		for (const values of rows) {
			const row = el('tr', '', body)
			values.forEach((value, index) => {
				const cell = el(index ? 'td' : 'th', '', row)
				if (!index) cell.scope = 'row'
				cell.textContent = value
			})
		}
	}
	function empty(parent, text) {
		el('p', 'moba-result-note', parent).textContent = text
	}
	function render(report) {
		if (!root) return
		root.replaceChildren()
		const header = el('header', '', root)
		const title = el('h2', '', header)
		title.setAttribute('aria-live', 'polite')
		title.textContent = `${report.result === 'killed' ? 'Killed' : 'Wiped'} · ${seconds(report.duration)}`
		el('p', '', header).textContent =
			`${report.boss.name}: ${number(report.boss.hp)} / ${number(report.boss.maxHp)} HP left · Fight report`
		const back = el('button', '', header)
		back.type = 'button'
		back.textContent = canReturnToLobby
			? 'Return to party lobby'
			: 'Host can return the party to lobby'
		back.disabled = !canReturnToLobby
		back.onclick = () => returnToLobby()
		const party = section(root, 'Party')
		table(
			party,
			[
				'Hero',
				'Damage',
				'Healing',
				'Overheal',
				'Absorbed',
				'Shield wasted',
				'Taken',
				'Deaths',
				'Hurt',
				'Busy',
			],
			report.party.map((hero) => [
				hero.name,
				number(hero.damage),
				number(hero.healing),
				percent(hero.overhealShare),
				number(hero.absorbed),
				percent(hero.shieldWastedShare),
				number(hero.damageTaken),
				hero.deaths,
				percent(hero.hurt),
				percent(hero.busy),
			]),
		)
		empty(
			party,
			'Hurt: time alive below 30% HP. Busy: cast time, stopping at cancellation or death. Unspent shields at pull end count as wasted.',
		)
		const grid = el('div', 'moba-fight-sections', root)
		const spells = section(grid, 'Mender’s spells')
		if (report.spells.length) {
			table(
				spells,
				['Spell', 'Casts', 'Total', 'Average', 'Crits', 'Overheal'],
				report.spells.map((spell) => [
					spell.name,
					spell.casts,
					number(spell.total),
					number(spell.average),
					spell.crits,
					spell.healing + spell.overheal > 0 ? percent(spell.overhealShare) : '—',
				]),
			)
			empty(
				spells,
				'Total and average per cast count effective healing and shield absorbed. Cancelled casts count as casts.',
			)
		} else empty(spells, 'No spells cast.')
		const deaths = section(grid, 'Each death')
		if (!report.deaths.length) empty(deaths, 'Nobody died.')
		for (const death of report.deaths) {
			const detail = el('details', '', deaths)
			el('summary', '', detail).textContent =
				`${death.name} at ${seconds(death.time)} · last ${death.events.length} hits and heals`
			const events = el('ol', '', detail)
			for (const event of death.events) {
				el('li', '', events).textContent =
					`${seconds(event.time)} · ${event.source} · ${event.ability}: ${event.type === 'heal' ? '+' : '−'}${number(event.amount)}${event.overheal ? ` (${number(event.overheal)} overheal)` : ''}${event.absorbed ? ` (${number(event.absorbed)} absorbed)` : ''}`
			}
		}
		const threat = section(grid, 'Threat')
		table(
			threat,
			['Held the Warden', 'Time'],
			report.threat.holders.map((hero) => [hero.name, seconds(hero.seconds)]),
		)
		const turns = el('ol', '', threat)
		for (const turn of report.threat.switches)
			el('li', '', turns).textContent =
				`${report.boss.name} turned to ${turn.name} at ${seconds(turn.time)}.`
		if (!report.threat.switches.length) empty(threat, 'No target switches.')
		const wasted = section(grid, 'Wasted casts')
		const casts = el('ol', '', wasted)
		for (const cast of report.wastedCasts)
			el('li', '', casts).textContent =
				`${cast.name} at ${seconds(cast.time)} (${percent(cast.overheal)} overheal)`
		if (!report.wastedCasts.length) empty(wasted, 'No Mend overhealed by 80% or more.')
		empty(
			root,
			'Stays open after the reset. Walk back in to start the next pull and close this report.',
		)
		root.hidden = false
		const focusTarget = canReturnToLobby ? back : root
		focusTarget.focus({ preventScroll: true })
	}
	return {
		present(fact) {
			if (fact.type === 'pull' && fact.state === 'start') {
				facts = [fact]
				if (root) root.hidden = true
				return
			}
			if (!facts) return
			facts.push(fact)
			if (fact.type === 'pull' && fact.state === 'end') {
				render(reduceFight(facts))
				facts = null
			}
		},
		update() {},
		dispose() {
			facts = null
			root?.remove()
		},
	}
}
