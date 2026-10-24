export default {
	hp: 4000,
	// What each boon the party carries does to Gnomon (`gnomon-fight.js`): `taken` scales every
	// blow it takes, `damage` every blow it deals. Lupa and Tara bare it; Azogue and Bizcocho blunt it.
	boons: {
		lupa: { taken: 1.25 },
		tara: { taken: 1.25 },
		azogue: { damage: 0.8 },
		bizcocho: { damage: 0.67 },
	},
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'gnomon.boons': 'multiplier',
}
