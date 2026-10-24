export default {
	// Tinaja and Botijo (`tinajaBotijo-fight.js`): two Wardens of `hp` each, striking at `damage` of a
	// Warden's blows, `apart` m either side of the encounter's spot, who are pulled together. Within `kinship` m of each other both take
	// `shared` of every hit. When one falls the other spins it back to life in `revive` s, whole,
	// and fights no one while it spins.
	hp: 3000,
	damage: 0.4,
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
