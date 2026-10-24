export default {
	castPoint: 0.3,
	range: 7,
	radius: 0.08,
	cooldown: 14,
	damageReduction: 0.3,
	duration: 2,
	bot: { saveHp: 0.35, dangerRange: 5 },
	view: { dashSpacing: 0.5, dashFill: 0.55 },
	impact: {
		smear: { radius: 1.1, width: 0.42, sweep: 2, life: 0.18 },
		skid: 0.26,
		hold: 0.06,
	},
	sound: {
		cast: { freq: 600, slideTo: 1000, type: 'triangle', dur: 0.12, gain: 0.12 },
		impact: { freq: 900, slideTo: 350, type: 'sine', dur: 0.16, gain: 0.13 },
	},
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'tagOut.view.dashFill': 'fraction',
}
