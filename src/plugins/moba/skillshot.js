import { OBSTACLES, sweepHit, sweepObstacles, mapExit } from './obstacles.js'
export { sweepHit } from './obstacles.js'

// Closest approach of a→b to a point: the fraction along it and the distance.
export function closest(ax, az, bx, bz, cx, cz) {
	const dx = bx - ax
	const dz = bz - az
	const len2 = dx * dx + dz * dz
	const t = len2 > 0 ? Math.max(0, Math.min(1, ((cx - ax) * dx + (cz - az) * dz) / len2)) : 0
	return { t, d: Math.hypot(ax + dx * t - cx, az + dz * t - cz) }
}

// Advance one shot by `dt` against `targets` ({ id, x, z, radius }). Returns { hit, point } for the first body touched,
// { expired } once the range is spent, and lists `nearMisses` it passed within `nearMiss` of without touching.
export function stepShot(shot, dt, targets, nearMiss) {
	const step = Math.min(shot.speed * dt, shot.range - shot.travelled)
	const ax = shot.x
	const az = shot.z
	const bx = ax + shot.dx * step
	const bz = az + shot.dz * step
	let hit = null
	const from = { x: ax, z: az },
		to = { x: bx, z: bz }
	// Homing attacks check sight before windup; once released, cover cannot dodge them.
	const obstacle = shot.target
		? null
		: sweepObstacles(
				from,
				to,
				shot.radius,
				OBSTACLES.filter((o) => o.kind !== 'tower'),
			)
	const edge = mapExit(from, to, shot.radius)
	const blocked = obstacle === null ? edge : edge === null ? obstacle : Math.min(obstacle, edge)
	let at = blocked ?? Infinity
	for (const target of targets) {
		const t = sweepHit(ax, az, bx, bz, target.x, target.z, shot.radius + target.radius)
		if (t !== null && t < at) {
			at = t
			hit = target
		}
	}
	if (hit) {
		shot.x = ax + (bx - ax) * at
		shot.z = az + (bz - az) * at
		shot.travelled += step * at
		return { hit, point: { x: shot.x, z: shot.z }, nearMisses: [] }
	}
	if (blocked !== null) {
		shot.x = ax + (bx - ax) * blocked
		shot.z = az + (bz - az) * blocked
		shot.travelled += step * blocked
		return {
			hit: null,
			blocked: true,
			expired: true,
			point: { x: shot.x, z: shot.z },
			nearMisses: [],
		}
	}
	shot.x = bx
	shot.z = bz
	shot.travelled += step
	const expired = shot.travelled >= shot.range - 1e-9
	// A pass is judged once the shot is past its closest approach, or when it dies still closing.
	const nearMisses = []
	for (const target of targets) {
		if (shot.passed.includes(target.id)) continue
		const { t, d } = closest(ax, az, bx, bz, target.x, target.z)
		const gap = d - shot.radius - target.radius
		if (gap > nearMiss || (t >= 1 && !expired)) continue
		shot.passed.push(target.id)
		nearMisses.push({
			target,
			distance: gap,
			point: { x: ax + (bx - ax) * t, z: az + (bz - az) * t },
		})
	}
	return { hit: null, expired, nearMisses }
}
