export default {
	damage: 65,
	rate: 1,
	windup: 0.3,
	backswing: 0.12,
	range: 5,
	speed: 24,
	radius: 0.2,
	impact: {
		spokes: {
			count: 5,
			from: 0.25,
			to: 0.85,
			inner: 0.4,
			width: 0.09,
			life: 0.14,
			color: '#e8fbff',
		},
		skid: 0.2,
		hold: 0.025,
	},
	sound: {
		cast: { freq: 630, slideTo: 420, type: 'sine', dur: 0.09, gain: 0.09 },
		shot: { freq: 950, slideTo: 650, type: 'sine', dur: 0.08, gain: 0.1 },
		hit: { freq: 350, slideTo: 180, type: 'triangle', dur: 0.11, gain: 0.12 },
	},
	juice: {
		cast: { count: 0, speed: 0.8, life: 0.15, size: 0.07 },
		shot: { count: 0, speed: 1.2, life: 0.15, size: 0.06 },
		hit: { count: 0, speed: 1.8, life: 0.25, size: 0.08 },
	},
}

export const units = {
	'waterFlick.impact.spokes.from': 'm',
	'waterFlick.impact.spokes.inner': 'fraction',
}
