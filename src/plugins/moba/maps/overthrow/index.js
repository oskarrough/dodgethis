import { tune } from '../../tune.js'
import { overthrowLayout } from './layout.js'

export default {
	kind: 'lane',
	order: 1,
	late: 180, // late game (tune.match.late) from 3:00 on this map (Oskar, 2026-10-11)
	layout: overthrowLayout,
	pieces: ['structures', 'minions', 'ball', 'bots'],
	palette: () => ({ ...tune.overthrowTerrain.palette, light: tune.overthrowTerrain.light }),
	debugTune: {
		name: 'overthrow terrain (applies on restart)',
		values: tune.overthrowTerrain,
		add(f, s) {
			for (const [key, min, max, step] of [
				['margin', 0.5, 3, 0.1],
				['jag', 0, 1.5, 0.1],
				['step', 1, 6, 0.5],
				['chalkWidth', 0.04, 0.2, 0.01],
				['courtInset', 0.5, 3, 0.1],
			])
				f.add(s, key, min, max, step)
			for (const [key, min, max, step] of [
				['depth', 10, 80, 1],
				['flare', 0, 0.5, 0.01],
				['ledge', 0, 2, 0.05],
				['column', 0, 1.5, 0.05],
				['mossMax', 0.3, 3, 0.05],
			])
				f.add(s.cliff, key, min, max, step).name(`cliff ${key}`)
			for (const [key, min, max, step] of [
				['bottom', 5, 60, 1],
				['max', 0, 1, 0.01],
				['far', 30, 300, 5],
			])
				f.add(s.haze, key, min, max, step).name(`haze ${key}`)
			for (const key of Object.keys(s.colors)) f.addColor(s.colors, key)
			for (const key of Object.keys(s.palette)) f.addColor(s.palette, key)
		},
	},
	online: true,
}
