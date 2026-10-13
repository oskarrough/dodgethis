export default {
	damage: 170, // 42.5 dps straight; two cushions reach 250, above Loose's 230, as the bank-shot reward
	castPoint: 0.3, // Same readable enemy tell as Loose; banking earns damage, not an unreactable release.
	range: 10, // path length, counted along every cushion
	speed: 20,
	radius: 0.35,
	cooldown: 4,
	bounce: { max: 2, damagePerCushion: 40 },
}
