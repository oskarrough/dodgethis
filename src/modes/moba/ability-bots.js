import { segmentClear } from './obstacles.js'
import { sweepHit } from './skillshot.js'

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const hasEffect = (action, effect) =>
	action.hit.some((record) => (typeof record === 'string' ? record : record.effect) === effect)

function saveDelivery(ability) {
	const release = ability.stages?.release
	return (Array.isArray(release) ? release : release?.do)?.find(
		(action) =>
			action.deliver === 'target' &&
			action.pick === 'nearestAim' &&
			action.targets === 'ally' &&
			(hasEffect(action, 'heal') || hasEffect(action, 'shield')),
	)
}

// Custom acts supplement the generic tools; false opts out of all of them.
export function botTactics(ability) {
	if (ability.bot === false) return new Set()
	if (typeof ability.bot === 'string') return new Set([ability.bot])
	const tactics = new Set()
	if (saveDelivery(ability)) tactics.add('save')
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

export function saveTactics(ctx) {
	const { h } = ctx
	if (ctx.skillsLocked || ctx.castBusy || h.cast || h.body.dashing) return null
	const saves = ctx.abilities
		.filter(([slot]) => ctx.tactics.get(slot).has('save'))
		.map(([slot, ability]) => ({ slot, ability, delivery: saveDelivery(ability) }))
		// A zero-cooldown heal must not starve a ready shield.
		.sort(
			(a, b) => Number(hasEffect(b.delivery, 'shield')) - Number(hasEffect(a.delivery, 'shield')),
		)
	for (const { slot, ability, delivery } of saves) {
		const stats = ability.stats
		const shield = hasEffect(delivery, 'shield')
		const hurt = ctx.own
			.filter(
				(ally) =>
					ally.id !== h.id &&
					ally.hp > 0 &&
					distance(ctx.p, ally.pos) <= stats[delivery.range] &&
					(shield
						? !ally.shielded &&
							ally.hp / ally.maxHp < stats.bot.saveHp &&
							ctx.enemies.some((enemy) => distance(enemy.pos, ally.pos) <= stats.bot.dangerRange)
						: ally.maxHp - ally.hp >= stats.healAmount * stats.bot.deficit),
			)
			.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id.localeCompare(b.id))
		for (const ally of hurt) if (ctx.cast(slot, ally.pos)) return ctx.frame
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
