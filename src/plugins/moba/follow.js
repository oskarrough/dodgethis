import { tune } from './tune.js'
import { FLOOR } from './map.js'

// Follow framing: a critically damped spring on the rendered hero. Only pad aim gets look-ahead.
// Runs per rendered frame, so it is as smooth as the interpolation it reads.
export function createFollow(t = tune.follow) {
	const at = { x: 0, z: 0 }
	const vel = { x: 0, z: 0 }
	let fresh = true
	let free = false
	const eye = { x: 0, y: 0, z: 0 }
	const target = { x: 0, y: 0, z: 0 }

	// The spring's goal: the hero, plus lookAhead of the way to the aim, capped at lookCap.
	function goal(hero, aim) {
		let lx = 0
		let lz = 0
		if (aim) {
			lx = (aim.x - hero.x) * t.lookAhead
			lz = (aim.z - hero.z) * t.lookAhead
			const l = Math.hypot(lx, lz)
			if (l > t.lookCap) {
				lx *= t.lookCap / l
				lz *= t.lookCap / l
			}
		}
		return { x: hero.x + lx, z: hero.z + lz }
	}

	// `aim` is a held pad aim, never the mouse. Pan is world-space; Space locks back onto the hero.
	function frame(dt, hero, aim, { pan = null, centred = false, pad = false } = {}) {
		if (pad) free = false
		const panning = !centred && !pad && pan && (pan.x || pan.z)
		const g = goal(hero, pad && !centred ? aim : null)
		if (fresh) {
			at.x = g.x
			at.z = g.z
			vel.x = vel.z = 0
			fresh = false
		}
		if (panning) {
			free = true
			const length = Math.max(1, Math.hypot(pan.x, pan.z))
			at.x = Math.max(-FLOOR.half, Math.min(FLOOR.half, at.x + (pan.x / length) * t.pan * dt))
			at.z = Math.max(-FLOOR.half, Math.min(FLOOR.half, at.z + (pan.z / length) * t.pan * dt))
			vel.x = vel.z = 0
		} else if (!free || centred) {
			// Exact critically damped step: ~90% of a step change is covered in `response` seconds.
			const w = 3.9 / Math.max(0.01, t.response)
			const decay = Math.exp(-w * dt)
			for (const k of ['x', 'z']) {
				const d = at[k] - g[k]
				const tmp = (vel[k] + w * d) * dt
				vel[k] = (vel[k] - w * tmp) * decay
				at[k] = g[k] + (d + tmp) * decay
			}
		}
		target.x = at.x
		target.z = at.z
		eye.x = at.x
		eye.y = t.height
		eye.z = at.z + t.back
		return { eye, target, fov: t.fov }
	}

	return {
		frame,
		goal,
		// Recentre: the next frame starts on its goal with no blend.
		snap() {
			fresh = true
		},
	}
}
