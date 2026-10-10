import { tune } from '../../tune.js'
import { flagfallLayout } from './layout.js'

// Two lanes on the shared court by night; ground.js and scenery.js draw it (maps/views.js).
export default {
	kind: 'garden',
	order: 2,
	late: 360,
	layout: flagfallLayout,
	pieces: ['structures', 'minions', 'camps', 'flag', 'bots'],
	palette: () => ({ ...tune.flagfall.palette, light: tune.flagfall.light }),
	debugTune: {
		name: 'flagfall (applies on restart)',
		values: tune.flagfall,
		add(f, s) {
			f.add(s, 'scale', 0.75, 1, 0.01).name('scale (applies on restart)')
		},
	},
	online: false,
}
