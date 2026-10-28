export default {
	castPoint: 0.3,
	range: 6,
	time: 0.22,
	damage: 100,
	radius: 0.45,
	cooldown: 7,
	// One broad ink-edged star gives the heel its decisive contact beat.
	juice: { impact: { count: 0 }, hit: { count: 0 } },
	impact: {
		flare: null,
		ripples: null,
		nudge: null,
		spokes: {
			count: 7,
			from: 0.5,
			to: 2.2,
			inner: 0.35,
			width: 0.22,
			life: 0.24,
			color: '#fff5de',
		},
		hold: 0.07,
		skid: 0.6,
	},
	sound: {
		cast: { freq: 170, slideTo: 620, type: 'sawtooth', dur: 0.26, gain: 0.1 },
		hit: { freq: 110, slideTo: 42, type: 'square', dur: 0.13, gain: 0.19 },
	},
}

export const units = {
	'flyingKick.impact.spokes.from': 'm',
	'flyingKick.impact.spokes.inner': 'fraction',
}
