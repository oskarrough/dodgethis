export default {
	damage: 70,
	range: 5,
	rate: 1,
	windup: 0.3,
	backswing: 0.25,
	speed: 16,
	radius: 0.2,
	// One short flat mark where the ball lands: eight strokes round a small flare. The windup coil and the cream arc
	// of the hand live in the hero's view.
	impact: {
		flare: { size: 1.1, streak: 1.8, life: 0.16, color: '#fff6dc' },
		spokes: { color: '#fffdf4', count: 8, from: 0.3, to: 1.1, inner: 0.35, width: 0.2, life: 0.2 },
		ripples: { count: 0, from: 0.5, to: 1.2, life: 0.2 },
		skid: 0.18,
		hold: 0,
	},
	sound: {
		cast: { freq: 330, slideTo: 440, type: 'triangle', dur: 0.06, gain: 0.08 },
		shot: { freq: 600, slideTo: 240, type: 'triangle', dur: 0.07, gain: 0.1 },
		hit: { freq: 240, slideTo: 120, type: 'triangle', dur: 0.06, gain: 0.1 },
	},
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'tennisBall.impact.spokes.from': 'm',
	'tennisBall.impact.spokes.inner': 'fraction',
}
