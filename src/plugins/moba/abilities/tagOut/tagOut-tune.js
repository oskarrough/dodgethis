export default {
	castPoint: 0.3,
	range: 7,
	radius: 0.08,
	cooldown: 14,
	damageReduction: 0.3,
	duration: 2,
	bot: { saveHp: 0.35, dangerRange: 5 },
	view: { dashSpacing: 0.5, dashFill: 0.55 },
	sound: {
		cast: { freq: 600, slideTo: 1000, type: 'triangle', dur: 0.12, gain: 0.12 },
		impact: { freq: 900, slideTo: 350, type: 'sine', dur: 0.16, gain: 0.13 },
	},
}
