export default {
	damage: 90,
	rate: 1,
	windup: 0.3,
	backswing: 0.25,
	range: 3.5,
	radius: 0.4,
	impact: {
		smear: { radius: 1.3, width: 0.3, sweep: 1.4, life: 0.16 },
		skid: 0.18,
		hold: 0.03,
	},
	sound: {
		cast: { freq: 230, slideTo: 280, type: 'triangle', dur: 0.18, gain: 0.1 },
		impact: { freq: 390, slideTo: 140, type: 'triangle', dur: 0.11, gain: 0.16 },
	},
	juice: {
		impact: { count: 4, speed: 1.8, life: 0.18, size: 0.09 },
	},
}
