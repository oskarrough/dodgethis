import { tune } from './tune.js'
import manifests from './abilities/all-abilities.js'
import { absorbAura } from './aura-damage.js'

// Effect parameters are local tune keys, not snapshots; statuses read them when applied.
export const STATUS_EFFECT_REFS = {
	slow: { magnitude: 'fraction', duration: 's' },
	shield: { amount: 'hp', duration: 's' },
	freeze: { duration: 's' },
}

export const AREA_EFFECT_REFS = {
	damage: { amount: 'hp' },
	knockback: { distance: 'm', duration: 's' },
}
export const TARGET_EFFECT_REFS = {
	heal: { amount: 'hp', critChance: 'fraction', critMultiplier: 'multiplier' },
	cleanse: {},
}
export function effectRecord(ability, record) {
	if (typeof record !== 'string') return record
	return (
		ability.statusEffects?.find((effect) => effect.effect === record) ??
		{
			damage: { effect: 'damage', amount: 'damage' },
			knockback: { effect: 'knockback', distance: 'knockback', duration: 'time' },
			heal: { effect: 'heal', amount: 'healAmount' },
			cleanse: { effect: 'cleanse', tags: ['stun', 'freeze', 'slow'] },
		}[record]
	)
}

export const AURA_EVENTS = [
	'cast',
	'tick',
	'amplify',
	'damage',
	'absorb',
	'hit',
	'damaged',
	'death',
]
export const ABILITY_STAGES = ['release', 'land', 'dashEnd', 'end', 'hit']
export const CANCELLABLE_EVENTS = ['amplify', 'damage', 'absorb', 'release', 'land', 'hit']
export function validateHookMap(id, hooks, events, { actions = true } = {}) {
	for (const [name, hook] of Object.entries(hooks ?? {})) {
		if (!events.includes(name)) throw new Error(`MOBA unknown hook event: ${id}.${name}`)
		if (hook?.before !== undefined && !CANCELLABLE_EVENTS.includes(name))
			throw new Error(`MOBA event is not cancellable: ${id}.${name}`)
		if (!actions && (Array.isArray(hook) || hook?.do !== undefined || Array.isArray(hook?.before)))
			throw new Error(`MOBA status actions need an owning ability: ${id}.${name}`)
	}
}

// Functions retain the old replacement semantics; arrays are declared actions.
// A consumed event never reaches its actions or after hook.
export function runHookStages(hook, context, runActions, fallback) {
	if (typeof hook === 'function') {
		hook(context)
		return
	}
	if (Array.isArray(hook)) return runActions(hook, context)
	if (
		(Array.isArray(hook?.before) ? runActions(hook.before, context) : hook?.before?.(context)) ===
		true
	)
		return true
	if (hook?.replace) hook.replace(context)
	else if (hook?.do) runActions(hook.do, context)
	else if (fallback) fallback(context)
	hook?.after?.(context)
}

function effectStatuses(manifest) {
	const statuses = { ...manifest.statuses }
	for (const record of manifest.statusEffects ?? []) {
		const duration = record.duration
		switch (record.effect) {
			case 'slow':
				statuses.slow = {
					label: 'Slow',
					tags: ['debuff', 'slow'],
					// Strongest wins across independent clocks, including different sources.
					stack: 'independent',
					moveSpeed: ({ stats }) => Math.max(0, Math.min(1, 1 - stats[record.magnitude])),
					duration,
				}
				break
			case 'shield':
				statuses.shield = {
					label: manifest.name ?? 'Shield',
					tags: ['buff', 'shield'],
					on: { absorb: absorbAura },
					bar: 'shield',
					amount: record.amount,
					duration,
				}
				break
			case 'freeze':
				statuses.freeze = {
					label: 'Freeze',
					tags: ['debuff', 'freeze'],
					states: ['frozen'],
					stack: 'independent',
					duration,
				}
				break
			default:
				throw new Error(`MOBA unknown status effect: ${record.effect}`)
		}
	}
	return statuses
}

