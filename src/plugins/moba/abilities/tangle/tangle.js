import { tune } from '../../tune.js'
import { segmentClear } from '../../obstacles.js'

export default {
	statuses: {
		slow: {
			label: 'Slow',
			tags: ['debuff', 'slow'],
			stack: 'independent',
			moveSpeed: ({ stats }) => Math.max(0, Math.min(1, 1 - stats.slow)),
			duration: ({ stats }) => stats.duration,
		},
	},
	name: 'Tangle',
	kind: 'instant',
	tell: 'cone',
	held: 'cone',
	bot: 'cone',
	effects: { cast: true, impact: true, pose: 'tangle' },
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="tone" d="M24 40 L5 10 A30 30 0 0 1 43 10 Z"/><path class="ink-line" d="M12 18 Q36 32 24 12 Q10 32 36 22"/></svg>',
	card: {
		summary: () =>
			`A ${tune.tangle.angle}° cone deals ${tune.tangle.damage} damage and slows by ${Math.round(tune.tangle.slow * 100)}% for ${tune.tangle.duration} s. Follow Throw with this.`,
	},
	onRelease({ hero, sim, ability, dir, slot, present }) {
		const stats = ability.stats
		const p = hero.body.position
		let hit = false
		for (const target of sim.enemiesOf(hero.team)) {
			const dx = target.x - p.x,
				dz = target.z - p.z
			const length = Math.hypot(dx, dz)
			if (
				target.unit.dead ||
				length > stats.range ||
				(length > 0 && (dx * dir.x + dz * dir.z) / length < Math.cos((stats.angle * Math.PI) / 360))
			)
				continue
			if (
				!segmentClear(
					p,
					target,
					0,
					sim.obstacles.filter((o) => o.id !== target.id),
					sim.bounds,
				)
			)
				continue
			sim.hit(
				{
					owner: hero.id,
					team: hero.team,
					ability: ability.id,
					slot,
					isAbility: true,
					dx: dir.x,
					dz: dir.z,
					damage: stats.damage * (1 + tune.levels.growth * (hero.level - 1)),
					applies: [{ key: 'tangle.slow', mag: 1 - stats.slow, duration: stats.duration }],
				},
				target,
				target,
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
