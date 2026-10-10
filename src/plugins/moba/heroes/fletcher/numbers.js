import { tune } from '../../tune.js'
import { tune as frontTune } from '../../front/tune.js'
import { fletcherStats, numberLines } from '../../front/stats.js'

// Extra numbers-panel cards: Fletcher's flight and dodging, and the volley that isn't built yet.
export function cards({ level }) {
	const stats = fletcherStats(tune, { ...frontTune, level: tune.levels }, level)
	const lines = numberLines(stats, frontTune.preview.distance)
	return [
		{ title: 'Flight & dodging', summary: '', rows: [], notes: lines.slice(3, 9) },
		{
			title: 'Planned Volley',
			tag: 'not playable',
			summary: '',
			rows: [],
			notes: lines.slice(9),
		},
	]
}
