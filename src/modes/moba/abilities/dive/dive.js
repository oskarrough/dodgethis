// E: a dash that catches shots all around on the way, then leaves the diver prone.
export default {
	kind: 'dash',
	icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect class="tone" x="12" y="20" width="22" height="15" rx="5" transform="rotate(-18 23 27)"/><path class="tone" d="M34 14 L44 10 L40 20 Z"/><path class="ink-line" d="M4 38 L14 38 M6 44 L20 44"/></svg>',
	statuses: {
		prone: {
			label: 'Prone',
			states: ['prone'],
			stack: 'replace',
			duration: 'prone',
		},
	},
	catchesShots: true,
	acceptBall: false,
	held: 'arrow',
	effects: { cast: 'dive', effect: 'dive', pose: 'dive' },
	card: {
		summary: 'Dive toward your aim, catching shots all around on the way, then lie prone.',
	},
	stages: {
		release: [
			{
				effect: 'catch',
				duration: 'time',
				linger: 'prone',
				radius: 'radius',
				angle: 'angle',
				acceptBall: false,
			},
		],
		dashEnd: [
			{ effect: 'status', key: 'prone' },
			{ effect: 'catch', duration: 'prone', refresh: true },
		],
	},
}
