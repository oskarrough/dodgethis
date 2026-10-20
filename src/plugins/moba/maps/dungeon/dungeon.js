import { dungeonLayout } from './dungeon-layout.js'

export default {
	kind: 'garden',
	layout: dungeonLayout,
	mechanics: ['boss', 'bots'],
	party: ['brew', 'mitts', 'fletcher'],
	suggestedHero: 'mender',
	online: false,
	palette: () => ({}),
	debugTune: null,
}
