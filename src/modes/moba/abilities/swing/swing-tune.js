export default {
	damage: 150,
	cooldown: 1.5,
	range: 2.5,
	radius: 2.5,
	angle: 70,
	castPoint: 0.4,
	impact: {
		rings: [{ color: '#e0473f', from: 0.4, to: 1.3, life: 0.25, width: 0.14 }],
		flash: 0.1,
		squash: 0.35,
		shake: { amount: 0.12, range: 8 },
	},
	sound: {
		cast: { freq: 160, slideTo: 85, dur: 0.18, gain: 0.18, type: 'triangle' },
		hit: { freq: 90, slideTo: 45, dur: 0.12, gain: 0.22, type: 'triangle' },
	},
}
