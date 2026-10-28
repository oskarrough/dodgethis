export default {
	damage: 180,
	castPoint: 0.12,
	range: 7,
	radius: 2.5,
	delay: 0.48,
	slow: 0.3,
	duration: 1.5,
	cooldown: 6,
	view: { tilt: 0.65, angle: 55, height: 0.4, life: 0.2, ringWidth: 0.055, ground: 0.012 },
	juice: { impact: { count: 0 }, hit: { count: 0 } },
	// Arrows from above: one short inked cut per contact, without a particle cloud.
	impact: {
		splash: 0.7,
		flare: { size: 1.2, streak: 1.6, life: 0.18, color: '#fff1c9' },
		spokes: { count: 6, to: 0.8, width: 0.1, life: 0.16, color: '#fff1c9' },
		hold: 0,
		skid: 0.12,
	},
}
