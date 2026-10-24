export default {
	castPoint: 0.35,
	range: 14,
	speed: 12,
	radius: 0.35,
	damage: 60,
	cooldown: 3,
	deathRefund: 2,
	impact: {
		skid: 0.22,
		hold: 0.03,
	},
	sound: {
		cast: { freq: 250, slideTo: 440, type: 'triangle', dur: 0.15, gain: 0.08 },
		shot: { freq: 420, slideTo: 180, type: 'triangle', dur: 0.12, gain: 0.1 },
		hit: { freq: 300, slideTo: 540, type: 'sine', dur: 0.1, gain: 0.12 },
	},
}
