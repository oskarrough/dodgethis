import { tune } from './tune.js'
import { ABILITIES } from './ability.js'
import manifests from './heroes/index.js'

// Definitions stay plugin-local. Getters keep live tuning live; mutable state
// belongs to each sim hero, never to this table. A basic and abilities make a kit.
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
	for (const slot of Object.keys(kit))
		if (!SLOTS.includes(slot)) throw new Error(`MOBA hero ${id}: unknown kit slot ${slot}`)
	const view = new Proxy({}, { get: (_, key) => tune.heroes[id]?.[key] ?? tune.hero[key] })
	return {
		silhouette: 'circle',
		traits: {},
		...manifest,
		id,
		name: manifest.name ?? titleCase(id),
		order: manifest.order ?? 100,
		draft: manifest.draft ?? false,
		// Live: a hero without its own tune shares tune.hero itself; one with its own tune
		// reads through a view that falls back to tune.hero key by key.
		get base() {
			return tune.heroes[id] ? view : tune.hero
		},
		get basic() {
			return basicAbility
				? { ...basicAbility, ...tune[basicAbility.id] }
				: { ...tune.attack, range: tune.orders.attackRange }
		},
		abilities: Object.fromEntries(SLOTS.map((slot) => [slot, resolve(kit[slot])])),
	}
}

// Registry order is by id; seeded random seats index into it, so a new id can shift them.
export const HEROES = Object.fromEntries(
	Object.entries(manifests).map(([id, manifest]) => [id, heroFromManifest(id, manifest)]),
)

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
