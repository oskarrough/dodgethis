export default {
	// Keywords this folder's cards may name with [[Term]] (glossary.js).
	terms: {
		bruise: [
			'Bruise',
			'Takes {slam.bruiseDamage:damage} every {slam.bruiseEvery} for {slam.bruiseDuration}.',
		],
	},
	name: 'Slam',
	kind: 'instant',
	tell: 'circle',
	bot: false,
	effects: { cast: true, hit: true, impact: true, pose: 'wardenSlam' },
	statuses: {
		bruise: {
			label: 'Bruise',
			tags: ['debuff'],
			stack: 'refresh',
			on: {
				every: 'bruiseEvery',
				do: [{ effect: 'damage', amount: 'bruiseDamage', scale: null, periodic: true }],
			},
		},
	},
	card: {
		sentence: `After {castPoint}, slams for {damage:damage}, {splash:damage} to those nearby, and leaves a [[Bruise]].`,
	},
}
