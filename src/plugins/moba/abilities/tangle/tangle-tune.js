export default {
	damage: 110,
	castPoint: 0.3,
	range: 3.5,
	radius: 3.5,
	angle: 90,
	slow: 0.4,
	duration: 1.5,
	cooldown: 6,
	sound: {
		cast: { freq: 180, slideTo: 460, type: 'triangle', dur: 0.24, gain: 0.13 },
		impact: { freq: 420, slideTo: 110, type: 'sawtooth', dur: 0.18, gain: 0.17 },
	},
	juice: {
		impact: { count: 16, speed: 2.2, life: 0.32, size: 0.07 },
	},
}
