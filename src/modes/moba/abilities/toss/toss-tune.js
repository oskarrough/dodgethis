export default {
	damage: 180, // 45 dps; a caught Loose still pays more and bypasses this cooldown.
	castPoint: 0.3, // Keep the enemy's tell; shorten the glove draw, not the return's 0.5 s warning.
	range: 9,
	speed: 22,
	radius: 0.35,
	cooldown: 4,
	impact: {
		skid: 0.24,
		hold: 0.05,
		dust: { count: 3, size: 0.2, life: 0.35, speed: 1.4 },
	},
	feedback: {
		shotKick: 0.35,
		hitKick: 0.65,
		hitstop: 0.025, // Hero contact only; presentation slowdown, ignored in shared sessions.
	},
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'toss.feedback.shotKick': 'm',
	'toss.feedback.hitKick': 'm',
}
