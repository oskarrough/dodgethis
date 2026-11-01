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
	// counts one, bots too, and the difficulty picked in the lobby adds its `spots` entry: easy comes
	// a little short of the party, normal fights you as if one more had come, hard as if one and a
	// half had. At dial d each Warden's, pack guard's and bardino's health and damage are their own
	// numbers times 1 + `hp` (or `damage`) × (d − `at`), never below `floor`: `at` is the dial they
	// were set for. Health keeps pace with the party, steeply enough that a lone hero meets a fifth
	// of a Warden (the floor) and a pair three fifths; any more and the bots cannot get a lone hero
	// past Fornax or Espejo. Damage stays where it is (`damage` 0): a bigger party dies more to the
	// number of bodies than to the weight of a blow. The difficulty weighs the blows instead:
	// `blows` multiplies every Warden's, guard's and bardino's damage, so on normal a party of three
	// needs its healer by the second wing and on hard from Fornax on, while easy stays soloable by
	// two bots. Each Warden's own `hp` and `damage` are set for a party of three. `tempo` (how much
	// faster a fight's clock runs) and `mechanics` (how many more of them at once) scale the same way,
	// per point of dial, once a fight reads them.
	dial: {
		at: 4,
		spots: { easy: 0.3, normal: 1, hard: 1.5 },
		hp: 0.4,
		damage: 0,
		blows: { easy: 1, normal: 2, hard: 2.5 },
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
