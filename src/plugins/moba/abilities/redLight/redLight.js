import { tune } from '../../tune.js'
import { stateUntil } from '../../statuses.js'
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
	statuses: {
		freeze: {
			label: 'Freeze',
			tags: ['debuff', 'freeze'],
			states: ['frozen'],
			stack: 'independent',
			duration: ({ stats }) => stats.duration,
		},
	},
	onRelease({ hero, sim, ability, present }) {
		const p = hero.body.position,
			stats = ability.stats
		for (const enemy of sim.heroes) {
			if (
				enemy.dead ||
				enemy.team === hero.team ||
				Math.hypot(enemy.body.position.x - p.x, enemy.body.position.z - p.z) > stats.radius ||
				Math.hypot(enemy.body.velocity.x, enemy.body.velocity.z) <= stats.movingSpeed
			)
				continue
			sim.apply(enemy, 'redLight.freeze', { source: hero, duration: stats.duration })
			enemy.body.cancelDash()
			enemy.dashAbility = null
			present({
				type: 'contact',
				part: 'impact',
				source: hero.id,
				target: enemy.id,
				ability: ability.id,
				until: stateUntil(enemy, 'frozen'),
				point: { ...enemy.body.position },
			})
		}
	},
	card: {
		summary: () =>
			`Freeze enemy heroes moving faster than ${tune.redLight.movingSpeed} m/s within ${tune.redLight.radius} m for ${tune.redLight.duration} s. Standing still is safe.`,
	},
}
