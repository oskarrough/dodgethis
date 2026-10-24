export default {
	// Hand-placed enemy packs (`packs-guard.js`): a pack wakes when a hero comes within `aggro` m
	// of a guard or hurts one, and all of it fights. It gives up beyond `leash` m of its post and
	// heals after `calm` s alone. Each guard is a lane minion kind with its own HP and a damage scale.
	packs: {
		aggro: 5,
		leash: 9,
		calm: 3,
		spread: 1.4,
		guards: {
			brute: { hp: 900, damage: 0.3 },
			melee: { hp: 350, damage: 0.6 },
			ranged: { hp: 250, damage: 0.6 },
		},
	},
}