// Targeted casts lock a living teammate at cast start, with stable distance/id ties.
function pickAbilityTarget({ hero, sim, target, ability }, action) {
	return (
		sim.heroes
			.filter(
				(unit) =>
					unit.id !== hero.id &&
					unit.team === hero.team &&
					!unit.dead &&
					Math.hypot(
						unit.body.position.x - hero.body.position.x,
						unit.body.position.z - hero.body.position.z,
					) <= ability.stats[action.range],
			)
			.sort(
				(a, b) =>
					Math.hypot(a.body.position.x - target.x, a.body.position.z - target.z) -
						Math.hypot(b.body.position.x - target.x, b.body.position.z - target.z) ||
					a.id.localeCompare(b.id),
			)[0] ?? null
	)
}

// Engine state keys in abilityState, and the caught-shot pseudo-ability; no ability takes them.
const RESERVED = ['pocket', 'bag', 'return']

// An ability is its manifest plus its id and live numbers, `stats`, read from tune[id].
export function defineAbility(id, manifest) {
	if (RESERVED.includes(id)) throw new Error(`MOBA ability id is reserved: ${id}`)
	validateHookMap(id, manifest.on, AURA_EVENTS)
	validateHookMap(id, manifest.stages, ABILITY_STAGES)
	for (const [key, status] of Object.entries(manifest.statuses ?? {}))
		validateHookMap(`${id}.${key}`, status.on, [...AURA_EVENTS, 'apply', 'remove', 'expire'])
	for (const record of manifest.statusEffects ?? [])
		for (const field of Object.keys(record))
			if (
				!['effect', 'scale', ...Object.keys(STATUS_EFFECT_REFS[record.effect] ?? {})].includes(
					field,
				)
			)
				throw new Error(`MOBA unknown status effect field: ${id}.${field}`)
	const release = manifest.stages?.release
	const target = (Array.isArray(release) ? release : release?.do)?.find(
		(action) => action.deliver === 'target' && action.pick === 'nearestAim',
	)
	return {
		id,
		...manifest,
		...(target && { targetUnit: (context) => pickAbilityTarget(context, target) }),
		...(manifest.statusEffects && { statuses: effectStatuses(manifest) }),
		get stats() {
			return tune[id]
		},
	}
}

// Every ability by id, from the folders in abilities/all-abilities.js.
export const ABILITIES = Object.fromEntries(
	Object.entries(manifests).map(([id, manifest]) => [id, defineAbility(id, manifest)]),
)

// Identity survives a slot change, a snapshot, or a caught shot. Custom hero
// definitions can resolve their own ability without changing the shared table.
export function abilityOf(id, unit = null) {
	if (!id) return null
	if (id === 'return')
		return {
			id,
			kind: 'shot',
			effects: {
				cast: 'returnNock',
				projectile: 'returnShot',
				hit: 'returnHit',
				pose: unit?.definition?.returnPose ?? 'draw',
				punch: unit?.definition?.returnPose === 'toss' ? 'toss' : null,
			},
		}
	return (
		[unit?.definition?.basic, ...Object.values(unit?.definition?.abilities ?? {})].find(
			(a) => a?.id === id,
		) ?? (Object.hasOwn(ABILITIES, id) ? ABILITIES[id] : null)
	)
}

export function castAbility(unit) {
	if (unit.cast?.shot)
		return {
			id: 'return',
			kind: 'shot',
			tell: 'line',
			stats: unit.cast.shot,
			effects: {
				cast: 'returnNock',
				projectile: 'returnShot',
				hit: 'returnHit',
				pose: unit.definition?.returnPose ?? 'draw',
			},
		}
	return abilityOf(unit.cast?.ability, unit) ?? unit.definition?.abilities[unit.cast?.slot] ?? null
}
