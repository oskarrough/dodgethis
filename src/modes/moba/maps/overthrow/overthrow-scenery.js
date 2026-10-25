import { tune } from '../../tune.js'
import { dressRim } from '../../rim-dress.js'
import { bind } from '../../restyle.js'
import { morningPillars, morningAir } from './overthrow-sky.js'
import { morningFalls, rimFalls } from './overthrow-water.js'

export function scenery(isle) {
	// The lobby portal still calls this hook with the shared daylight terrain.
	if (isle.s.colors !== tune.overthrow.colors) return rimFalls(isle)
	const s = tune.overthrow
	bind(isle.shared.uSun.value, (v) => v.set(...s.light.dir).normalize())
	dressRim(
		isle,
		s.rim,
		s.carving,
		{ ruin: 'courtShade', moss: 'leaf', wood: 'leafDeep', bone: 'scenery' },
		'overthrow-rim',
	)
	const falls = morningPillars(isle, s.sky)
	morningAir(isle, s.sky)
	morningFalls(isle, falls, s.sky.waterfall)
}
