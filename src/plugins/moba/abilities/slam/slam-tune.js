export default {
	damage: 700,
	splash: 350,
	radius: 4,
	castPoint: 2.5,
	bruiseDamage: 50,
	bruiseEvery: 1,
	bruiseDuration: 6,
	sound: {
		cast: { freq: 70, slideTo: 180, dur: 0.6, gain: 0.2, type: 'sine' },
		hit: { freq: 55, slideTo: 25, dur: 0.25, gain: 0.25, type: 'triangle' },
		impact: { freq: 40, slideTo: 20, dur: 0.4, gain: 0.3, type: 'sine' },
	},
}
