export default {
	name: 'Around the world',
	kind: 'instant',
	tell: 'ring',
	held: 'circle',
	bot: 'radial',
	effects: { cast: true, impact: true, pose: 'aroundTheWorld' },
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle class="ink-line" cx="24" cy="24" r="16"/><circle class="gold" cx="40" cy="24" r="7"/></svg>',
	card: {
		summary: `Loop around Hook: enemy heroes within {radius} take {damage:damage} and are knocked {knockback} outward.`,
	},
	stages: {
		release: [
			{
				deliver: 'area',
				from: 'self',
				shape: 'circle',
				targets: 'enemyHero',
				hit: ['damage', 'knockback'],
			},
		],
	},
}
