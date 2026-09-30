import { tune } from './tune.js'

// Definitions stay plugin-local. Getters keep live tuning live; mutable state
// belongs to each sim hero, never to this table. Other heroes are art stand-ins.
const ability = (id, kind, properties = {}) => ({
	id,
	kind,
	...properties,
	get stats() {
		return tune[id]
	},
})
const loose = ability('loose', 'shot', {
	pierce: false,
	heal: false,
	bounce: false,
	catchable: true,
	aimAssist: true,
})
const vault = ability('vault', 'dash')
const rain = ability('rain', 'zone', { heal: false })
export const HEROES = {
	fletcher: {
		id: 'fletcher',
		silhouette: 'circle',
		get base() {
			return tune.hero
		},
		get basic() {
			return { ...tune.attack, range: tune.orders.attackRange }
		},
		abilities: { slot1: loose, slot2: vault, slot3: rain, slot4: null },
		traits: {
			onHit({ source, shot, target, ticks }) {
				if (shot.ability === loose.id && target.hero && !source.dead)
					source.cd[1] = Math.max(0, source.cd[1] - ticks(tune.momentum.reduction))
			},
		},
	},
	...Object.fromEntries(
		['mitts', 'carom', 'skip'].map((id) => [
			id,
			{
				id,
				silhouette: id === 'mitts' ? 'square' : id === 'carom' ? 'triangle' : 'bar',
				get base() {
					return { ...tune.hero, ...tune.heroes[id] }
				},
				basic: null,
				abilities: { slot1: null, slot2: null, slot3: null, slot4: null },
				traits: {},
			},
		]),
	),
}

export function heroDefinition(id = 'fletcher') {
	const definition = HEROES[id]
	if (!definition) throw new Error(`Unknown MOBA hero: ${id}`)
	return definition
}

export function freshAbilityState() {
	return { pocket: null, board: null, bag: [], cutout: null, freeze: null }
}
