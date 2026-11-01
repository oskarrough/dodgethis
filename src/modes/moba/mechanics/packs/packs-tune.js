export default {
	// Hand-placed enemy packs (`packs-guard.js`): a pack wakes when a hero comes within `aggro` m
	// of a guard or hurts one, and all of it fights. It gives up beyond `leash` m of its post and
	// heals after `calm` s alone. Each guard is a lane minion kind with its own HP, a damage scale and the `xp`
	// the party earns for it (the whole farm is about half the run's XP, the Wardens' falls the rest).
	packs: {
		aggro: 5,
		leash: 9,
		calm: 3,
		spread: 1.4,
		guards: {
			brute: { hp: 1800, damage: 0.3, xp: 300 },
			melee: { hp: 700, damage: 0.6, xp: 100 },
			ranged: { hp: 500, damage: 0.6, xp: 100 },
		},
	},
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'packs.spread': 'm',
}
