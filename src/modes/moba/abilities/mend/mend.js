export default {
	name: 'Mend',
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="tone" d="M18 6 H30 V18 H42 V30 H30 V42 H18 V30 H6 V18 H18 Z"/></svg>',
	kind: 'instant',
	castColor: '#1fae4a',
	bot: false,
	tell: 'circle',
	held: 'circle',
	effects: { cast: true, impact: true, pose: 'menderMend' },
	stages: {
		release: [
			{
				deliver: 'target',
				pick: 'nearestAim',
				targets: 'ally',
				range: 'range',
				hit: [
					{
						effect: 'heal',
						amount: 'healAmount',
						critChance: 'critChance',
						critMultiplier: 'critMultiplier',
						scale: null,
					},
				],
			},
		],
	},
	card: {
		summary: `Cast for {castPoint} to heal the ally nearest your aim within {range} for {healAmount}. {critChance} chance to heal {critMultiplier}.`,
	},
}
