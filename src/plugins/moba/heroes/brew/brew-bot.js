import { STEP } from '../../../../core/app.js'
import { tune } from '../../tune.js'
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
// Only Brew's own HP is live; targets and threats come from the delayed public view.
export function brewBot(ctx) {
	const { h, p, now, frame, enemies, perceived, cast, safe } = ctx
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
	if (
		!ctx.skillsLocked &&
		((h.hp < h.maxHp * b.hurtHp && closest(p) > b.safeRange) ||
			(stagger.pool > 0 &&
				stagger.ended != null &&
				now - stagger.ended <= b.afterStagger / STEP)) &&
		cast('slot3', p)
	)
		return frame
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
		if (target && safe(target.pos, [target]) && cast('slot1', target.pos)) return frame
	}
	return null
}
