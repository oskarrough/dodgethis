import { tileroomLayout } from './tileroom-layout.js'

// The tile room: a sandbox of floor swatches to walk among and judge (tileroom-view.js).
// Off the splash; reach it at ?mode=moba&map=tileroom&play. No enemies.
export default {
	kind: 'garden',
	order: 90,
	splash: false,
	layout: tileroomLayout,
	mechanics: ['bots'],
	// Two companions walk with you, so each floor is seen under more than one unit.
	party: ['oolong', 'kappa'],
	online: false,
	palette: () => ({}),
	cut: () => ({}),
	debugTune: null,
}
