export default {
	range: 6,
	castPoint: 0.3,
	radius: 4,
	hp: 300,
	duration: 5,
	sweep: 1,
	bodyRadius: 0.35,
	healAmount: 50,
	cooldown: 14,
	bot: { deficit: 2, danger: 2, crowd: 2 },
	view: {
		ground: 0.11,
		height: 0.65,
		nozzle: 0.14,
		plantTime: 0.18,
		pulseTime: 0.16,
		pulseHeight: 0.1,
		layerGap: 0.008,
		ringWidth: 0.025,
		barHeight: 1,
		barWidth: 0.9,
		barDepth: 0.08,
	},
	sound: {
		cast: { freq: 180, slideTo: 350, type: 'square', dur: 0.1, gain: 0.07 },
		impact: { freq: 720, slideTo: 980, type: 'sine', dur: 0.18, gain: 0.1 },
		hit: { freq: 600, slideTo: 840, type: 'sine', dur: 0.08, gain: 0.06 },
	},
	juice: {
		cast: { count: 0, speed: 0.6, life: 0.2, size: 0.08 },
		impact: { count: 0, speed: 1.3, life: 0.3, size: 0.07 },
		contact: { hit: { count: 3, speed: 0.6, life: 0.2, size: 0.06 } },
	},
}

export const units = {
	'sprinkler.view.plantTime': 's',
	'sprinkler.view.pulseTime': 's',
	'sprinkler.view.pulseHeight': 'height m',
	'sprinkler.view.layerGap': 'height m',
}
