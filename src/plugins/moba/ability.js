import { tune } from './tune.js'
import manifests from './abilities/index.js'

// Engine state keys in abilityState, and the caught-shot pseudo-ability; no ability takes them.
const RESERVED = ['pocket', 'bag', 'return']

// An ability is its manifest plus its id and live numbers, `stats`, read from tune[id].
export function defineAbility(id, manifest) {
	if (RESERVED.includes(id)) throw new Error(`MOBA ability id is reserved: ${id}`)
	return {
		id,
		...manifest,
		get stats() {
			return tune[id]
		},
	}
}

// Every ability by id: folders from abilities/index.js; heroes.js adds the ones still inline.
export const ABILITIES = Object.fromEntries(
	Object.entries(manifests).map(([id, manifest]) => [id, defineAbility(id, manifest)]),
)

export function registerAbility(ability) {
	if (Object.hasOwn(ABILITIES, ability.id))
		throw new Error(`MOBA ability registered twice: ${ability.id}`)
	ABILITIES[ability.id] = ability
	return ability
}

// Identity survives a slot change, a snapshot, or a caught shot. Custom hero
// definitions can resolve their own ability without changing the shared table.
export function abilityOf(id, unit = null) {
	if (!id) return null
	if (id === 'return')
		return {
			id,
			kind: 'shot',
			effects: { cast: 'returnNock', projectile: 'returnShot', hit: 'returnHit', pose: 'draw' },
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

export function slowFactor(unit, tick) {
	return tick < (unit.slow?.until ?? 0)
		? Number.isFinite(unit.slow.factor)
			? Math.max(0, Math.min(1, unit.slow.factor))
			: 1
		: 1
}
