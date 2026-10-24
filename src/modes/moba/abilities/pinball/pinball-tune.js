export default {
	damage: 130,
	castPoint: 0.35, // the racket goes back and a dashed line marks who gets served
	range: 8,
	radius: 0.6, // the aim marker
	jumps: 3,
	jumpRange: 4.5,
	falloff: 0.2,
	cooldown: 9,
	sound: {
		cast: { freq: 520, slideTo: 780, type: 'triangle', dur: 0.1, gain: 0.1 },
		impact: { freq: 1300, slideTo: 900, type: 'square', dur: 0.06, gain: 0.09 },
	},
	view: {
		hopTime: 0.11, // the ball's flight between two bodies; hits land at once, so keep it short
		arc: 0.9, // height of each hop
		height: 1, // where it meets a body
		ballRadius: 0.27,
		dashSpacing: 0.45,
		dashFill: 0.5,
		tetherWidth: 0.1,
		ringFrom: 0.3,
		ringTo: 1.1,
		ringLife: 0.25,
		ringWidth: 0.08,
	},
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'pinball.jumps': 'count',
	'pinball.jumpRange': 'm',
	'pinball.falloff': 'fraction',
	'pinball.view.hopTime': 's',
	'pinball.view.arc': 'height m',
	'pinball.view.dashFill': 'fraction',
	'pinball.view.ringLife': 's',
	'pinball.view.ringWidth': 'fraction',
}
