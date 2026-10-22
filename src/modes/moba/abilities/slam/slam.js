export default {
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
}
