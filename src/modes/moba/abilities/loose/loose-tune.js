export default {
	damage: 230, // about 2.5 autos: worth the aim, the miss risk and Kappa's catch
	castPoint: 0.3,
	range: 11,
	speed: 20, // Ground line plus flight gives an 8 m dodge deadline of about 0.52 s.
	radius: 0.3,
	cooldown: 4,
	// A loosed arrow hits like a thrown spear: a long flare along the shot, a hard stop, a skid.
	impact: {
		flare: { size: 2.2, streak: 5, life: 0.26, color: '#fff1c9' },
		hold: 0.05,
		skid: 0.4,
		nudge: { amount: 0.35, range: 14 },
	},
}
