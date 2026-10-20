export default {
	castPoint: 1.5,
	cooldown: 0,
	range: 10,
	radius: 0.7,
	healAmount: 300,
	critChance: 0.1,
	critMultiplier: 1.5,
	sound: {
		cast: { freq: 380, slideTo: 620, type: 'sine', dur: 0.3, gain: 0.1 },
		impact: { freq: 760, slideTo: 1140, type: 'sine', dur: 0.24, gain: 0.13 },
	},
	juice: {
		cast: { count: 5, speed: 0.6, life: 0.4, size: 0.08 },
		impact: { count: 12, speed: 1.2, life: 0.45, size: 0.1 },
	},
}
