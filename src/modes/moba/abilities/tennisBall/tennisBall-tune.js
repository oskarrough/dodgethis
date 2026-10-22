export default {
	damage: 70,
	range: 5,
	rate: 1,
	windup: 0.3,
	backswing: 0.25,
	speed: 16,
	radius: 0.2,
	sound: {
		cast: { freq: 330, slideTo: 440, type: 'triangle', dur: 0.06, gain: 0.08 },
		shot: { freq: 600, slideTo: 240, type: 'triangle', dur: 0.07, gain: 0.1 },
		hit: { freq: 240, slideTo: 120, type: 'triangle', dur: 0.06, gain: 0.1 },
	},
}
