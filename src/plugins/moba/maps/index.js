import { overthrowLayout } from './overthrow.js'
import { flagfallLayout } from './flagfall.js'
import { lobbyLayout } from './lobby.js'
import { structures, minions, ball, bots, dummies } from '../match.js'
import { tune } from '../tune.js'

export const DEFAULT_MAP = 'overthrow'
export const maps = {
	overthrow: {
		layout: overthrowLayout,
		pieces: [structures, minions, ball, bots],
		palette: () => tune.overthrowTerrain.palette,
		debugTune: {
			name: 'overthrow terrain (applies on restart)',
			values: tune.overthrowTerrain,
			add(f, s) {
				for (const [key, min, max, step] of [
					['margin', 0.5, 3, 0.1],
					['jag', 0, 1.5, 0.1],
					['step', 1, 6, 0.5],
					['rockDepth', 1, 8, 0.5],
					['rockFlare', 0, 3, 0.1],
					['rockBands', 1, 5, 1],
					['chalkWidth', 0.04, 0.2, 0.01],
					['courtInset', 0.5, 3, 0.1],
					['mesaRadius', 3, 9, 0.5],
					['mesaHeight', 1, 6, 0.5],
				])
					f.add(s, key, min, max, step)
				for (const key of Object.keys(s.colors)) f.addColor(s.colors, key)
				for (const key of Object.keys(s.palette)) f.addColor(s.palette, key)
			},
		},
		online: true,
	},
	flagfall: {
		layout: flagfallLayout,
		pieces: [structures, minions, bots],
		palette: () => ({ ...tune.overthrowTerrain.palette, ...tune.flagfall.palette }),
		debugTune: {
			name: 'flagfall (applies on restart)',
			values: tune.flagfall,
			add: flagfallDebug,
		},
		online: false,
	},
	lobby: {
		layout: lobbyLayout,
		pieces: [dummies],
		palette: () => ({}),
		debugTune: null,
		online: true,
	},
}

function flagfallDebug(f, s) {
	f.add(s, 'scale', 0.75, 1, 0.01).name('scale (applies on restart)')
	f.add(s.water, 'width', 140, 260, 1).name('water plate width (m, applies on restart)')
	f.add(s.water, 'clouds').name('clouds (applies on restart)')
}

export const playableMaps = Object.keys(maps).filter((id) => id !== 'lobby')
export const onlineMaps = playableMaps.filter((id) => maps[id].online)
export function mapLayout(kind = DEFAULT_MAP) {
	return (maps[kind] ?? maps[DEFAULT_MAP]).layout()
}
export function matchRecipe(kind = DEFAULT_MAP) {
	const map = maps[kind] ?? maps[DEFAULT_MAP]
	return { ...map, layout: map.layout(), palette: map.palette() }
}
