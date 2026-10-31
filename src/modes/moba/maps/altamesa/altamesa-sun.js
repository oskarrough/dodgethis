import * as THREE from 'three'
import { STEP } from '../../../../core/app.js'
import { tune } from '../../tune.js'
import { restyle } from '../../restyle.js'

// A view of the run clock, never an accumulating animation clock. Seeking a replay or
// receiving a snapshot halfway through a sunset yields the same light at the same tick.
export function sunProgress(encounters, tick, seconds) {
	const wardens = encounters.filter((e) => !e.last)
	if (!wardens.length) return 0
	return (
		wardens.reduce((sum, e) => {
			if (!e.killed) return sum
			const age = e.killedTick == null ? 1 : ((tick - e.killedTick) * STEP) / seconds
			const t = Math.max(0, Math.min(1, age))
			return sum + t * t * (3 - 2 * t)
		}, 0) / wardens.length
	)
}

export function altamesaSun(setLight) {
	const s = tune.altamesa
	const morning = structuredClone(s.light)
	const haze = structuredClone(s.skyGlow)
	const sunset = s.sunset
	const mixColor = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex()
	let previous = null
	return {
		update(sim, blend = 0, _local, _aim, _camera, endingTick) {
			if (sim.bounds.id !== 'altamesa' || !sim.dungeon) return
			// Eight updates a second leave the Tuner's 80 ms shadow-print debounce room
			// to finish, rather than postponing every shadow until the sun stops moving.
			const tick = Math.floor((endingTick ?? sim.tick + blend) * STEP * 8) / (STEP * 8)
			const t = sunProgress(sim.dungeon.encounters, tick, sunset.seconds)
			if (t === previous) return
			previous = t
			for (const key of ['sun', 'shade', 'shadow'])
				s.light[key] = mixColor(morning[key], sunset[key], t)
			s.light.dir = morning.dir.map((n, i) => THREE.MathUtils.lerp(n, sunset.dir[i], t))
			s.light.bandMix = morning.bandMix.map((n, i) => THREE.MathUtils.lerp(n, sunset.bandMix[i], t))
			s.light.shadowLength = THREE.MathUtils.lerp(morning.shadowLength, sunset.shadowLength, t)
			s.skyGlow.color = mixColor(haze.color, sunset.sky, t)
			s.skyGlow.heart = mixColor(haze.heart, sunset.heart, t)
			restyle()
			setLight?.(s.light)
		},
		dispose() {
			Object.assign(s.light, morning)
			Object.assign(s.skyGlow, haze)
			restyle()
		},
	}
}
