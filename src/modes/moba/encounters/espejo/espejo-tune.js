export default {
	// Espejo (`espejo-fight.js`): a Warden of `hp` with a mirror for a face, striking at `damage`
	// of a Warden's blows. Its face turns toward the hero it hates most at `turn` degrees a second.
	// A blow struck from within `cone` degrees of where it faces lands at only `front`, and `back`
	// of it is thrown back at the striker. Every `every` s of the fight it stops for `polish` s to
	// polish its face, taking every blow whole, then forgets every grudge and turns on the nearest.
	hp: 14000,
	damage: 0.7,
	turn: 90,
	cone: 120,
	front: 0.5,
	back: 0.25,
	every: 12,
	polish: 3,
	// Bots that are not its target stand `behind` m at its back.
	behind: 2.2,
	// The drawing: the mirror's arc in front of Espejo, and a ring while it polishes.
	view: { reach: 2.2, rim: 0.16, segments: 32, lift: 0.004 },
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'espejo.damage': 'multiplier',
	'espejo.turn': 'deg/s',
	'espejo.cone': 'deg',
	'espejo.front': 'multiplier',
	'espejo.back': 'fraction',
	'espejo.every': 's',
	'espejo.polish': 's',
	'espejo.behind': 'm',
}
