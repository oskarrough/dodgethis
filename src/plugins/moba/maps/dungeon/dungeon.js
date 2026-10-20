import { dungeonLayout } from './dungeon-layout.js'

export default {
	kind: 'garden',
	layout: dungeonLayout,
	mechanics: ['boss', 'bots'],
	party: ['brew', 'mitts', 'fletcher'],
	splash: false,
	online: false,
	palette: () => ({}),
	debugTune: null,
}
