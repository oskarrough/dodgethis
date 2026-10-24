export default {
	damage: 700,
	splash: 350,
	radius: 4,
	castPoint: 2.5,
	bruiseDamage: 50,
	bruiseEvery: 1,
	bruiseDuration: 6,
	// Windup tells throb harder as they fill (skills-view.js); the landing (effects.js createImpacts).
	tension: 1,
	impact: {
		splash: 0.55,
		rings: [
			{ color: '#e0473f', from: 0.8, to: 5, life: 0.55, width: 0.18 },
			{ color: '#26445f', from: 0.4, to: 2.6, life: 0.8, width: 0.06 },
		],
		column: { color: '#fff3d6', radius: 0.9, height: 3, life: 0.3, opacity: 0.8 },
		burst: { count: 26, speed: 4, life: 0.5, size: 0.14, streak: true },
		flash: 0.16,
		squash: 0.75,
		number: { color: '#ff5d3a', scale: 1.7 },
		shake: { amount: 0.9, range: 22 },
		// The ground gives: a printed crack, a ring of dust, the whole view shoved down the blow.
		crack: { arms: 7, reach: 2.4, width: 0.18, life: 0.9 },
		dust: { count: 8, size: 0.34, life: 0.55, speed: 2.6 },
		flare: { size: 3, streak: 6, life: 0.34, color: '#ffe9c4' },
		ripples: { count: 3, from: 0.8, to: 3.4, life: 0.45, gap: 0.08, width: 0.04 },
		hold: 0.09,
		skid: 0.4,
		nudge: { amount: 0.9, range: 22 },
	},
	sound: {
		cast: { freq: 70, slideTo: 180, dur: 0.6, gain: 0.2, type: 'sine' },
		hit: { freq: 55, slideTo: 25, dur: 0.25, gain: 0.25, type: 'triangle' },
		impact: { freq: 40, slideTo: 20, dur: 0.4, gain: 0.3, type: 'sine' },
	},
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'slam.splash': 'hp',
	'impact.splash': 'fraction',
}
