export default {
	name: 'Throw',
	kind: 'shot',
	projectileShape: 'ball',
	catchable: true,
	tell: 'line',
	held: 'line',
	aimAssist: true,
	effects: { cast: true, projectile: true, hit: true, pose: 'throwYoYo' },
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="ink-line" d="M6 38 L35 12"/><circle class="gold" cx="35" cy="12" r="9"/></svg>',
	card: {
		sentence: `Throws a yo-yo up to {range}; the first enemy hit takes {damage:damage} and is dragged to {dragDistance} in front of you.`,
	},
	stages: {
		hit: {
			after({ hero, ability, event, present }) {
				if (!event.shot?.hitEffects || !event.target || event.target.dead || hero.dead) return
				present({
					type: 'contact',
					part: 'reel',
					source: hero.id,
					target: event.target.id,
					ability: ability.id,
					point: { ...event.target.body.position },
				})
			},
		},
		release: [
			{
				deliver: 'shot',
				targets: 'enemies',
				hit: [
					'damage',
					{ effect: 'displace', to: 'source', distance: 'dragDistance', duration: 'dragTime' },
				],
			},
		],
	},
}
