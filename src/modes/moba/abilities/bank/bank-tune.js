export default {
	damage: 170, // 42.5 dps straight; two cushions reach 250, above Loose's 230, as the bank-shot reward
	castPoint: 0.3, // Same readable enemy tell as Loose; banking earns damage, not an unreactable release.
	range: 10, // path length, counted along every cushion
	speed: 20,
	radius: 0.35,
	cooldown: 4,
	bounce: { max: 2, damagePerCushion: 40 },
	impact: {
		flare: { size: 2, streak: 4, life: 0.24, color: '#fff1c9' },
		ripples: { count: 2, from: 0.5, to: 1.5, life: 0.3, gap: 0.06, width: 0.08 },
		skid: 0.35,
		hold: 0.05,
	},
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'bank.bounce.max': 'count',
}
