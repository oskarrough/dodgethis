import { tune } from '../../tune.js'
import { flagfallLayout } from './flagfall-layout.js'

// Two lanes on the shared court by night; flagfall-view.js draws it (maps/all-map-views.js).
export default {
	// Its score in the jukebox (src/core/music.js SONGS), played instead of the match theme.
	music: 'flagfall',
	kind: 'garden',
	order: 2,
	get late() {
		return tune.flagfall.late
	},
	layout: flagfallLayout,
	mechanics: ['structures', 'minions', 'camps', 'flag', 'bots'],
	palette: () => ({ ...tune.flagfall.palette, light: tune.flagfall.light }),
	// The splash woodcut's flat colours (front/woodcut.js): night sky, a pale moon, violet court.
	cut: () => {
		const c = tune.flagfall.colors
		return {
			sky: c.haze,
			cloud: c.cloudLit,
			orb: tune.flagfall.specks.color,
			court: c.tarmac,
			ink: c.ink,
			cliff: c.ink,
			gouge: c.tarmac,
			moss: c.moss,
		}
	},
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
