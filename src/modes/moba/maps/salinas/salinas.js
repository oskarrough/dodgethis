import { tune } from '../../tune.js'
import { salinasLayout } from './salinas-layout.js'

export default {
	music: 'overthrow',
	kind: 'lane',
	order: 3,
	get late() {
		return tune.salinas.late
	},
	layout: salinasLayout,
	mechanics: ['structures', 'minions', 'ball', 'bots'],
	palette: () => ({ ...tune.salinas.palette, light: tune.salinas.light }),
	cut: () => {
		const c = tune.salinas.colors
		return {
			sky: c.haze,
			cloud: c.cloudLit,
			court: c.tarmac,
			ink: c.ink,
			cliff: c.stoneShade,
			gouge: c.stoneLit,
			moss: c.moss,
		}
	},
	debugTune: { name: 'salinas', values: tune.salinas, late: tune.salinas },
	online: true,
}
