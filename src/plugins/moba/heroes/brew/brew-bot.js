import { STEP } from '../../../../core/app.js'
import { tune } from '../../tune.js'
import { sweepHit } from '../../obstacles.js'
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
// Only Brew's own HP is live; targets and threats come from the delayed public view.
export function brewBot(ctx) {
	const { h, p, now, frame, enemies, perceived, cast, safe } = ctx
	// The generic chase dash ignores first-body contact; Brew owns every kick.
	ctx.dashAbility = null
	const b = tune.heroes.brew.bot
	const memory = (h.brewBot ??= { hp: h.hp, tick: now, burst: 0 })
	if (now - memory.tick > b.burstWindow / STEP) memory.burst = 0
	if (h.hp < memory.hp) {
		memory.burst += memory.hp - h.hp
		memory.tick = now
	}
	memory.hp = h.hp
	const stagger = h.abilityState.stagger
	if (h.channel?.ability === 'swig' || h.cast || h.body.dashing) return frame
	if (!ctx.skillsLocked && !h.stance && memory.burst >= h.maxHp * b.burstHp && cast('slot2', p)) {
		memory.burst = 0
		return frame
	}
	const closest = (at) => Math.min(...enemies.map((u) => distance(u.pos, at)))
	const inTowerRange = perceived.structures?.some(
		(u) =>
			!u.dead &&
			u.team !== h.team &&
			u.kind === 'tower' &&
			distance(u.pos, p) <= tune.tower.range + h.body.radius,
	)
	const underThreat =
		closest(p) <= b.safeRange ||
		perceived.minions?.some(
			(u) => !u.dead && u.team !== h.team && u.target === h.id && distance(u.pos, p) <= b.safeRange,
		)
	if (
		!ctx.skillsLocked &&
		!h.stance &&
		!inTowerRange &&
		((memory.burst >= h.maxHp * b.burstHp && underThreat) ||
			(stagger.pool > 0 &&
				stagger.ended != null &&
				now - stagger.ended <= b.afterStagger / STEP)) &&
		cast('slot3', p)
	) {
		memory.burst = 0
		return frame
	}
	if (!ctx.skillsLocked && h.hp < h.maxHp * tune.bots.meleeRetreatHp) {
		const minion = perceived.minions
			?.filter(
				(u) =>
					!u.dead &&
					distance(u.pos, p) <= tune.flyingKick.range &&
					closest(u.pos) > closest(p) + b.escapeGain,
			)
			.sort((a, c) => closest(c.pos) - closest(a.pos))[0]
		if (minion && cast('slot1', minion.pos)) return frame
	}
	if (!ctx.skillsLocked && h.hp >= h.maxHp * tune.bots.meleeRetreatHp) {
		const target = enemies
			.filter(
				(u) => distance(u.pos, p) <= tune.flyingKick.range && distance(u.pos, p) > b.engageMin,
			)
			.sort((a, c) => distance(a.pos, p) - distance(c.pos, p))[0]
		if (target && safe(target.pos, [target])) {
			const first = [
				...perceived.heroes,
				...(perceived.minions ?? []),
				...(perceived.structures ?? []),
			]
				.filter((u) => u.id !== h.id && !u.dead)
				.map((u) => ({
					unit: u,
					at: sweepHit(
						p.x,
						p.z,
						target.pos.x,
						target.pos.z,
						u.pos.x,
						u.pos.z,
						h.body.radius + u.radius,
					),
				}))
				.filter((contact) => contact.at != null)
				.sort((a, c) => a.at - c.at || a.unit.id.localeCompare(c.unit.id))[0]
			if (first?.unit.id === target.id && cast('slot1', target.pos)) return frame
		}
	}
	return null
}
