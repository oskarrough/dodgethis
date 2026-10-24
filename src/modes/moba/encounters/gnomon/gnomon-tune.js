export default {
	// Gnomon (`gnomon-fight.js`): a Warden of `hp` striking at `damage` of a Warden's blows.
	hp: 3000,
	damage: 0.5,
	// Every `every` s its shadow falls, an hour hand `length` m long and `width` m wide from its
	// foot toward the next hero in turn. It lengthens for `warning` s, then lands for `damage` and
	// holds whoever it covers for `hold` s (a stun), and lies `linger` s before it lifts.
	shadow: { every: 6, warning: 1.5, length: 12, width: 2, damage: 250, hold: 1.5, linger: 0.5 },
	// Every `every` s it turns back the hour: its life goes back to what it was `back` s before,
	// if that was more. The dial round it fills toward the turn and shows blue for `warning` s.
	rewind: { every: 20, back: 10, warning: 3 },
	// What each boon the party carries does to Gnomon: `taken` scales every blow it takes, `damage`
	// every blow it deals, its shadow's too, `length` its shadow, `back` how far it turns time.
	boons: {
		lupa: { taken: 1.25 },
		azogue: { length: 0.5 },
		bizcocho: { damage: 0.67 },
		tara: { back: 0.5 },
	},
	// The drawing: the dial's rim round Gnomon, and the shadow a hair above the floor.
	view: { dial: 2.4, rim: 0.16, segments: 48, lift: 0.004 },
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'gnomon.damage': 'multiplier',
	'gnomon.shadow.every': 's',
	'gnomon.shadow.warning': 's',
	'gnomon.shadow.length': 'm',
	'gnomon.shadow.width': 'm',
	'gnomon.shadow.hold': 's',
	'gnomon.shadow.linger': 's',
	'gnomon.rewind.every': 's',
	'gnomon.rewind.back': 's',
	'gnomon.rewind.warning': 's',
	'gnomon.boons': 'multiplier',
}
