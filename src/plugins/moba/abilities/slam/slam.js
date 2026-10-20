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
			periodic: {
				interval: ({ stats }) => stats.bruiseEvery,
				onTick({ unit, status, stats, sim }) {
					sim.hit(
						{
							id: -1,
							owner: status.src,
							team: 'B',
							slot: 'slot2',
							ability: 'slam',
							damage: stats.bruiseDamage,
							dx: 0,
							dz: 0,
							periodic: true,
							status: status.key,
						},
						{ id: unit.id, unit, hero: true },
						unit.body.position,
					)
				},
			},
		},
	},
}
