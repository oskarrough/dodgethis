import { dungeonLayout } from './dungeon-layout.js'

export default {
	kind: 'garden',
	layout: dungeonLayout,
	mechanics: ['boss', 'bots'],
	party: ['brew', 'mitts', 'fletcher'],
	suggestedHero: 'mender',
	online: true,
	palette: () => ({}),
	// The splash woodcut's flat colours (front/woodcut.js): a cream arena on pale sky.
	cut: () => ({
		sky: '#b7dbe8',
		cloud: '#fffdf4',
		court: '#fffdf4',
		ink: '#26445f',
		cliff: '#26445f',
		gouge: '#b7dbe8',
		moss: '#26445f',
	}),
	debugTune: null,
}
