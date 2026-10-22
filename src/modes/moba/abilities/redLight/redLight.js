import { tune } from '../../tune.js'
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
export default {
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle class="tone" cx="24" cy="24" r="18"/><path class="cream" d="M17 12 H31 V36 H17 Z"/></svg>',
	name: 'Red light',
	kind: 'instant',
	bot: {
		priority: 20,
		act(ctx, slot) {
			const { p, enemies, cast, frame } = ctx
			if (
				enemies.filter(
					(u) =>
						distance(p, u.pos) <= tune.redLight.radius &&
						Math.hypot(u.vel.x, u.vel.z) > tune.redLight.movingSpeed,
				).length >= tune.redLight.bot.enemies &&
				cast(slot, p)
			)
				return frame
			return null
		},
	},
	tell: 'selfCircle',
	held: 'selfCircle',
	effects: { cast: 'redLightWindup', impact: 'redLightFreeze', pose: 'coachRed' },
	statusEffects: [{ effect: 'freeze', duration: 'duration' }],
	stages: {
		release: [
			{
				deliver: 'area',
				from: 'self',
				shape: 'circle',
				targets: 'enemyHero',
				where: ({ target, stats }) =>
					Math.hypot(target.body.velocity.x, target.body.velocity.z) > stats.movingSpeed,
				hit: ['freeze'],
			},
		],
	},
	card: {
		summary: `Freeze enemy heroes moving faster than {movingSpeed} within {radius} for {duration}. Standing still is safe.`,
	},
}
