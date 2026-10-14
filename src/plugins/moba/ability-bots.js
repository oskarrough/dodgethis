import { segmentClear } from './obstacles.js'
import { sweepHit } from './skillshot.js'

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

// Custom acts supplement the generic tools; false opts out of all of them.
export function botTactics(ability) {
	if (ability.bot === false) return new Set()
	if (typeof ability.bot === 'string') return new Set([ability.bot])
	const tactics = new Set()
	if (ability.kind === 'shot') tactics.add('shoot')
	if (ability.kind === 'zone') tactics.add('zone')
	if (ability.kind === 'dash') tactics.add('dash')
	if (ability.blinkTo) tactics.add('blink')
	if (ability.placesCover) tactics.add('cover')
	if (ability.kind === 'stance' && ability.catchesShots) tactics.add('catch')
	return tactics
}

export function abilityTactics(ctx) {
	const { h } = ctx
	if (ctx.skillsLocked || ctx.castBusy || h.cast || h.body.dashing) return null
	const tactics = ctx.abilities
		.filter(([, ability]) => ability.bot && typeof ability.bot === 'object')
		.sort(([, a], [, b]) => b.bot.priority - a.bot.priority)
	for (const [slot, ability] of tactics) {
		const acted = ability.bot.act(ctx, slot)
		if (acted) return acted
	}
	return null
}

export function botClearLine(from, to, target, heroes, radius, sim) {
	if (!segmentClear(from, to, radius, sim.obstacles, sim.bounds)) return false
	const contact = sweepHit(
		from.x,
		from.z,
		to.x,
		to.z,
		target.pos.x,
		target.pos.z,
		target.radius + radius,
	)
	return heroes.every((u) => {
		if (u.id === target.id || u.dead || distance(from, u.pos) < u.radius) return true
		const at = sweepHit(from.x, from.z, to.x, to.z, u.pos.x, u.pos.z, u.radius + radius)
		return at == null || (contact != null && at >= contact)
	})
}
