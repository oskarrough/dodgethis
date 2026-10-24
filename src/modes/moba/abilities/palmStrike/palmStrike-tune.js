export default {
	damage: 85,
	range: 3,
	rate: 1,
	windup: 0.3,
	backswing: 0.25,
	radius: 0.35,
	impact: {
		smear: { radius: 0.95, width: 0.36, sweep: 1.6, life: 0.16 },
		skid: 0.18,
	},
	sound: {
		cast: { freq: 120, slideTo: 190, type: 'triangle', dur: 0.18, gain: 0.1 },
		impact: { freq: 95, slideTo: 40, type: 'triangle', dur: 0.12, gain: 0.18 },
	},
}
