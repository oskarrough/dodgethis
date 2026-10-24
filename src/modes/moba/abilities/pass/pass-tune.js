export default {
	damage: 90,
	healAmount: 180,
	castPoint: 0.3,
	range: 10,
	speed: 20,
	radius: 0.4,
	slow: 0.25,
	duration: 1,
	cooldown: 3,
	bot: { deficit: 0.6 },
	juice: { contact: { hit: { count: 5, speed: 0.8, life: 0.5, size: 0.1 } } },
	impact: {
		skid: 0.22,
		hold: 0.03,
	},
	sound: {
		cast: { freq: 400, slideTo: 640, type: 'sine', dur: 0.12, gain: 0.1 },
		shot: { freq: 750, slideTo: 300, type: 'triangle', dur: 0.1, gain: 0.12 },
		hit: { freq: 500, slideTo: 900, type: 'sine', dur: 0.16, gain: 0.12 },
	},
}
