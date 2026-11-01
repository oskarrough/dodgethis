import { tune } from '../../tune.js'
import { altamesaLayout } from './altamesa-layout.js'

// Altamesa, a co-op dungeon for a party of up to five: Oolong walks in beside you, and the
// rest of the bench waits for whoever you add in the lobby. Roam the plateau, pull its packs
// as you please and kill its bosses; Gnomon on the stair ends the run.
export default {
	// Its score in the jukebox (src/core/music.js SONGS), played instead of the match theme.
	music: 'altamesa',
	kind: 'garden',
	order: 3,
	layout: altamesaLayout,
	mechanics: ['packs', 'dungeon', 'bots', 'hints', 'memory'],
	// One companion starts with you; empty lobby seats can be filled up to the party of five.
	party: ['oolong'],
	suggestedHero: 'salvia',
	online: false,
	palette: () => ({ ...tune.altamesa.palette, light: tune.altamesa.light }),
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
