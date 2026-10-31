// What waits behind each splash card, in the manual's voice. The splash groups the cards by
// kind, under a heading from `groups`; `who` sits on the card under the name, and `brief` is
// read out under the row for the card you're on. Keyed by map id; a map with no entry shows
// only its name. Lead with what you do there, not the scenery: the card already shows that.
// Keep these true to the game, and check the map before you edit.
export const groups = {
	versus: 'Three against three',
	dungeon: 'Co-op dungeon',
}

export const briefs = {
	overthrow: {
		who: 'One lane',
		brief:
			'March down the lane and break the enemy keep. Now and then the Ball drops at mid; throw it at a tower and the tower holds its fire for a while.',
	},
	flagfall: {
		who: 'Two lanes and a flag',
		brief:
			'Two lanes, so your three must choose where to stand. When the flag goes up at the centre, hold its ring with no foe beside you and the enemy’s front towers fall silent.',
	},
	salinas: {
		who: 'Two lanes and a jungle',
		brief:
			'The lanes run either side of a jungle, and its brush hides anyone standing in it. Take the long way round, or wait in the brush for whoever does.',
	},
	altamesa: {
		who: 'One to five heroes',
		brief:
			'Seven Wardens keep the hollow mesa. Bring up to five heroes, with bots in any empty place, and fight your way down to Gnomon on the stair.',
	},
}
