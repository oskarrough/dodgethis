import { tune } from './tune.js'
import { ABILITIES } from './ability.js'
import { unitFromDeclaration } from './unit-definition.js'
import manifests from './heroes/all-heroes.js'

// Definitions stay plugin-local. Getters keep live tuning live; mutable state
// belongs to each sim hero, never to this table. A basic and abilities make a kit.
const SLOTS = ['slot1', 'slot2', 'slot3', 'slot4']
const titleCase = (id) => id[0].toUpperCase() + id.slice(1)

// A hero is a unit plus selection and presentation. The engine-facing getters stay live.
export function heroFromManifest(id, { unit, ...manifest }) {
	const baseValue = (key) => tune.heroes[id]?.[key] ?? tune.hero[key]
	const baseKeys = () => [
		...new Set([...Object.keys(tune.hero), ...Object.keys(tune.heroes[id] ?? {})]),
	]
	const view = new Proxy(
		{},
		{
			get: (_, key) => baseValue(key),
			has: (_, key) => key in tune.hero || key in (tune.heroes[id] ?? {}),
			ownKeys: baseKeys,
			getOwnPropertyDescriptor: (_, key) =>
				baseKeys().includes(key)
					? { enumerable: true, configurable: true, value: baseValue(key) }
					: undefined,
		},
	)
	const definition = unitFromDeclaration(
		id,
		unit,
		() => (tune.heroes[id] ? view : tune.hero),
		ABILITIES,
	)
	definition.abilities = Object.fromEntries(
		SLOTS.map((slot) => [slot, definition.abilities[slot] ?? null]),
	)
	const basicAbility = definition.basic
	return Object.defineProperties(
		definition,
		Object.getOwnPropertyDescriptors({
			silhouette: 'circle',
			...manifest,
			id,
			name: manifest.name ?? titleCase(id),
			order: manifest.order ?? 100,
			draft: manifest.draft ?? false,
			bot: unit.brain,
			get basic() {
				return basicAbility
					? { ...basicAbility, ...tune[basicAbility.id] }
					: { ...tune.attack, range: tune.orders.attackRange }
			},
		}),
	)
}

// Registry order is by id; seeded random seats index into it, so a new id can shift them.
export const HEROES = Object.fromEntries(
	Object.entries(manifests).map(([id, manifest]) => [id, heroFromManifest(id, manifest)]),
)

// `playable` means "may play offline", drafts included. Online validators use `listed`, which is
// playable and not a draft. Cooperative parties also allow playable drafts on every peer.
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
// ?hero= names it (setup.heroId) or with setup.debug, by order. Competitive online lobbies
// exclude drafts; party lobbies expose the same complete strip on every peer.
export function listedHeroes(setup = {}) {
	return Object.values(HEROES)
		.filter(
			(h) =>
				h.listed ||
				((!setup.shared || setup.party) && h.playable && (setup.debug || h.id === setup.heroId)),
		)
		.sort(byOrder)
}

export function heroDefinition(id = DEFAULT_HERO) {
	const definition = HEROES[id]
	if (!definition) throw new Error(`Unknown MOBA hero: ${id}`)
	return definition
}

// The body still uses Brew's movement defaults and identity; only the unit is declared.
export const WARDEN_UNIT = {
	hp: 'hp',
	radius: 'radius',
	speed: 'speed',
	attack: 'swing',
	kit: { slot1: 'swing', slot2: 'slam' },
	brain: 'boss',
}
// The Warden's body and kit; a dungeon encounter gives it its own name and HP.
export function wardenDefinition({ name = 'Warden', hp } = {}) {
	const definition = unitFromDeclaration(
		'brew',
		WARDEN_UNIT,
		() =>
			Object.assign(
				Object.create(heroDefinition('brew').base),
				tune.boss,
				hp == null ? {} : { hp },
			),
		ABILITIES,
	)
	definition.name = name
	return definition
}

// Engine keys first; a hero's or an ability's own state sits under its id.
export function freshAbilityState(definition = null) {
	const state = { pocket: null, bag: [] }
	for (const owner of [definition, ...Object.values(definition?.abilities ?? {})])
		if (owner?.state) state[owner.id] = owner.state()
	return state
}
