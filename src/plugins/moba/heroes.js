import { tune } from './tune.js'
import { ABILITIES, defineAbility, registerAbility } from './ability.js'
import manifests from './heroes/index.js'

// Definitions stay plugin-local. Getters keep live tuning live; mutable state
// belongs to each sim hero, never to this table. A basic and abilities make a kit.
// Fletcher and Mitts are still written out here; folder heroes come from heroes/index.js.
const ability = (id, kind, properties = {}) =>
	registerAbility(defineAbility(id, { kind, ...properties }))
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
	onDashEnd({ hero, tick, ticks, ability }) {
		hero.proneUntil = tick + ticks(ability.stats.prone)
		if (hero.catchWindow) hero.catchWindow.until = hero.proneUntil
	},
})
const gloveSlap = ability('gloveSlap', 'melee', {
	tell: 'line',
	effects: { cast: 'slapWindup', impact: 'slap', pose: 'slap' },
})
const SLOTS = ['slot1', 'slot2', 'slot3', 'slot4']
const titleCase = (id) => id[0].toUpperCase() + id.slice(1)

// A folder's manifest becomes the definition shape every reader knows: kit ids resolve to
// ability objects in abilities.slot1–slot4; base and basic stay getters on live tune.
export function heroFromManifest(id, { kit = {}, basic = null, ...manifest }) {
	const resolve = (abilityId) => {
		if (abilityId == null) return null
		if (!Object.hasOwn(ABILITIES, abilityId))
			throw new Error(`MOBA hero ${id}: unknown ability ${abilityId}`)
		return ABILITIES[abilityId]
	}
	const basicAbility = resolve(basic)
	return {
		silhouette: 'circle',
		traits: {},
		...manifest,
		id,
		name: manifest.name ?? titleCase(id),
		order: manifest.order ?? 100,
		draft: manifest.draft ?? false,
		get base() {
			return { ...tune.hero, ...tune.heroes[id] }
		},
		get basic() {
			return basicAbility
				? { ...basicAbility, ...tune[basicAbility.id] }
				: { ...tune.attack, range: tune.orders.attackRange }
		},
		abilities: Object.fromEntries(SLOTS.map((slot) => [slot, resolve(kit[slot])])),
	}
}

export const HEROES = {
	fletcher: {
		id: 'fletcher',
		name: 'Fletcher',
		order: 1,
		color: 'blue',
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
		name: 'Mitts',
		order: 2,
		color: 'red',
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
				name: titleCase(id),
				order: 100,
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

for (const [id, manifest] of Object.entries(manifests)) {
	if (Object.hasOwn(HEROES, id)) throw new Error(`MOBA hero defined twice: ${id}`)
	HEROES[id] = heroFromManifest(id, manifest)
}

// `playable` means "may play" and gates every validator, drafts included. `listed` is
// playable and not a draft, the same on every peer whatever the URL says.
for (const definition of Object.values(HEROES))
	Object.defineProperties(definition, {
		playable: {
			enumerable: true,
			get: () => !!definition.basic && Object.values(definition.abilities).some(Boolean),
		},
		listed: { enumerable: true, get: () => definition.playable && !definition.draft },
	})

const byOrder = (a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

// Listed hero ids in registry order: random seats draw from these, so a draft never
// enters a seeded roster.
export const listed = Object.keys(HEROES).filter((id) => HEROES[id].listed)
export const DEFAULT_HERO = listed.map((id) => HEROES[id]).sort(byOrder)[0].id

// The strip, the stands, H and the debug dropdowns: listed heroes, plus a draft when
// ?hero= names it (setup.heroId) or with setup.debug, by order.
export function listedHeroes(setup = {}) {
	return Object.values(HEROES)
		.filter((h) => h.listed || (h.playable && (setup.debug || h.id === setup.heroId)))
		.sort(byOrder)
}

export function heroDefinition(id = DEFAULT_HERO) {
	const definition = HEROES[id]
	if (!definition) throw new Error(`Unknown MOBA hero: ${id}`)
	return definition
}

// Engine keys first; a hero's or an ability's own state sits under its id.
export function freshAbilityState(definition = null) {
	const state = { pocket: null, bag: [] }
	for (const owner of [definition, ...Object.values(definition?.abilities ?? {})])
		if (owner?.state) state[owner.id] = owner.state()
	return state
}
