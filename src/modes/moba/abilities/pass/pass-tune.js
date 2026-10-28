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
	// A hero hit takes the ball and a quick burst of strokes. An ally catches it: the shared hit never fires for them, so
	// the catch has its own recipe (a soft bloom, a ring and a squash, never a skid or a pause).
	impact: {
		flare: { size: 1.5, streak: 2.4, life: 0.2, color: '#fff6dc' },
		spokes: { color: '#fffdf4', count: 9, from: 0.4, to: 1.4, inner: 0.4, width: 0.22, life: 0.24 },
		ripples: { count: 0, from: 0.5, to: 1.2, life: 0.2 },
		skid: 0.22,
		hold: 0.03,
	},
	healImpact: {
		flare: { size: 1.5, streak: 0, life: 0.3, color: '#e6ffe9', y: 1.1 },
		spokes: { color: '#d8ffe4', count: 7, from: 0.3, to: 1.1, inner: 0.5, width: 0.24, life: 0.28 },
		ripples: { count: 1, from: 0.4, to: 1.3, life: 0.34, width: 0.07, color: '#e6ffe9' },
		squash: 0.18,
	},
	sound: {
		cast: { freq: 400, slideTo: 640, type: 'sine', dur: 0.12, gain: 0.1 },
		shot: { freq: 750, slideTo: 300, type: 'triangle', dur: 0.1, gain: 0.12 },
		hit: { freq: 500, slideTo: 900, type: 'sine', dur: 0.16, gain: 0.12 },
	},
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'pass.impact.spokes.from': 'm',
	'pass.impact.spokes.inner': 'fraction',
	'pass.healImpact.spokes.from': 'm',
	'pass.healImpact.spokes.inner': 'fraction',
}
