import { tune } from '../../tune.js'
import { dressRim } from '../../rim-dress.js'
import { nightGarden } from './flagfall-garden.js'
import { nightSky } from './flagfall-sky.js'
import { nightPools } from './flagfall-pools.js'

export function scenery(isle) {
	const s = tune.flagfall
	dressRim(
		isle,
		s.rim,
		s.carving,
		{ ruin: 'courtShade', wood: 'ink', bone: 'cream', moss: 'leaf' },
		'flagfall-rim',
	)
	nightGarden(isle)
	nightSky(isle, s.sky)
	nightPools(isle, s.ledgePools)
}
