export default {
	// Three hands before the gate (`gateOfHands-fight.js`), placed as offsets from the encounter's
	// spot. A hand fills in `fill` s while a hero stands within `radius` m, then stays lit for
	// `linger` s after they leave; with all three lit at once the door opens. The first light wakes
	// the Potsherds, who every `every` s lob a shard at the nearest hero within `reach` m: it lands
	// `delay` s later where that hero stood, for `damage` within `splash` m.
	hands: [
		{ x: -4, z: -8 },
		{ x: -4, z: 8 },
		{ x: 3, z: 0 },
	],
	radius: 1.6,
	fill: 1.5,
	linger: 10,
	// The door: posts of `radius` m across the gap in the gate wall, `x` m east of the spot.
	door: { x: 6, radius: 1.4, posts: [-2.8, 0, 2.8], height: 3 },
	potsherds: [
		{ x: -2, z: -12 },
		{ x: -2, z: 12 },
		{ x: 5, z: -10 },
	],
	every: 2.5,
	reach: 18,
	delay: 1.2,
	splash: 1.5,
	damage: 140,
	// The drawing: a hand's rim and its fill ring, a Potsherd's pot, and a shard's arc and size.
	view: {
		rim: 0.14,
		pot: 0.55,
		potTop: 0.38,
		potHeight: 0.9,
		shard: 0.22,
		shardSegments: 8,
		arc: 4,
		segments: 40,
		lift: 0.005,
	},
}
