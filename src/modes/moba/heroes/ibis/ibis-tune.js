// Ibis keeps the shared hero body (tune.hero); her folder holds only her talents' numbers.
export default {
	talents: {
		splitReed: { factor: 0.6 },
		quickNock: { castPoint: 0.15, cooldown: 2, factor: 0.6 },
		farMark: { far: 7, factor: 1.6 },
		kickOff: { radius: 2, damage: 90, slow: 0.4, duration: 1.2 },
		secondLeap: { gap: 0.4, window: 2.5, cooldown: 2 },
		lightLanding: { window: 1.5, factor: 2 },
		cloudburst: { radius: 1.5, delay: 0.35 },
		pinned: { slow: 0.75, duration: 0.7 },
		markedGround: { factor: 1.5 },
		heronsRhythm: { reduction: 1.5 },
		overleap: { cooldown: 2 },
		startle: { cooldown: 10 },
		stillWater: { time: 1, factor: 1.5 },
		featherfall: { amount: 120, duration: 2 },
		threeReeds: { spread: 14 },
		secondVolley: { delay: 0.8 },
		kingfisher: { radius: 0.8, damage: 110 },
	},
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
const talent = (id, key) => `heroes.ibis.talents.${id}.${key}`
export const units = {
	[talent('splitReed', 'factor')]: 'fraction',
	[talent('quickNock', 'factor')]: 'fraction',
	[talent('farMark', 'far')]: 'm',
	[talent('farMark', 'factor')]: 'multiplier',
	[talent('kickOff', 'slow')]: 'fraction',
	[talent('secondLeap', 'gap')]: 's',
	[talent('lightLanding', 'factor')]: 'multiplier',
	[talent('pinned', 'slow')]: 'fraction',
	[talent('markedGround', 'factor')]: 'multiplier',
	[talent('heronsRhythm', 'reduction')]: 's',
	[talent('stillWater', 'factor')]: 'multiplier',
	[talent('featherfall', 'amount')]: 'hp',
	[talent('threeReeds', 'spread')]: 'deg',
}
