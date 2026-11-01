export default {
	ceremony: {
		name: 'Tinaja and Botijo',
		title: 'Keepers of Tagoror',
		arrival:
			'They have shared this court for centuries. Break them together, or one will mend the other.',
		fall: 'The wheel stands still. Neither jar will mend the other now.',
		color: 'terracotta',
	},
	// Tinaja and Botijo (`tinajaBotijo-fight.js`): two Wardens of `hp` each, striking at `damage` of a
	// Warden's blows, `apart` m either side of the encounter's spot, who are pulled together. Within `kinship` m of each other both take
	// `shared` of every hit. When one falls the other spins it back to life in `revive` s, whole,
	// and fights no one while it spins.
	hp: 2400,
	damage: 0.3,
	apart: 3,
	kinship: 6,
	shared: 0.5,
	revive: 10,
	// The drawing: the tether while Kinship holds, and the revival's ring round the fallen.
	view: { tether: 0.08, ring: 1.6, rim: 0.16, segments: 40, lift: 0.005 },
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'tinajaBotijo.damage': 'multiplier',
	'tinajaBotijo.apart': 'm',
	'tinajaBotijo.kinship': 'm',
	'tinajaBotijo.shared': 'fraction',
	'tinajaBotijo.revive': 's',
}
