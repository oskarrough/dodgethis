export default {
	// A hero who walks within `reach` m of a waystone rises there after death, and standing there
	// mends from nothing to full in `mend` s; the dead of a won fight rise `rise` s after it.
	waystone: { reach: 3, rise: 4, mend: 5 },
	// The hourglass's marks, in seconds of run time: the swift, the able and the slow.
	hourglass: { glass: 600, clay: 900, stone: 1200 },
	// The Warden every encounter without a fight of its own is fought as (`dungeon-warden.js`).
	warden: {
		hp: 15000,
		radius: 1.2,
		speed: 3.5,
		aggro: 8,
		reset: 3,
		firstSlam: 10,
		slamEvery: 16,
		pose: { swingTurn: 1, swingLean: 0.2, slamLean: 0.6, slamLift: 0.4 },
	},
	// Who the Warden turns on: damage times `multiplier` per hero, healing at `heal`, and a new
	// target must beat the old by `switch`.
	threat: { multiplier: { oolong: 3 }, heal: 0.5, switch: 1.1 },
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	hourglass: 's',
	'waystone.rise': 's',
	'waystone.mend': 's',
	'threat.heal': 'multiplier',
	'threat.multiplier': 'multiplier',
	'threat.switch': 'multiplier',
	'warden.pose.slamLift': 'height m',
}
