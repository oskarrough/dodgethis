// What waits behind each splash card, in the manual's voice: `who` sits on the card under the
// name, `brief` is read out under the row for the card you're on. Keyed by map id; a map with
// no entry shows only its name. Keep these true to the game: check the map before you edit.
export const briefs = {
	overthrow: {
		who: 'One lane · three a side',
		brief:
			'A green isle by day, and one long lane between two crystal keeps. Three heroes a side march behind their minions. When the Ball falls hot at the middle, carry it to an enemy tower and strike it silent, then break their keep before they break yours.',
	},
	flagfall: {
		who: 'Two lanes · three a side',
		brief:
			'The same stone isle by night, cut into two lanes. Every few minutes a flag is hoisted at the chalk cross; hold its ring with no foe beside you and the enemy’s front towers fall silent. Mercenaries camp in the dark and serve whoever kills them last.',
	},
	altamesa: {
		who: 'Co-op dungeon · one to five',
		brief:
			'The tallest mesa is hollow, and seven Wardens keep it. Bring a party of one to five heroes, with bots in any empty places, fight through the guards on the plateau and the Wardens of either wing, and end the run at Gnomon on the stair.',
	},
	salinas: {
		who: 'Two lanes · three a side',
		brief:
			'Salt pans at sunset, where the wheels of the old works still turn. Two lanes run either side of a jungle whose brush hides anyone standing in it, and the Ball falls here too.',
	},
}

// Under every lane map's brief: who fills the seats.
export const versus = 'Bots take any seat no player fills. Play alone, or open an online room.'
