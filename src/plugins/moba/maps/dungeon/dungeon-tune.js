export default {
	dungeon: { radius: 14, entrance: -11, spawnSpacing: 1.5, segments: 96 },
	boss: {
		hp: 15000,
		radius: 1.2,
		speed: 3.5,
		aggro: 8,
		reset: 3,
		firstSlam: 10,
		slamEvery: 16,
		pose: { swingTurn: 1, swingLean: 0.2, slamLean: 0.6, slamLift: 0.4 },
	},
	threat: { multiplier: { brew: 3 }, heal: 0.5, switch: 1.1 },
}
