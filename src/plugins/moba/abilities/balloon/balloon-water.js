// All support contacts use the same public fact as Pass; puddle ticks stay quiet.
export function balloonHeal(owner, unit, amount, ability, present, ambient = false) {
	const heal = Math.max(0, Math.min(unit.maxHp - unit.hp, amount))
	if (!heal) return
	unit.hp += heal
	present({
		type: 'contact',
		part: 'hit',
		source: owner.id,
		target: unit.id,
		ability,
		heal,
		hp: unit.hp,
		maxHp: unit.maxHp,
		point: { ...unit.body.position },
		ambient,
	})
}
export function balloonSoak(sim, owner, unit) {
	sim.apply(unit, 'balloon.soak', { source: owner.id })
}
export function balloonPop({ unit, owner, sim, tick, ticks, stats, present }) {
	if (unit.data.phase !== 'flight') return
	unit.data.phase = 'puddle'
	unit.until = tick + ticks(stats.puddle)
	const p = unit.body.position
	present({ type: 'impact', hero: owner.id, ability: 'balloon', point: { ...p }, hit: true })
	for (const ally of sim.heroes.filter((h) => !h.dead && h.team === owner.team))
		if (
			Math.hypot(ally.body.position.x - p.x, ally.body.position.z - p.z) <=
			stats.radius + ally.body.radius
		)
			balloonHeal(owner, ally, stats.healAmount, 'balloon', present)
	for (const target of sim.enemiesOf(owner.team)) {
		if (Math.hypot(target.x - p.x, target.z - p.z) > stats.radius + target.radius) continue
		sim.hit(
			{
				owner: owner.id,
				team: owner.team,
				ability: 'balloon',
				slot: unit.data.slot,
				isAbility: true,
				dx: 0,
				dz: 0,
				applies: ['balloon.soak'],
			},
			target,
			p,
		)
	}
}
