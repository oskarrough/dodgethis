import { lobbyLayout } from './lobby-layout.js'

export default {
	kind: 'lobby',
	order: 100,
	layout: lobbyLayout,
	mechanics: ['dummies'],
	palette: () => ({}),
	debugTune: null,
	online: true,
}
