export default {
	name: 'Ward',
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="tone" d="M24 5 L41 12 V25 Q41 37 24 44 Q7 37 7 25 V12 Z"/><path class="cream" d="M22 14 H26 V33 H22 Z"/></svg>',
	kind: 'instant',
	tell: 'circle',
	held: 'circle',
	effects: { cast: true, impact: true, pose: 'menderWard' },
	statusEffects: [{ effect: 'shield', amount: 'shield', duration: 'duration' }],
	stages: {
		release: [
			{ deliver: 'target', pick: 'nearestAim', targets: 'ally', range: 'range', hit: ['shield'] },
		],
	},
	card: {
		sentence: `Gives the ally nearest your aim within {range} a {shield:HP} [[Shield]] for {duration}.`,
	},
}
