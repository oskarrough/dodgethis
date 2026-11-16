export default {
	hp: 2200,
	speed: 5.6,
	// Her talent tree's numbers (kappa-talents.js), one block per talent.
	talents: {
		skippingStone: { cut: 0.75 },
		wetHand: { slow: 0.3, duration: 1.5 },
		undertow: { every: 3, distance: 2, time: 0.2 },
		longArm: { range: 3, speed: 6 },
		splash: { radius: 2, fraction: 0.5 },
		fullSwing: { distance: 3, time: 0.25 },
		hardShell: { damageReduction: 0.25 },
		longHold: { duration: 1, cooldown: 3 },
		biteBack: { range: 3, damage: 60 },
		bellyFlop: { radius: 2.5, damage: 120 },
		quickUp: { range: 2, cooldown: 3 },
		shellUp: { fraction: 0.5 },
		insult: { threat: 300 },
		riverBlood: { fraction: 0.3 },
		secondGlove: { cooldown: 1.5 },
		ricochet: { radius: 6, fraction: 0.6 },
		oldShell: { health: 0.4, fraction: 0.25 },
		coldCurrent: { count: 3, factor: 1.5 },
	},
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
const talent = (id, key) => `heroes.kappa.talents.${id}.${key}`
export const units = {
	[talent('skippingStone', 'cut')]: 's',
	[talent('wetHand', 'slow')]: 'fraction',
	[talent('undertow', 'distance')]: 'm',
	[talent('longArm', 'speed')]: 'm/s',
	[talent('splash', 'fraction')]: 'fraction',
	[talent('fullSwing', 'distance')]: 'm',
	[talent('hardShell', 'damageReduction')]: 'fraction',
	[talent('shellUp', 'fraction')]: 'fraction',
	[talent('insult', 'threat')]: 'hp',
	[talent('riverBlood', 'fraction')]: 'fraction',
	[talent('ricochet', 'fraction')]: 'fraction',
	[talent('oldShell', 'health')]: 'fraction',
	[talent('oldShell', 'fraction')]: 'fraction',
	[talent('coldCurrent', 'factor')]: 'multiplier',
}
