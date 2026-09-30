import { HEROES } from './heroes.js'

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
		Object.values(unit?.definition?.abilities ?? {}).find((a) => a?.id === id) ??
		Object.values(HEROES)
			.flatMap((h) => Object.values(h.abilities))
			.find((a) => a?.id === id) ??
		null
	)
}

export function castAbility(unit) {
	if (unit.cast?.shot)
		return {
			id: 'return',
			kind: 'shot',
			tell: 'line',
			stats: unit.cast.shot,
			effects: { cast: 'returnNock', projectile: 'returnShot', hit: 'returnHit', pose: 'draw' },
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
