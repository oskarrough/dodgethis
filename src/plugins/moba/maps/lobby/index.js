import { lobbyLayout } from './layout.js'

export default {
	kind: 'lobby',
	order: 100,
	layout: lobbyLayout,
	pieces: ['dummies'],
	palette: () => ({}),
	debugTune: null,
	online: true,
}
