// Mitts's attack and abilities, spread into tune (tune.gloveSlap, tune.toss, …) by tune.js.

export const mitts = {
	gloveSlap: {
		damage: 130,
		rate: 1,
		windup: 0.2,
		backswing: 0.25,
		range: 3.5,
		radius: 0.35,
		critEvery: 3,
		critMultiplier: 1.5,
	},
	toss: { damage: 120, castPoint: 0.35, range: 7, speed: 20, radius: 0.35, cooldown: 5 },
	catch: {
		damageReduction: 0.25, // playtest starting value, not a balance claim
		castPoint: 0,
		duration: 1,
		radius: 2,
		angle: 100,
		speedFactor: 0.5,
		cooldown: 10,
		resetCooldown: 3,
	},
	dive: { castPoint: 0, range: 4, time: 0.25, prone: 0.4, radius: 2, angle: 360, cooldown: 12 },
}
