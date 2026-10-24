import { tune } from '../../tune.js'
import { botClearLine } from '../../ability-bots.js'
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
export default {
	statusEffects: [{ effect: 'slow', magnitude: 'slow', duration: 'duration' }],
	projectileShape: 'ball',
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle class="cream" cx="24" cy="24" r="14"/><path class="ink-line" d="M12 14 Q24 24 12 34 M36 14 Q24 24 36 34"/></svg>',
	name: 'Pass',
	kind: 'shot',
	bot: {
		priority: 10,
		act(ctx, slot) {
			const { h, p, own, enemies, cast, frame, sim } = ctx
			const hurt = own
				.filter(
					(u) =>
						u.id !== h.id &&
						u.maxHp - u.hp >= tune.pass.healAmount * tune.pass.bot.deficit &&
						distance(p, u.pos) <= tune.pass.range,
				)
				.sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp || a.id.localeCompare(c.id))
			for (const ally of hurt) {
				const lead = tune.pass.castPoint + distance(p, ally.pos) / tune.pass.speed
				const aim = { x: ally.pos.x + ally.vel.x * lead, z: ally.pos.z + ally.vel.z * lead }
				if (
					distance(p, aim) <= tune.pass.range &&
					botClearLine(
						p,
						aim,
						{ ...ally, pos: aim },
						[...own, ...enemies],
						tune.pass.radius,
						sim,
					) &&
					cast(slot, aim)
				)
					return frame
			}
			// Keep Pass for an injured ally rather than spending it on poke behind a blocked heal.
			if (hurt.length) ctx.shoot = () => false
			return null
		},
	},
	heroOnly: true,
	pierce: false,
	catchable: true,
	aimAssist: true,
	tell: 'line',
	held: 'line',
	effects: { cast: 'passWindup', projectile: 'passBall', hit: 'passHit', pose: 'coachPass' },
	card: {
		sentence: `Throws a ball up to {range}: the first hero hit is healed {healAmount} if an ally, or takes {damage:damage} and a {slow} [[Slow]] for {duration} if an enemy.`,
	},
	stages: {
		release: [
			{
				deliver: 'shot',
				targets: 'heroes',
				allies: [{ effect: 'heal', amount: 'healAmount', scale: null }],
				enemies: ['damage', 'slow'],
			},
		],
	},
}
