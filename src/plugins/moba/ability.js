import { tune } from './tune.js'
import manifests from './abilities/all-abilities.js'
import { absorbAura } from './aura-damage.js'

// Effect parameters are local tune keys, not snapshots; statuses read them when applied.
export const STATUS_EFFECT_REFS = {
	slow: { magnitude: 'fraction', duration: 's', enabled: 'fraction' },
	shield: { amount: 'hp', duration: 's' },
	freeze: { duration: 's' },
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
					...(record.enabled && { enabled: ({ stats }) => Boolean(stats[record.enabled]) }),
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

// Engine state keys in abilityState, and the caught-shot pseudo-ability; no ability takes them.
const RESERVED = ['pocket', 'bag', 'return']

// An ability is its manifest plus its id and live numbers, `stats`, read from tune[id].
export function defineAbility(id, manifest) {
	if (RESERVED.includes(id)) throw new Error(`MOBA ability id is reserved: ${id}`)
	return {
		id,
		...manifest,
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
