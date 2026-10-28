export default {
	damage: 90,
	rate: 1,
	windup: 0.3,
	backswing: 0.18,
	range: 3.5,
	radius: 0.4,
	impact: {
		flare: null,
		spokes: { count: 4, to: 0.85, width: 0.16, life: 0.12 },
		skid: 0.18,
		hold: 0.04,
	},
	sound: {
		cast: { freq: 230, slideTo: 280, type: 'triangle', dur: 0.18, gain: 0.1 },
		impact: { freq: 390, slideTo: 140, type: 'triangle', dur: 0.11, gain: 0.16 },
	},
	juice: {
		impact: { count: 0, speed: 1.8, life: 0.18, size: 0.09 },
	},
}
