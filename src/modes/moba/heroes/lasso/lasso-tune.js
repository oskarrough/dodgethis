export default {
	hp: 1900,
	speed: 5.2,
	// His talent tree's numbers (lasso-talents.js), one block per talent.
	talents: {
		sinker: { every: 3, factor: 1.8 },
		snag: { slow: 0.25, duration: 1 },
		patience: { factor: 1.4 },
		longLine: { range: 3, speed: 6 },
		barb: { slow: 0.4, duration: 2 },
		catchOfTheDay: { refund: 3 },
		wideNet: { angle: 40, range: 1 },
		doubleKnot: { duration: 1, slow: 0.15 },
		dragNet: { distance: 1.5, time: 0.2 },
		haul: { radius: 5, distance: 2.5, time: 0.25 },
		seaLegs: { fraction: 0.3 },
		goodHaul: { fraction: 0.04 },
		mendedNet: { cooldown: 2 },
		heavySinker: { factor: 1.6 },
		doubleHook: { radius: 5, fraction: 0.6, distance: 2, time: 0.24 },
		whirlpool: { delay: 0.5, fraction: 0.6 },
	},
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
const talent = (id, key) => `heroes.lasso.talents.${id}.${key}`
export const units = {
	[talent('sinker', 'factor')]: 'multiplier',
	[talent('snag', 'slow')]: 'fraction',
	[talent('patience', 'factor')]: 'multiplier',
	[talent('longLine', 'speed')]: 'm/s',
	[talent('barb', 'slow')]: 'fraction',
	[talent('catchOfTheDay', 'refund')]: 's',
	[talent('wideNet', 'angle')]: 'deg',
	[talent('doubleKnot', 'slow')]: 'fraction',
	[talent('dragNet', 'distance')]: 'm',
	[talent('haul', 'distance')]: 'm',
	[talent('seaLegs', 'fraction')]: 'fraction',
	[talent('goodHaul', 'fraction')]: 'fraction',
	[talent('heavySinker', 'factor')]: 'multiplier',
	[talent('doubleHook', 'fraction')]: 'fraction',
	[talent('doubleHook', 'distance')]: 'm',
	[talent('whirlpool', 'fraction')]: 'fraction',
}
