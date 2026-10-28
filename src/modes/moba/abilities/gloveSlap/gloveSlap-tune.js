export default {
	damage: 130,
	rate: 1,
	windup: 0.3,
	backswing: 0.25,
	range: 3.5,
	radius: 0.35,
	critEvery: 3,
	critMultiplier: 1.5,
	// One hard flat mark: the wide arc the glove draws, and a short spray of strokes where it lands.
	impact: {
		smear: { radius: 1.8, width: 0.5, sweep: 1.7, life: 0.17, y: 0.7 },
		spokes: { color: '#fff7e6', count: 7, from: 0.5, to: 1.5, inner: 0.4, width: 0.26, life: 0.16 },
		flare: { size: 1.2, streak: 2.2, life: 0.16, color: '#fff1c9' },
		ripples: { count: 0, from: 0.5, to: 1.2, life: 0.2 },
		skid: 0.34,
		hold: 0.05,
	},
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'gloveSlap.impact.spokes.from': 'm',
	'gloveSlap.impact.spokes.inner': 'fraction',
}
