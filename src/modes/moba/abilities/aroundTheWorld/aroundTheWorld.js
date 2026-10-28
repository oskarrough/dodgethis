export default {
	name: 'Around the world',
	kind: 'instant',
	tell: 'ring',
	held: 'circle',
	bot: 'radial',
	effects: { cast: true, impact: true, pose: 'aroundTheWorld' },
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle class="ink-line" cx="24" cy="24" r="16"/><circle class="gold" cx="40" cy="24" r="7"/></svg>',
	card: {
		sentence: `Loops the yo-yo around you: enemy heroes within {radius} take {damage:damage} and are [[knocked back|knockback]] {knockback}.`,
	},
	stages: {
		release: {
			do: [
				{
					deliver: 'area',
					from: 'self',
					shape: 'circle',
					targets: 'enemyHero',
					hit: ['damage', 'knockback'],
				},
			],
			after({ hero, ability, event, present }) {
				present({
					type: 'contact',
					part: 'sweep',
					source: hero.id,
					ability: ability.id,
					point: { ...hero.body.position },
					direction: { ...event.dir, y: 0 },
				})
			},
		},
	},
}
