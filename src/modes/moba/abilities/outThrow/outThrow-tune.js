export default {
	castPoint: 0.35,
	range: 14,
	speed: 12,
	radius: 0.35,
	damage: 60,
	cooldown: 3,
	deathRefund: 2,
	impact: {
		flare: { size: 1.4, streak: 2.2, life: 0.2, color: '#fff6dc' },
		spokes: {
			color: '#fffdf4',
			count: 10,
			from: 0.4,
			to: 1.5,
			inner: 0.4,
			width: 0.22,
			life: 0.26,
		},
		ripples: { count: 0, from: 0.5, to: 1.2, life: 0.2 },
		skid: 0.22,
		hold: 0.03,
	},
	sound: {
		cast: { freq: 250, slideTo: 440, type: 'triangle', dur: 0.15, gain: 0.08 },
		shot: { freq: 420, slideTo: 180, type: 'triangle', dur: 0.12, gain: 0.1 },
		hit: { freq: 300, slideTo: 540, type: 'sine', dur: 0.1, gain: 0.12 },
	},
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'outThrow.impact.spokes.from': 'm',
	'outThrow.impact.spokes.inner': 'fraction',
}
