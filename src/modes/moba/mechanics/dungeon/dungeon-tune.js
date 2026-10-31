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
		// What the party earns for a fallen Warden (the run's whole pack farm is worth a little more).
		xp: 400,
		firstSlam: 10,
		slamEvery: 16,
		pose: { swingTurn: 1, swingLean: 0.2, slamLean: 0.6, slamLift: 0.4 },
	},
	// Who the Warden turns on: damage times `multiplier` per hero, healing at `heal`, and a new
	// target must beat the old by `switch`.
	threat: { multiplier: { oolong: 3 }, heal: 0.5, switch: 1.1 },
	// The dial (`dungeon-dial.js`): one number for how hard the run is. Every hero in the party
	// counts one, bots too, and the difficulty picked in the lobby adds its `spots` entry: easy is a
	// fair fight for those who came, normal fights you as if one more had come, hard as if two had.
	// At dial d each Warden's, pack guard's and bardino's health and damage are their own numbers
	// times 1 + `hp` (or `damage`) × (d − `at`), never below `floor`: `at` is the dial they were set
	// for. Health keeps pace with the party, so a run takes about as long whoever comes; damage moves
	// less, since a Warden strikes one hero at a time however many stand behind it. `tempo` (how much
	// faster a fight's clock runs) and `mechanics` (how many more of them at once) scale the same way,
	// per point of dial, once a fight reads them.
	dial: {
		at: 4,
		spots: { easy: 0, normal: 1, hard: 2 },
		hp: 0.25,
		damage: 0.15,
		floor: 0.2,
		tempo: 0,
		mechanics: 0,
	},
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
	dial: 'multiplier',
	'dial.at': 'count',
	'dial.spots': 'count',
	'dial.mechanics': 'count',
}
