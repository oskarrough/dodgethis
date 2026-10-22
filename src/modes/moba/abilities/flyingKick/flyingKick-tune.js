export default {
	castPoint: 0.3,
	range: 6,
	time: 0.3,
	damage: 100,
	radius: 0.4,
	cooldown: 7,
	sound: {
		cast: { freq: 170, slideTo: 620, type: 'sawtooth', dur: 0.26, gain: 0.1 },
		hit: { freq: 110, slideTo: 42, type: 'square', dur: 0.13, gain: 0.19 },
	},
}
