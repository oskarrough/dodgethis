export default {
	damage: 65,
	rate: 1,
	windup: 0.3,
	backswing: 0.2,
	range: 5,
	speed: 18,
	radius: 0.2,
	sound: {
		cast: { freq: 630, slideTo: 420, type: 'sine', dur: 0.09, gain: 0.09 },
		shot: { freq: 950, slideTo: 650, type: 'sine', dur: 0.08, gain: 0.1 },
		hit: { freq: 350, slideTo: 180, type: 'triangle', dur: 0.11, gain: 0.12 },
	},
	juice: {
		cast: { count: 3, speed: 0.8, life: 0.15, size: 0.07 },
		shot: { count: 3, speed: 1.2, life: 0.15, size: 0.06 },
		hit: { count: 6, speed: 1.8, life: 0.25, size: 0.08 },
	},
}
