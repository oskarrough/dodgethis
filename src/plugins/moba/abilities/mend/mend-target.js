const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

// Both Mender spells lock the living teammate nearest the cursor at cast start.
export function menderTargetUnit({ hero, sim, target, ability }) {
	return (
		sim.heroes
			.filter(
				(u) =>
					u.id !== hero.id &&
					u.team === hero.team &&
					!u.dead &&
					distance(hero.body.position, u.body.position) <= ability.stats.range,
			)
			.sort(
				(a, b) =>
					distance(a.body.position, target) - distance(b.body.position, target) ||
					a.id.localeCompare(b.id),
			)[0] ?? null
	)
}

export function menderReleaseTarget({ hero, sim, ability, targetId, present, slot }) {
	const ally = sim.heroes.find((u) => u.id === targetId)
	if (
		!ally ||
		ally.dead ||
		ally.team !== hero.team ||
		distance(hero.body.position, ally.body.position) > ability.stats.range
	) {
		present({ type: 'denied', hero: hero.id, slot, reason: 'targetLost' })
		return null
	}
	return ally
}
