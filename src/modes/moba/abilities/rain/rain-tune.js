export default {
	damage: 180,
	castPoint: 0,
	range: 7,
	radius: 2.5,
	delay: 0.7,
	slow: 0.3,
	duration: 1.5,
	cooldown: 6,
	// Arrows from above: each one pocks the floor with a small ring and a scuff of dust, no pause.
	impact: {
		splash: 0.7,
		flare: { size: 1.2, streak: 1.6, life: 0.18, color: '#fff1c9' },
		ripples: { count: 1, from: 0.3, to: 1, life: 0.25, width: 0.07 },
		dust: { count: 2, size: 0.2, life: 0.35, speed: 1.2 },
		hold: 0,
		skid: 0.12,
	},
}
