import { tune } from '../../tune.js'
import { tune as frontTune } from '../../front/tune.js'
import { ibisStats, numberLines } from '../../front/stats.js'

// Extra numbers-panel cards: Ibis's flight and dodging, and the volley that isn't built yet.
export function cards({ level }) {
	const stats = ibisStats(tune, { ...frontTune, level: tune.levels }, level)
	const lines = numberLines(stats, frontTune.preview.distance)
	return [
		{ title: 'Flight & dodging', sentence: '', more: lines.slice(3, 9) },
		{ title: 'Planned Volley', tag: 'not playable', sentence: '', more: lines.slice(9) },
	]
}
