export default {
	memory: {
		// A small scratched cross where a hero fell, `size` m across in strokes `width` m wide, a hair
		// above the floor. This run's falls show at `opacity`; earlier runs fade from `faded` to
		// `faintest`. The mesa keeps the last `runs` runs with falls in them, and `perRun` falls of each.
		chalk: {
			size: 0.7,
			width: 0.07,
			lift: 0.006,
			opacity: 0.55,
			faded: 0.3,
			faintest: 0.08,
			runs: 6,
			perRun: 20,
		},
		// The names of the heroes who cleared the mesa, carved in letters `letter` m tall round
		// Gnomon's dial, `radius` m from its pin. At most `cap` names; the oldest wear away first.
		names: { radius: 2.95, letter: 0.5, lift: 0.005, opacity: 0.6, lip: 0.3, cap: 12 },
	},
}

// The dimension of each number above that its name alone does not settle (src/modes/moba/units.js).
export const units = {
	'memory.chalk.size': 'm',
	'memory.chalk.lift': 'm',
	'memory.chalk.faded': 'fraction',
	'memory.chalk.faintest': 'fraction',
	'memory.chalk.runs': 'count',
	'memory.chalk.perRun': 'count',
	'memory.names.letter': 'm',
	'memory.names.lift': 'm',
	'memory.names.lip': 'fraction',
}
