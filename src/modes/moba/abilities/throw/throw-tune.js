export default {
	damage: 80,
	castPoint: 0.4,
	range: 10,
	speed: 18,
	radius: 0.4,
	cooldown: 9,
	dragDistance: 1.5,
	dragTime: 0.35,
	impact: {
		skid: 0.25,
		hold: 0.03,
	},
	sound: {
		cast: { freq: 310, slideTo: 720, type: 'sine', dur: 0.3, gain: 0.12 },
		shot: { freq: 790, slideTo: 210, type: 'sine', dur: 0.16, gain: 0.2 },
		hit: { freq: 280, slideTo: 85, type: 'square', dur: 0.13, gain: 0.2 },
	},
	juice: {
		shot: { count: 5, speed: 2.6, life: 0.24, size: 0.08 },
		hit: { count: 10, speed: 1.6, life: 0.35, size: 0.11 },
	},
}
