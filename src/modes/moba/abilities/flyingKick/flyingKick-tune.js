export default {
	castPoint: 0.3,
	range: 6,
	time: 0.3,
	damage: 100,
	radius: 0.4,
	cooldown: 7,
	// The landing: a smear off the boot, a hard stop, the target skids back in its own dust.
	impact: {
		smear: { radius: 1.2, width: 0.5, sweep: 2, life: 0.2 },
		flare: { size: 2.4, streak: 4.6, life: 0.26, color: '#fff1c9' },
		hold: 0.07,
		skid: 0.6,
		dust: { count: 6, size: 0.32, life: 0.45, speed: 1.8 },
		nudge: { amount: 0.5, range: 14 },
	},
	sound: {
		cast: { freq: 170, slideTo: 620, type: 'sawtooth', dur: 0.26, gain: 0.1 },
		hit: { freq: 110, slideTo: 42, type: 'square', dur: 0.13, gain: 0.19 },
	},
}
