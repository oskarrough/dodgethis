export default {
	castPoint: 0,
	cooldown: 12,
	range: 10,
	radius: 0.8,
	shield: 500,
	duration: 8,
	sound: {
		cast: { freq: 220, slideTo: 440, type: 'triangle', dur: 0.12, gain: 0.1 },
		impact: { freq: 880, slideTo: 660, type: 'triangle', dur: 0.3, gain: 0.12 },
	},
	juice: {
		cast: { count: 4, speed: 1.5, life: 0.2, size: 0.07 },
		impact: { count: 16, speed: 2, life: 0.35, size: 0.12 },
	},
	// The bubble on a warded ally (heroes/mender/mender-view.js).
	view: {
		color: '#3fa9ff',
		radius: 0.95,
		height: 0.95,
		opacity: 0.55,
		grow: 0.25,
		flash: 0.18,
		pop: { life: 0.35, to: 1.9 },
	},
}
