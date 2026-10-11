import { structureName } from './gates.js'
import { tune } from './tune.js'

// The match's game log (docs/feature-map.md, "Match: HUD"): every presented fact that deserves words becomes one
// sentence from the local player's point of view, kept as { type, fact, tick, text }. The feed is this log through
// FEED; a death recap or debug log can read `entries` or listen with its own filter.
export const FEED = new Set(['out', 'wipe', 'structure', 'goal', 'ball'])

export function createGameLog({ sim, local, unitOf, keep = 200 }) {
	const entries = []
	const listeners = new Set()
	const localTeam = () => unitOf(local)?.team
	const titleCase = (word) => word[0].toUpperCase() + word.slice(1)
	function who(unit, subject) {
		const said = (text) => (subject ? titleCase(text) : text)
		if (!unit) return said('the enemy')
		if (unit.id === local) return said('you')
		const side = unit.team === localTeam() ? 'ally' : 'enemy'
		if (unit.definition) return said(`${side} ${titleCase(unit.definition.id)}`)
		if (unit.structure)
			return said(`${unit.team === localTeam() ? 'your' : 'enemy'} ${structureName(unit.kind)}`)
		return said(`${side} minions`)
	}

	// Fact → [entry type, sentence], or nothing. `said` carries what presentation already worked out (who is out, a wipe).
	function sentence(fact, said) {
		switch (fact.type) {
			case 'ballContested':
				return ['ball', 'Ball contested! Clear the lobby']
			case 'ballWarn':
				return ['ball', `Ball at mid in ${Math.ceil(fact.seconds)} s`]
			case 'ballSpawn':
				return ['ball', 'Ball is live! Stand on it to pick up']
			case 'ballPickup':
				return [
					'ball',
					`${fact.hero === local ? 'You have' : fact.team === localTeam() ? 'Your team has' : 'Enemy has'} the Ball!`,
				]
			case 'ballDrop':
				if (fact.hero !== local || fact.reason !== 'death') return
				return ['ball', 'You died carrying the Ball · Ball dropped']
			case 'ballHit': {
				if (fact.kind !== 'structure') return
				const friendly = unitOf(fact.hero)?.team === localTeam()
				return [
					'goal',
					`${friendly ? 'GOAL!' : 'Enemy scored!'} ${unitOf(fact.target)?.kind === 'core' ? 'Core' : 'Tower'} silenced ${tune.ball.silence} s`,
				]
			}
			case 'structureDown': {
				const target = unitOf(fact.target)
				return [
					'structure',
					target?.team === localTeam()
						? `Your ${target.kind} fell`
						: `Enemy ${target?.kind ?? 'structure'} destroyed`,
				]
			}
			case 'death':
			case 'dunk': {
				const { unit, wiped } = said
				if (wiped)
					return [
						'wipe',
						unit.team === localTeam()
							? 'All out! Your whole team is out'
							: 'All out! The whole enemy team is out',
					]
				const taker = unitOf(fact.source)
				return [
					'out',
					fact.type === 'dunk'
						? `${who(taker, true)} dunked ${who(unit)}`
						: `${who(taker, true)} got ${who(unit)} out`,
				]
			}
		}
	}

	return {
		entries,
		record(fact, said = {}) {
			const line = sentence(fact, said)
			if (!line) return
			const entry = { type: line[0], fact: fact.type, tick: fact.tick ?? sim.tick, text: line[1] }
			entries.push(entry)
			if (entries.length > keep) entries.shift()
			for (const listener of listeners) listener(entry)
			return entry
		},
		// `fn(entry)` for each new entry whose type is in `filter`; returns the unsubscribe.
		listen(fn, filter = FEED) {
			const listener = (entry) => filter.has(entry.type) && fn(entry)
			listeners.add(listener)
			return () => listeners.delete(listener)
		},
		reset() {
			entries.length = 0
		},
	}
}
