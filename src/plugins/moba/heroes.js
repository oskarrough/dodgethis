import { tune } from './tune.js'

// Definitions stay plugin-local. Getters keep live tuning live; mutable state
// belongs to each sim hero, never to this table. A basic and abilities make a kit.
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
	tell: 'line',
	held: 'line',
	effects: { cast: 'nock', projectile: 'loose', hit: 'looseHit', pose: 'draw' },
})
const vault = ability('vault', 'dash', {
	held: 'arrow',
	effects: { cast: 'vault', effect: 'vault', pose: 'vault' },
})
const rain = ability('rain', 'zone', {
	heal: false,
	tell: 'circle',
	held: 'circle',
	effects: { impact: 'rain', effect: 'rain', pose: 'rain' },
})
const toss = ability('toss', 'shot', {
	pierce: false,
	heal: false,
	bounce: false,
	catchable: true,
	returnsPocket: true,
	aimAssist: true,
	tell: 'line',
	held: 'line',
	effects: { cast: 'tossWindup', projectile: 'toss', hit: 'tossHit', pose: 'toss' },
})
const catchStance = ability('catch', 'stance', {
	catchesShots: true,
	acceptBall: true,
	held: 'cone',
	effects: { cast: 'catch', effect: 'catch', pose: 'catch' },
	onStart({ hero, sim, ability, slot, dir }) {
		sim.openCatch(hero, {
			ability: ability.id,
			dir,
			duration: ability.stats.duration,
			radius: ability.stats.radius,
			angle: ability.stats.angle,
			acceptBall: true,
			resetSlot: slot,
			resetCooldown: ability.stats.resetCooldown,
		})
	},
})
const dive = ability('dive', 'dash', {
	catchesShots: true,
	acceptBall: false,
	held: 'arrow',
	effects: { cast: 'dive', effect: 'dive', pose: 'dive' },
	onRelease({ hero, sim, ability }) {
		sim.openCatch(hero, {
			ability: ability.id,
			duration: ability.stats.time + ability.stats.prone,
			radius: ability.stats.radius,
			angle: ability.stats.angle,
			acceptBall: false,
		})
	},
	onDashEnd({ hero, tick, ticks }) {
		hero.proneUntil = tick + ticks(tune.dive.prone)
		if (hero.catchWindow) hero.catchWindow.until = hero.proneUntil
	},
})
const gloveSlap = ability('gloveSlap', 'melee', {
	tell: 'line',
	effects: { cast: 'slapWindup', impact: 'slap', pose: 'slap' },
})
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
		abilities: { slot1: loose, slot2: rain, slot3: vault, slot4: null },
		traits: {
			onHit({ source, shot, target, ticks }) {
				if (shot.traitProcs !== false && shot.ability === loose.id && target.hero && !source.dead)
					source.cd[1] = Math.max(0, source.cd[1] - ticks(tune.momentum.reduction))
			},
		},
	},
	mitts: {
		id: 'mitts',
		silhouette: 'square',
		get base() {
			return { ...tune.hero, ...tune.heroes.mitts }
		},
		get basic() {
			return { ...gloveSlap, ...tune.gloveSlap }
		},
		abilities: { slot1: toss, slot2: catchStance, slot3: dive, slot4: null },
		returnPose: 'toss',
		traits: {
			onCatch({ hero, source }) {
				if (hero.abilityState.pocket) hero.abilityState.pocket.team = source.team
			},
			onDeath({ hero }) {
				hero.body.cancelDash()
				hero.dashAbility = null
			},
		},
	},
	...Object.fromEntries(
		['carom', 'skip'].map((id) => [
			id,
			{
				id,
				silhouette: id === 'carom' ? 'triangle' : 'bar',
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

for (const definition of Object.values(HEROES))
	Object.defineProperty(definition, 'playable', {
		enumerable: true,
		get: () => !!definition.basic && Object.values(definition.abilities).some(Boolean),
	})

export function heroDefinition(id = 'fletcher') {
	const definition = HEROES[id]
	if (!definition) throw new Error(`Unknown MOBA hero: ${id}`)
	return definition
}

export function freshAbilityState() {
	return { pocket: null, bag: [] }
}
