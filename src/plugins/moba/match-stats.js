import { tune } from './tune.js'

// Durable facts, separate from short-lived presentation cues. Snapshots keep recaps correct
// even when a returning guest drops stale sounds, damage popups and death effects.
export function createMatchStats() {
	const rows = {}
	function sync(heroes, bots) {
		for (const h of heroes) {
			rows[h.id] ??= {
				kills: 0,
				deaths: 0,
				heroDamage: 0,
				structureDamage: 0,
				xp: 0,
				recent: [],
				death: null,
			}
			Object.assign(rows[h.id], { heroId: h.heroId, team: h.team, bot: bots.has(h.id) })
		}
	}
	return {
		rows,
		sync,
		present(fact, heroes, structures, bots) {
			sync(heroes, bots)
			const source = rows[fact.source]
			const target = rows[fact.target]
			if (fact.type === 'hit') {
				if (source && target) source.heroDamage += fact.damage
				else if (source && structures.some((s) => s.id === fact.target))
					source.structureDamage += fact.damage
				if (target) {
					target.recent.unshift({ source: fact.source ?? null, damage: fact.damage })
					target.recent.length = Math.min(target.recent.length, tune.hud.recapSources)
				}
			} else if (fact.type === 'death' && target) {
				target.deaths++
				if (source && source.team !== target.team) source.kills++
				target.death = { source: fact.source ?? null, hits: [...target.recent], tick: fact.tick }
			} else if (fact.type === 'spawn' && target) {
				target.recent.length = 0
				target.death = null
			} else if (fact.type === 'xp') {
				for (const [id, amount] of Object.entries(fact.contributions ?? {}))
					if (rows[id]) rows[id].xp += amount
			}
		},
	}
}
