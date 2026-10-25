import { tune } from '../../tune.js'
import { carvedPillar } from '../../carve.js'

export function pillars({ pillars, m, print, material }) {
	const stone = pillars.map((p) =>
		carvedPillar(
			p,
			m.pillarHeight + m.capHeight,
			tune.altamesa.walls,
			tune.altamesa.view.pillarRelief,
		),
	)
	print(stone, material('courtShade'), 'altamesa-carved-pillars')
}
