import { tune } from '../../tune.js'
import { bind } from '../../restyle.js'
import { dressRim } from '../../rim-dress.js'
import { saltWorks } from './salinas-workings.js'
import { sunset } from './salinas-sky.js'

export function scenery(isle) {
	bind(isle.shared.uSun.value, (v) => v.set(...tune.salinas.light.dir).normalize())
	const s = tune.salinas
	dressRim(
		isle,
		s.rim,
		s.carving,
		{ ruin: 'courtShade', wood: 'leafDeep', moss: 'scenery', bone: 'scenery', cap: 'scenery' },
		'salinas-rim',
	)
	saltWorks(isle)
	sunset(isle)
}
