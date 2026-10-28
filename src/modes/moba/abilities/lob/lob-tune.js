export default {
	damage: 150,
	castPoint: 0.3, // the racket's swing up is the enemy's first tell; the shadow is the second
	range: 8,
	radius: 2.2,
	delay: 0.7, // a quick ascent hangs briefly before the heavy drop
	fieldRadius: 2.2, // the hot patch is the mark itself
	fieldLife: 3,
	interval: 0.5,
	burnDamage: 18,
	fieldSlow: 0.25,
	cooldown: 9,
	// One hard landing star; the burn mark stays quieter than its team boundary.
	impact: {
		flare: null,
		ripples: null,
		splash: 0.6,
		spokes: { count: 6, from: 0.45, to: 2.2, width: 0.16, life: 0.2, color: '#fff1c9' },
		hold: 0.045,
		skid: 0.2,
	},
	sound: {
		cast: { freq: 620, slideTo: 1240, type: 'triangle', dur: 0.12, gain: 0.14 },
		impact: {
			freq: 1100,
			slideTo: 260,
			type: 'triangle',
			dur: 0.34,
			gain: 0.26,
		},
	},
	juice: {
		hit: { count: 0, speed: 0, life: 0.1, size: 0.1 },
		impact: {
			count: 0,
			speed: 0,
			life: 0.1,
			size: 0.1,
		},
	},
	view: {
		height: 4.6, // how far up the ball goes before it turns
		ballRadius: 0.36,
		up: 0.42, // share of the delay spent rising out of Carambola's hand
		shadowFrom: 0.15, // the shadow's first size, against the mark
		ringWidth: 0.06,
		shockLife: 0.35,
		pulse: 7,
	},
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'lob.impact.spokes.from': 'm',
	'lob.fieldRadius': 'm',
	'lob.fieldLife': 's',
	'lob.burnDamage': 'hp',
	'lob.fieldSlow': 'fraction',
	'lob.view.up': 'fraction',
	'lob.view.shadowFrom': 'fraction',
	'lob.view.shockLife': 's',
	'lob.view.pulse': 'rad/s',
}
