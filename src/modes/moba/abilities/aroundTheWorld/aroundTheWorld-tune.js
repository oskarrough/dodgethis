export default {
	damage: 60,
	castPoint: 0.3,
	range: 0,
	radius: 2.5,
	knockback: 2.5,
	time: 0.35,
	cooldown: 10,
	botEnemies: 2,
	// One release sweep belongs to the caster, even when nobody is hit.
	impact: {
		splash: 0.6,
		// The release arc owns hits and misses; suppress the shared miss flare too.
		flare: null,
		skid: 0.3,
		hold: 0.05,
	},
	sound: {
		cast: { freq: 480, slideTo: 920, type: 'sine', dur: 0.24, gain: 0.12 },
		impact: { freq: 760, slideTo: 95, type: 'triangle', dur: 0.25, gain: 0.2 },
	},
	juice: {
		impact: { count: 0, speed: 3.6, life: 0.28, size: 0.1 },
	},
}
