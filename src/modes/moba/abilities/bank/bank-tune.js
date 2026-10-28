export default {
	damage: 170, // 42.5 dps straight; two cushions reach 250, above Loose's 230, as the bank-shot reward
	castPoint: 0.3, // Same readable enemy tell as Loose; banking earns damage, not an unreactable release.
	range: 10, // path length, counted along every cushion
	speed: 20,
	radius: 0.35,
	cooldown: 4,
	bounce: { max: 2, damagePerCushion: 40 },
	sound: {
		cast: { freq: 180, slideTo: 260, type: 'triangle', dur: 0.08, gain: 0.1 },
		shot: { freq: 700, slideTo: 360, type: 'triangle', dur: 0.06, gain: 0.16 },
		hit: { freq: 940, slideTo: 420, type: 'triangle', dur: 0.09, gain: 0.18 },
	},
	juice: { hit: { count: 0, speed: 0, life: 0.1, size: 0.1 } },
	impact: {
		flare: null,
		ripples: null,
		spokes: { count: 3, from: 0.3, to: 1.4, width: 0.15, life: 0.18, color: '#fff1c9' },
		skid: 0.35,
		hold: 0.05,
	},
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'bank.impact.spokes.from': 'm',
	'bank.bounce.max': 'count',
}
