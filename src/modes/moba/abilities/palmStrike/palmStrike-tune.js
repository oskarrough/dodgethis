export default {
	damage: 85,
	range: 3,
	rate: 1,
	windup: 0.3,
	backswing: 0.16,
	radius: 0.35,
	juice: { impact: { count: 0 }, hit: { count: 0 } },
	impact: {
		flare: null,
		ripples: null,
		nudge: null,
		smear: { radius: 1.05, width: 0.36, sweep: 1.2, life: 0.14 },
		hold: 0.035,
		skid: 0.22,
	},
	sound: {
		cast: { freq: 120, slideTo: 190, type: 'triangle', dur: 0.18, gain: 0.1 },
		impact: { freq: 95, slideTo: 40, type: 'triangle', dur: 0.12, gain: 0.18 },
	},
}
