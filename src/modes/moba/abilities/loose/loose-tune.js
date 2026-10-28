export default {
	damage: 230, // about 2.5 autos: worth the aim, the miss risk and Kappa's catch
	castPoint: 0.3,
	range: 11,
	speed: 24, // The 0.3 s draw stays readable; the released shaft reaches 8 m in a third of a second.
	radius: 0.3,
	cooldown: 4,
	view: {
		lean: 0.38,
		tilt: 0.3,
		reach: 0.64,
		spacing: 0.3,
		scale: 0.65,
		life: 0.24,
		width: 0.12,
		radius: 0.65,
		ground: 0.16,
		height: 0.85,
	},
	juice: { shot: { count: 0 }, hit: { count: 0 } },
	// A loosed arrow hits like a thrown spear: a long flare along the shot, a hard stop, a skid.
	impact: {
		flare: { size: 2.2, streak: 4, life: 0.18, color: '#fff1c9' },
		hold: 0.045,
		skid: 0.3,
		nudge: { amount: 0.35, range: 14 },
	},
}
