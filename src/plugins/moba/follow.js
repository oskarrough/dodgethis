import { tune } from './tune.js'
import { FLOOR, clampMap } from './obstacles.js'

// Ground intersections of the four view corners. Pitch stays fixed; if a live
// camera tune cannot fit the court, reduce FOV rather than show off-map void.
export function viewFootprint(t, aspect, fov = t.fov) {
	const height = Math.max(t.minHeight ?? tune.follow.minHeight, t.height)
	const back = Math.max(0, t.back)
	const distance = Math.hypot(height, back),
		tangent = Math.tan((fov * Math.PI) / 360)
	const farDenom = height - tangent * back
	if (farDenom <= 0) return { halfX: Infinity, minZ: -Infinity, maxZ: Infinity }
	return {
		halfX: (height * distance * Math.max(0.01, aspect) * tangent) / farDenom,
		minZ: back - (height * (back + tangent * height)) / farDenom,
		maxZ: back - (height * (back - tangent * height)) / (height + tangent * back),
	}
}

export function clampView(point, t, aspect = 1, reserve = 0, focus = null) {
	let fov = t.fov + reserve,
		footprint = viewFootprint(t, aspect, fov)
	const padding = t.viewPadding ?? tune.follow.viewPadding
	const fits = (p) =>
		p.halfX + padding <= FLOOR.halfX && p.maxZ - p.minZ + padding * 2 <= FLOOR.halfZ * 2
	if (!fits(footprint)) {
		let low = tune.follow.minFov,
			high = fov
		for (let i = 0; i < tune.follow.fitIterations; i++) {
			const mid = (low + high) / 2
			if (fits(viewFootprint(t, aspect, mid))) low = mid
			else high = mid
		}
		fov = low
		footprint = viewFootprint(t, aspect, fov)
	}
	const bounded = (angle, centre = point) => {
		const footprint = viewFootprint(t, aspect, angle)
		return {
			x: Math.max(
				-FLOOR.halfX + footprint.halfX + padding,
				Math.min(FLOOR.halfX - footprint.halfX - padding, centre.x),
			),
			z: Math.max(
				-FLOOR.halfZ - footprint.minZ + padding,
				Math.min(FLOOR.halfZ - footprint.maxZ - padding, centre.z),
			),
		}
	}
	let at = bounded(fov)
	if (focus) {
		// Narrow the lens near a base rather than show void or lose the hero off-screen.
		const visible = (angle) => {
			const at = bounded(angle, focus)
			const height = Math.max(t.minHeight ?? tune.follow.minHeight, t.height)
			const back = Math.max(0, t.back)
			const distance = Math.hypot(height, back)
			const dz = focus.z - at.z
			const depth = (height * height + back * (back - dz)) / distance
			const tangent = Math.tan((angle * Math.PI) / 360)
			const x = (focus.x - at.x) / (depth * Math.max(0.01, aspect) * tangent)
			const y = (height * dz) / (distance * depth * tangent)
			return Math.max(Math.abs(x), Math.abs(y)) <= (t.edgeInset ?? tune.follow.edgeInset)
		}
		if (!visible(fov) && visible(tune.follow.minFov)) {
			let low = tune.follow.minFov,
				high = fov
			for (let i = 0; i < tune.follow.fitIterations; i++) {
				const middle = (low + high) / 2
				if (visible(middle)) low = middle
				else high = middle
			}
			fov = low
			at = bounded(fov)
		}
	}
	return { ...at, fov: Math.max(tune.follow.minFov, fov - reserve) }
}

// Follow framing: a critically damped spring on the rendered hero. Only pad aim gets look-ahead.
// Runs per rendered frame, so it is as smooth as the interpolation it reads.
export function createFollow(t = tune.follow) {
	const at = { x: 0, z: 0 }
	const vel = { x: 0, z: 0 }
	let pendingKick = 0
	let lastFov = t.fov
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
		return clampMap({ x: hero.x + lx, z: hero.z + lz })
	}

	// `aim` is a held pad aim, never the mouse. Pan is world-space; Space locks back onto the hero.
	function frame(
		dt,
		hero,
		aim,
		{ pan = null, centred = false, pad = false, aspect = 1, cameraFov = lastFov } = {},
	) {
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
			at.x = Math.max(-FLOOR.halfX, Math.min(FLOOR.halfX, at.x + (pan.x / length) * t.pan * dt))
			at.z = Math.max(-FLOOR.halfZ, Math.min(FLOOR.halfZ, at.z + (pan.z / length) * t.pan * dt))
			vel.x = vel.z = 0
		} else if (!free || centred) {
			// Mouse orders use the already interpolated hero directly: no second lagging spring.
			if (!pad) {
				at.x = g.x
				at.z = g.z
				vel.x = vel.z = 0
			}
			// Pad look-ahead stays critically damped.
			const w = 3.9 / Math.max(0.01, t.response)
			const decay = Math.exp(-w * dt)
			for (const k of ['x', 'z']) {
				const d = at[k] - g[k]
				const tmp = (vel[k] + w * d) * dt
				vel[k] = (vel[k] - w * tmp) * decay
				at[k] = g[k] + (d + tmp) * decay
			}
		}
		const bounded = clampView(
			at,
			t,
			aspect,
			Math.max(0, cameraFov - lastFov) + pendingKick,
			free && !centred ? null : hero,
		)
		pendingKick = 0
		lastFov = bounded.fov
		if (bounded.x !== at.x) vel.x = 0
		if (bounded.z !== at.z) vel.z = 0
		at.x = bounded.x
		at.z = bounded.z
		target.x = at.x
		target.z = at.z
		eye.x = at.x
		eye.y = Math.max(t.minHeight ?? tune.follow.minHeight, t.height)
		eye.z = at.z + Math.max(0, t.back)
		return { eye, target, fov: bounded.fov }
	}

	return {
		frame,
		goal,
		reserveKick(amount) {
			pendingKick += Math.max(0, amount)
		},
		focus(point) {
			Object.assign(at, clampMap(point))
			vel.x = vel.z = 0
			free = true
			fresh = false
		},
		// Recentre: the next frame starts on its goal with no blend.
		snap() {
			fresh = true
		},
	}
}
