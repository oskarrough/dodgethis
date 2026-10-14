import { tune } from '../../tune.js'
export default {
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle class="tone" cx="24" cy="24" r="18"/><path class="cream" d="M17 12 H31 V36 H17 Z"/></svg>',
	name: 'Red light',
	kind: 'instant',
	tell: 'selfCircle',
	held: 'selfCircle',
	effects: { cast: 'redLightWindup', impact: 'redLightFreeze', pose: 'coachRed' },
	onRelease({ hero, sim, ability, tick, ticks, present }) {
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
			enemy.freezeUntil = Math.max(enemy.freezeUntil, tick + ticks(stats.duration))
			enemy.body.cancelDash()
			enemy.dashAbility = null
			present({
				type: 'freeze',
				source: hero.id,
				target: enemy.id,
				ability: ability.id,
				until: enemy.freezeUntil,
				point: { ...enemy.body.position },
			})
		}
	},
	card: {
		summary: () =>
			`Freeze enemy heroes moving faster than ${tune.redLight.movingSpeed} m/s within ${tune.redLight.radius} m for ${tune.redLight.duration} s. Standing still is safe.`,
	},
}
