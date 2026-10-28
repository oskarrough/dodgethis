export default {
	damage: 80,
	castPoint: 0.3,
	range: 10,
	speed: 24,
	radius: 0.4,
	cooldown: 9,
	dragDistance: 1.5,
	dragTime: 0.24,
	impact: {
		flare: null,
		ripples: { count: 1, from: 0.9, to: 0.45, life: 0.16, width: 0.1 },
		skid: 0.14,
		hold: 0.045,
	},
	sound: {
		cast: { freq: 310, slideTo: 720, type: 'sine', dur: 0.22, gain: 0.12 },
		shot: { freq: 790, slideTo: 210, type: 'sine', dur: 0.16, gain: 0.2 },
		hit: { freq: 280, slideTo: 85, type: 'square', dur: 0.13, gain: 0.2 },
	},
	juice: {
		shot: { count: 0, speed: 2.6, life: 0.24, size: 0.08 },
		hit: { count: 0, speed: 1.6, life: 0.35, size: 0.11 },
	},
}
