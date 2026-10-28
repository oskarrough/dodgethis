export default {
	hp: 1400,
	speed: 5,
	// How she moves (heroes/salvia/salvia-view.js): lean and sweep in radians, reaches in metres, times in seconds.
	view: {
		// Mend's gathering coil, held taut until the heal lands, then a pour forward.
		mend: {
			load: 0.3,
			rise: 0.6,
			pull: 0.12,
			lift: 0.28,
			tilt: 0.45,
			lean: 0.26,
			tremor: 0.02,
			throw: 0.5,
			dip: 0.2,
			pour: 0.3,
			lunge: 0.34,
			snap: 0.1,
			recover: 0.32,
		},
		// Ward has no cast point: the hand pushes the bubble out when it lands.
		ward: { thrust: 0.42, rise: 0.18, sweep: 0.32, lunge: 0.14, snap: 0.07, recover: 0.3 },
		// The tennis ball, read from her attack windup and backswing.
		basic: { load: 0.6, lean: 0.2, rise: 0.4, pull: 0.25, throw: 0.55, lunge: 0.16, snap: 0.06 },
	},
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'heroes.salvia.view.mend.load': 'fraction',
	'heroes.salvia.view.mend.lean': 'rad',
	'heroes.salvia.view.mend.tilt': 'rad',
	'heroes.salvia.view.mend.tremor': 'rad',
	'heroes.salvia.view.mend.pour': 'rad',
	'heroes.salvia.view.mend.lunge': 'rad',
	'heroes.salvia.view.mend.snap': 's',
	'heroes.salvia.view.mend.recover': 's',
	'heroes.salvia.view.ward.sweep': 'rad',
	'heroes.salvia.view.ward.lunge': 'rad',
	'heroes.salvia.view.ward.snap': 's',
	'heroes.salvia.view.ward.recover': 's',
	'heroes.salvia.view.basic.load': 'fraction',
	'heroes.salvia.view.basic.lean': 'rad',
	'heroes.salvia.view.basic.lunge': 'rad',
	'heroes.salvia.view.basic.snap': 's',
}
