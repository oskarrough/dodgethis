export default {
	name: 'Throw',
	kind: 'shot',
	catchable: true,
	tell: 'line',
	held: 'line',
	aimAssist: true,
	effects: { cast: true, projectile: true, hit: true, pose: 'throwYoYo' },
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="ink-line" d="M6 38 L35 12"/><circle class="gold" cx="35" cy="12" r="9"/></svg>',
	card: {
		summary: `The first body takes {damage:damage} and is dragged to {dragDistance} in front of Hook. Cover and structures stop the yo-yo; caught returns carry no drag.`,
	},
	stages: {
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
