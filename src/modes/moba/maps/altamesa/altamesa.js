import { tune } from '../../tune.js'
import { altamesaLayout } from './altamesa-layout.js'

// Altamesa, a co-op dungeon for a party of three (one to five may enter): roam the plateau,
// pull its packs as you please and kill its bosses; Gnomon on the stair ends the run.
export default {
	kind: 'garden',
	order: 3,
	layout: altamesaLayout,
	mechanics: ['packs', 'dungeon', 'bots'],
	party: ['oolong', 'kappa', 'ibis'],
	suggestedHero: 'salvia',
	online: false,
	palette: () => ({}),
	cut: () => {
		const c = tune.altamesa.colors
		return {
			sky: c.sky,
			cloud: '#fffdf4',
			court: c.sand,
			ink: c.ink,
			cliff: c.ink,
			gouge: c.stone,
			moss: c.ink,
		}
	},
	debugTune: null,
}
