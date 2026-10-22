// A tune name reads at the caller's existing evaluation point. Computed values stay code.
export function unitTuneValue(declaration, field, stats) {
	const value = declaration[field]
	return typeof value === 'function' ? value(stats) : stats[value]
}

// MOBA-local definitions, not runtime units or a new population/brain dispatcher.
// Keep the caller's live base object when fields already have their engine names.
export function unitFromDeclaration(id, declaration, stats, abilities = {}) {
	const resolve = (abilityId) => {
		if (abilityId == null) return null
		if (!Object.hasOwn(abilities, abilityId))
			throw new Error(`MOBA unit unknown ability: ${id} ${abilityId}`)
		return abilities[abilityId]
	}
	const aliases = Object.keys(UNIT_REFS).filter(
		(field) => declaration[field] !== undefined && declaration[field] !== field,
	)
	const base = () => {
		const source = stats()
		return aliases.length
			? new Proxy(source, {
					get: (target, key) =>
						aliases.includes(key) ? unitTuneValue(declaration, key, target) : target[key],
				})
			: source
	}
	const attack = typeof declaration.attack === 'string' ? resolve(declaration.attack) : null
	return {
		id,
		unit: declaration,
		traits: declaration.traits ?? {},
		brain: declaration.brain,
		get base() {
			return base()
		},
		get basic() {
			return (
				attack ??
				(declaration.attack &&
					Object.fromEntries(
						Object.keys(declaration.attack).map((key) => [
							key,
							unitTuneValue(declaration.attack, key, stats()),
						]),
					))
			)
		},
		abilities: Object.fromEntries(
			Object.entries(declaration.kit ?? {}).map(([slot, abilityId]) => {
				if (!['slot1', 'slot2', 'slot3', 'slot4'].includes(slot))
					throw new Error(`MOBA unit unknown kit slot: ${id} ${slot}`)
				return [slot, resolve(abilityId)]
			}),
		),
	}
}

// Only existing, shared dimensions; sight/XP can join when their third consumer moves.
export const UNIT_REFS = { hp: 'hp', radius: 'm', speed: 'm/s', lifetime: 's' }
export const UNIT_ATTACK_REFS = { damage: 'hp', rate: '1/s', range: 'm', tell: 's' }
