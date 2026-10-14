export default {
	castPoint: 0.5,
	range: 0,
	radius: 5,
	movingSpeed: 0.5,
	duration: 1.25,
	cooldown: 12,
	juice: { impact: { count: 8, speed: 0.2, life: 0.4, size: 0.12 } },
	sound: {
		cast: { freq: 1000, slideTo: 650, type: 'square', dur: 0.18, gain: 0.08 },
		impact: { freq: 680, slideTo: 200, type: 'square', dur: 0.12, gain: 0.1 },
	},
}
