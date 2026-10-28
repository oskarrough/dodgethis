export default {
	statusEffects: [{ effect: 'slow', magnitude: 'slow', duration: 'duration' }],
	name: 'Tangle',
	kind: 'instant',
	tell: 'cone',
	held: 'cone',
	bot: 'cone',
	effects: { cast: true, impact: true, pose: 'tangle' },
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="tone" d="M24 40 L5 10 A30 30 0 0 1 43 10 Z"/><path class="ink-line" d="M12 18 Q36 32 24 12 Q10 32 36 22"/></svg>',
	card: {
		sentence: `A {range} cone in front of you deals {damage:damage} and a {slow} [[Slow]] for {duration}.`,
	},
	stages: {
		release: {
			do: [
				{
					deliver: 'area',
					from: 'self',
					shape: 'cone',
					targets: 'enemies',
					blockedBy: 'cover',
					hit: ['damage', 'slow'],
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
