import { tune } from '../../tune.js'
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
	projectileShape: 'ball',
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle class="cream" cx="24" cy="24" r="14"/><path class="ink-line" d="M12 14 Q24 24 12 34 M36 14 Q24 24 36 34"/></svg>',
	name: 'Pass',
	kind: 'shot',
	heal: true,
	heroOnly: true,
	pierce: false,
	catchable: true,
	aimAssist: true,
	tell: 'line',
	held: 'line',
	effects: { cast: 'passWindup', projectile: 'passBall', hit: 'passHit', pose: 'coachPass' },
	card: {
		summary: () =>
			`First hero hit: heal an ally for ${tune.pass.healAmount}, or deal ${tune.pass.damage} and slow an enemy.`,
	},
	projectileStats({ ability }) {
		const { slow, duration } = ability.stats
		return { applies: slow ? [{ key: 'pass.slow', mag: 1 - slow, duration }] : [] }
	},
	onHit({ hero, target, shot, present }) {
		if (target.unit.team !== hero.team) return false
		const ally = target.unit
		const heal = Math.min(ally.maxHp - ally.hp, shot.healAmount ?? tune.pass.healAmount)
		ally.hp += heal
		present({
			type: 'contact',
			part: 'hit',
			source: hero.id,
			target: ally.id,
			ability: shot.ability,
			projectile: shot.id,
			heal,
			hp: ally.hp,
			maxHp: ally.maxHp,
			point: { ...ally.body.position },
		})
		return true
	},
}
