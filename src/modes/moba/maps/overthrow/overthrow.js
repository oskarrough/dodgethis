import { tune } from '../../tune.js'
import { overthrowLayout } from './overthrow-layout.js'

export default {
	kind: 'lane',
	order: 1,
	get late() {
		return tune.map.late
	},
	layout: overthrowLayout,
	mechanics: ['structures', 'minions', 'ball', 'bots'],
	palette: () => ({ ...tune.overthrowTerrain.palette, light: tune.overthrowTerrain.light }),
	// The splash woodcut's flat colours (front/woodcut.js): apricot haze, sage court, violet stone.
	cut: () => {
		const c = tune.overthrowTerrain.colors
		return {
			sky: c.haze,
			cloud: c.cloudShade,
			court: c.tarmac,
			ink: c.ink,
			cliff: c.stoneShade,
			gouge: c.cloudShade,
			moss: c.moss,
		}
	},
	debugTune: {
		name: 'overthrowTerrain',
		values: tune.overthrowTerrain,
		late: tune.map,
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
		},
	},
	online: true,
}
