export default {
	// Barquero (`barquero-fight.js`): Tara, a clay idol, stands at the first point of `road`
	// (offsets from the encounter's spot) and must reach the last, where Barquero waits with his
	// ferry. It rolls at `speed` m/s while a hero stands within `ring` m of it, and coasts on for
	// `coast` s after the last one steps out. From the first push, every `every` s `pack` bardinos
	// pour over the dunes at `dunes`, one at each in turn, up to `most` alive, and run at whoever
	// pushes.
	road: [
		{ x: -8, z: -2 },
		{ x: 0, z: 2 },
		{ x: 8, z: -1 },
	],
	ring: 2.5,
	speed: 1.2,
	coast: 3,
	every: 8,
	pack: 2,
	most: 4,
	dunes: [
		{ x: -2, z: -7 },
		{ x: 6, z: -7 },
		{ x: 2, z: 6 },
	],
	bardino: { hp: 220, damage: 0.5 },
	// The drawing: Tara's ring and its pot, the road ahead, and Barquero's landing.
	view: {
		rim: 0.14,
		segments: 40,
		lift: 0.004,
		idol: 0.6,
		idolHeight: 1.2,
		road: 0.1,
		landing: 1.4,
	},
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'barquero.ring': 'm',
	'barquero.speed': 'm/s',
	'barquero.coast': 's',
	'barquero.every': 's',
	'barquero.pack': 'count',
	'barquero.most': 'count',
	'barquero.road': 'm',
	'barquero.dunes': 'm',
	'barquero.bardino.damage': 'multiplier',
}
