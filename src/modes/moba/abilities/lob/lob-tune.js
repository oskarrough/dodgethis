export default {
	damage: 150,
	castPoint: 0.25, // the racket's swing up is the enemy's first tell; the shadow is the second
	range: 8,
	radius: 2.2,
	delay: 0.9, // enough to read the shadow and step off it; at 1.1 easy bots walked out every time
	fieldRadius: 2.2, // the hot patch is the mark itself
	fieldLife: 3,
	interval: 0.5,
	burnDamage: 18,
	fieldSlow: 0.25,
	cooldown: 9,
	// The landing splashes light: a wide flare and rings running out over the floor like water.
	impact: {
		splash: 0.6,
		flare: { size: 2.4, streak: 4, life: 0.3, color: '#fff1c9' },
		ripples: { count: 3, from: 0.5, to: 2.2, life: 0.4, gap: 0.08, width: 0.04 },
		skid: 0.2,
	},
	sound: {
		cast: { freq: 620, slideTo: 1240, type: 'triangle', dur: 0.12, gain: 0.14 },
		impact: { freq: 1100, slideTo: 260, type: 'triangle', dur: 0.34, gain: 0.26 },
	},
	juice: {
		impact: { count: 30, speed: 4, life: 0.5, size: 0.13 },
	},
	view: {
		height: 11, // how far up the ball goes before it turns
		ballRadius: 0.28,
		up: 0.3, // share of the delay spent rising out of Carambola's hand
		shadowFrom: 0.15, // the shadow's first size, against the mark
		ringWidth: 0.06,
		ground: 0.015,
		shockGrow: 0.6,
		shockLife: 0.35,
		embers: 9,
		emberSize: 0.16,
		emberRise: 1.1,
		emberLife: 0.8,
		pulse: 7,
	},
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'lob.fieldRadius': 'm',
	'lob.fieldLife': 's',
	'lob.burnDamage': 'hp',
	'lob.fieldSlow': 'fraction',
	'lob.view.up': 'fraction',
	'lob.view.shadowFrom': 'fraction',
	'lob.view.shockGrow': 'multiplier',
	'lob.view.shockLife': 's',
	'lob.view.embers': 'count',
	'lob.view.emberRise': 'height m',
	'lob.view.emberLife': 's',
	'lob.view.pulse': 'rad/s',
}
