import { tileroomLayout } from './tileroom-layout.js'

// The tile room: a sandbox of floor swatches to walk among and judge (tileroom-view.js).
// Off the splash; reach it at ?mode=moba&map=tileroom&play. No enemies, no bots.
export default {
	kind: 'garden',
	order: 90,
	splash: false,
	layout: tileroomLayout,
	mechanics: [],
	party: [],
	online: false,
	palette: () => ({}),
	cut: () => ({}),
	debugTune: null,
}
