export default {
	castPoint: 1,
	cooldown: 0,
	range: 10,
	radius: 0.7,
	healAmount: 250,
	bot: { deficit: 1 },
	critChance: 0.1,
	critMultiplier: 1.5,
	sound: {
		cast: { freq: 380, slideTo: 620, type: 'sine', dur: 0.3, gain: 0.1 },
		impact: { freq: 760, slideTo: 1140, type: 'sine', dur: 0.24, gain: 0.13 },
	},
	juice: {
		cast: { count: 3, speed: 0.6, life: 0.4, size: 0.08 },
		impact: { count: 8, speed: 1.4, life: 0.45, size: 0.1 },
	},
	// The heal's landing on whoever it mended (feedback.js 'heal'): a ring of strokes thrown flat from the feet and a low glint at the chest.
	// Nothing rises past the ally, so a crowd of healers never hides the ones they heal.
	healImpact: {
		spokes: { color: '#7be08f', count: 10, from: 0.5, to: 2, inner: 0.5, width: 0.2, life: 0.32 },
		flare: { size: 1, streak: 0, life: 0.3, color: '#d8ffe4', y: 1 },
	},
	// Salvia's aim preview, cast beam and landing (heroes/salvia/salvia-view.js).
	view: {
		color: '#1fae4a',
		ground: 0.04,
		height: 1.1,
		preview: { radius: 1.1, width: 0.12, pulse: 6, opacity: 0.85, line: 0.45 },
		beam: { width: 0.07, grow: 0.12, opacity: 0.5, glow: 0.5, bead: 0.22 },
		fill: { radius: 1.25, width: 0.18 },
		// Leaves drawn into her satchel while the cast runs, and beads running down the tether to the ally.
		gather: { leaves: 6, trips: 2, radius: 1.7, size: 0.34, spin: 1.1, from: 0.1 },
		stream: { beads: 3, cycles: 3 },
		// On landing: a bright stroke along the tether and one quiet ring; the spokes come from healImpact.
		land: {
			streak: { width: 0.5, life: 0.16 },
			ring: { from: 0.6, to: 2, life: 0.4, width: 0.1, opacity: 0.7 },
		},
		// A cast that never lands: the filling ring folds in on itself.
		fizzle: {
			color: '#35574a',
			from: 1.3,
			to: 0.2,
			life: 0.3,
			width: 0.16,
			opacity: 0.85,
			wait: 4,
		},
	},
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'mend.view.preview.line': 'fraction',
	'mend.view.preview.pulse': 'rad/s',
	'mend.view.beam.glow': 'fraction',
	'mend.view.gather.trips': 'count',
	'mend.view.gather.spin': 'rad',
	'mend.view.gather.from': 'fraction',
	'mend.view.stream.cycles': 'count',
	'mend.view.fizzle.wait': 'ticks',
	'mend.healImpact.spokes.inner': 'fraction',
	'mend.healImpact.spokes.from': 'm',
}
