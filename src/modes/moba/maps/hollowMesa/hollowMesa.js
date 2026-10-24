import { tune } from '../../tune.js'
import { hollowMesaLayout } from './hollowMesa-layout.js'

// The Hollow Mesa, a co-op dungeon for a party of three (one to five may enter): roam the plateau,
// pull its packs as you please and kill its bosses; the Sundial on the stair ends the run.
export default {
	kind: 'garden',
	order: 3,
	layout: hollowMesaLayout,
	mechanics: ['packs', 'dungeon', 'bots'],
	party: ['brew', 'mitts', 'fletcher'],
	suggestedHero: 'mender',
	online: false,
	palette: () => ({}),
	cut: () => {
		const c = tune.hollowMesa.colors
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
