import { tune } from '../../tune.js'
import { flagfallLayout } from './flagfall-layout.js'

// Two lanes on the shared court by night; flagfall-view.js draws it (maps/all-map-views.js).
export default {
	kind: 'garden',
	order: 2,
	get late() {
		return tune.flagfall.late
	},
	layout: flagfallLayout,
	mechanics: ['structures', 'minions', 'camps', 'flag', 'bots'],
	palette: () => ({ ...tune.flagfall.palette, light: tune.flagfall.light }),
	debugTune: {
		name: 'flagfall',
		values: tune.flagfall,
		late: tune.flagfall,
		add(f, s) {
			f.add(s, 'scale', 0.75, 1, 0.01).name('scale (applies on restart)')
		},
	},
	online: true,
}
