export default {
	damage: 130,
	castPoint: 0.35, // the racket goes back and a dashed line marks who gets served
	range: 8,
	radius: 0.6, // the aim marker
	jumps: 3,
	flight: 0.12, // seven ticks per link: the visible ball and damage arrive together
	jumpRange: 4.5,
	falloff: 0.2,
	cooldown: 9,
	// Each arrival is a four-point strike, with a brief local hold on the body.
	juice: { hit: { count: 0, speed: 0, life: 0.1, size: 0.1 } },
	impact: {
		flare: null,
		ripples: null,
		splash: 0.8,
		spokes: { count: 4, from: 0.25, to: 1.15, width: 0.12, life: 0.16, color: '#fff6dc' },
		skid: 0.3,
		hold: 0.035,
	},
	sound: {
		cast: { freq: 520, slideTo: 780, type: 'triangle', dur: 0.1, gain: 0.1 },
		impact: {
			freq: 1300,
			slideTo: 900,
			type: 'square',
			dur: 0.06,
			gain: 0.09,
		},
	},
	view: {
		arc: 0.35, // height of each hop
		height: 1, // where it meets a body
		ballRadius: 0.27,
		dashSpacing: 0.45,
		dashFill: 0.5,
		tetherWidth: 0.1,
		traceLife: 0.16,
	},
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'pinball.flight': 's',
	'pinball.impact.spokes.from': 'm',
	'pinball.jumps': 'count',
	'pinball.jumpRange': 'm',
	'pinball.falloff': 'fraction',
	'pinball.view.arc': 'height m',
	'pinball.view.dashFill': 'fraction',
	'pinball.view.traceLife': 's',
}
