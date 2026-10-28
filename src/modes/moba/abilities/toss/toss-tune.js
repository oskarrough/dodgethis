export default {
	damage: 180, // 45 dps; a caught Loose still pays more and bypasses this cooldown.
	castPoint: 0.3, // Keep the enemy's tell; shorten the glove draw, not the return's 0.5 s warning.
	range: 9,
	speed: 22,
	radius: 0.35,
	cooldown: 4,
	// The glove lands heavy: a wide burst of strokes on the ground, one ring behind it, a longer skid and hold than the slap.
	impact: {
		spokes: { color: '#fff1c9', count: 8, from: 0.6, to: 1.8, inner: 0.4, width: 0.26, life: 0.3 },
		flare: { size: 1.7, streak: 1.2, life: 0.24, color: '#fff1c9' },
		ripples: { count: 1, from: 0.5, to: 1.6, life: 0.32, width: 0.07 },
		skid: 0.4,
		hold: 0.07,
		dust: { count: 3, size: 0.2, life: 0.35, speed: 1.4 },
	},
	feedback: {
		shotKick: 0.35,
		hitKick: 0.65,
	},
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'toss.feedback.shotKick': 'm',
	'toss.feedback.hitKick': 'm',
	'toss.impact.spokes.from': 'm',
	'toss.impact.spokes.inner': 'fraction',
}
