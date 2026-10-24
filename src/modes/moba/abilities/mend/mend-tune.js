export default {
	castPoint: 1.2,
	cooldown: 0,
	range: 10,
	radius: 0.7,
	healAmount: 300,
	bot: { deficit: 1 },
	critChance: 0.1,
	critMultiplier: 1.5,
	sound: {
		cast: { freq: 380, slideTo: 620, type: 'sine', dur: 0.3, gain: 0.1 },
		impact: { freq: 760, slideTo: 1140, type: 'sine', dur: 0.24, gain: 0.13 },
	},
	juice: {
		cast: { count: 5, speed: 0.6, life: 0.4, size: 0.08 },
		impact: { count: 18, speed: 1.8, life: 0.5, size: 0.12 },
	},
	// Mender's aim preview, cast beam and landing (heroes/mender/mender-view.js).
	view: {
		color: '#1fae4a',
		ground: 0.04,
		height: 1.1,
		preview: { radius: 1.1, width: 0.12, pulse: 6, opacity: 0.85, line: 0.45 },
		beam: { width: 0.07, grow: 0.12, opacity: 0.5, glow: 0.5, bead: 0.22 },
		fill: { radius: 1.25, width: 0.18 },
		land: {
			ring: { from: 0.6, to: 2.2, life: 0.45, width: 0.12 },
			column: { radius: 0.55, height: 2.4, life: 0.45 },
		},
	},
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'mend.view.preview.line': 'fraction',
	'mend.view.preview.pulse': 'rad/s',
	'mend.view.beam.glow': 'fraction',
}
