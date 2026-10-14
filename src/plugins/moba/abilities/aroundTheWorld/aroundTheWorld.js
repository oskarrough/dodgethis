import { tune } from '../../tune.js'

export default {
	name: 'Around the world',
	kind: 'instant',
	tell: 'ring',
	held: 'circle',
	bot: 'radial',
	effects: { cast: true, impact: true, pose: 'aroundTheWorld' },
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle class="ink-line" cx="24" cy="24" r="16"/><circle class="gold" cx="40" cy="24" r="7"/></svg>',
	card: {
		summary: () =>
			`Loop around Hook: enemy heroes within ${tune.aroundTheWorld.radius} m take ${tune.aroundTheWorld.damage} damage and are knocked ${tune.aroundTheWorld.knockback} m outward.`,
	},
	onRelease({ hero, sim, ability, slot, dir, present }) {
		const p = hero.body.position
		const stats = ability.stats
		let hit = false
		for (const target of sim.enemiesOf(hero.team)) {
			if (!target.hero || target.unit.dead) continue
			const dx = target.x - p.x,
				dz = target.z - p.z
			const length = Math.hypot(dx, dz)
			if (length > stats.radius) continue
			const outward = length > 0 ? { x: dx / length, z: dz / length } : dir
			sim.hit(
				{
					owner: hero.id,
					team: hero.team,
					ability: ability.id,
					slot,
					isAbility: true,
					dx: outward.x,
					dz: outward.z,
					damage: stats.damage * (1 + tune.levels.growth * (hero.level - 1)),
				},
				target,
				target,
			)
			sim.displace(
				target.unit,
				{ x: target.x + outward.x * stats.knockback, z: target.z + outward.z * stats.knockback },
				stats.time,
			)
			hit = true
		}
		present({
			type: 'impact',
			hero: hero.id,
			ability: ability.id,
			hit,
			point: { ...p },
			direction: { ...dir, y: 0 },
		})
	},
}
