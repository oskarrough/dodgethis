export default {
	// Carillon (`carillon-fight.js`): a Warden of `hp` inside a bronze bell, striking at `damage`
	// of a Warden's blows. Shut, the bell lets through only `shut` of every blow. Every `every` s
	// of the fight it tolls: a ring of `toll.radius` m is warned round the bell for `toll.warning`
	// s, then lands for `toll.damage` and a stun of `toll.stun` s on all inside it. Each toll
	// cracks the bronze, and for `open` s after, Carillon takes `cracked` of every blow.
	hp: 10000,
	damage: 0.7,
	shut: 0.2,
	cracked: 1.5,
	open: 6,
	every: 10,
	toll: { radius: 5, warning: 2, damage: 220, stun: 1 },
	// The drawing: the toll's warning ring, and the bell's rim, blue while it lies cracked.
	view: { rim: 0.16, segments: 48, lift: 0.004, bell: 1.6 },
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'carillon.damage': 'multiplier',
	'carillon.shut': 'multiplier',
	'carillon.cracked': 'multiplier',
	'carillon.open': 's',
	'carillon.every': 's',
	'carillon.toll.warning': 's',
	'carillon.toll.stun': 's',
}
