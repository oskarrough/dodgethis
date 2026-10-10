import { tune } from './tune.js'
import { OBSTACLES, FLOOR, sweepHit, sweepObstacles, mapExit, contactNormal } from './obstacles.js'
export { sweepHit } from './obstacles.js'

// Closest approach of a→b to a point: the fraction along it and the distance.
export function closest(ax, az, bx, bz, cx, cz) {
	const dx = bx - ax
	const dz = bz - az
	const len2 = dx * dx + dz * dz
	const t = len2 > 0 ? Math.max(0, Math.min(1, ((cx - ax) * dx + (cz - az) * dz) / len2)) : 0
	return { t, d: Math.hypot(ax + dx * t - cx, az + dz * t - cz) }
}

// Both ordinary shots and the Ball offer the same pre-collision segment to the
// catch/Backboard resolver. true consumes; false leaves a possibly redirected shot.
export function interceptShot(shot, dt, intercept, context) {
	if (!intercept) return false
	const travel = Math.min(shot.speed * dt, shot.range - shot.travelled)
	const from = { x: shot.x, z: shot.z }
	const to = { x: shot.x + shot.dx * travel, z: shot.z + shot.dz * travel }
	// A glove or board beyond cover must not intercept through the wall.
	const obstacle = shot.target
		? null
		: sweepObstacles(
				from,
				to,
				shot.radius,
				(context.obstacles ?? OBSTACLES).filter((o) => !['tower', 'core'].includes(o.kind)),
			)
	const edge = mapExit(from, to, shot.radius, context.bounds)
	const at = Math.min(obstacle ?? 1, edge ?? 1)
	to.x = from.x + (to.x - from.x) * at
	to.z = from.z + (to.z - from.z) * at
	return (
		intercept({
			...context,
			shot,
			from,
			to,
			catchable: !shot.target && shot.catchable === true,
		}) === true
	)
}

// A bouncing shot with cushions left turns off the surface it touched instead of ending there,
// banking damage. Returns the cushion point, or null when the shot should end as usual.
function cushion(shot, cover, bounds) {
	const bounce = shot.bounce
	if (!bounce || shot.target || (shot.cushions ?? 0) >= bounce.max) return null
	const n = contactNormal(shot, shot.radius, cover, bounds)
	const dot = shot.dx * n.x + shot.dz * n.z
	if (!(dot < 0)) return null
	const point = { x: shot.x, z: shot.z }
	shot.dx -= 2 * dot * n.x
	shot.dz -= 2 * dot * n.z
	shot.cushions = (shot.cushions ?? 0) + 1
	shot.damage += bounce.damagePerCushion ?? 0
	shot.x += n.x * tune.projectile.cushionGap
	shot.z += n.z * tune.projectile.cushionGap
	return point
}

// Advance one shot by `dt` against `targets` ({ id, x, z, radius }). Returns { hit, point } for the first body touched,
// { expired } once the range is spent, and lists `nearMisses` it passed within `nearMiss` of without touching.
// A cushion ends this leg; `remaining` seconds go back through interception on the new heading.
export function stepShot(shot, dt, targets, nearMiss, obstacles = OBSTACLES, bounds = FLOOR) {
	const step = Math.min(shot.speed * dt, shot.range - shot.travelled)
	const ax = shot.x
	const az = shot.z
	const bx = ax + shot.dx * step
	const bz = az + shot.dz * step
	let hit = null
	const from = { x: ax, z: az },
		to = { x: bx, z: bz }
	// Homing attacks check sight before windup; once released, cover cannot dodge them.
	const cover = shot.target ? null : obstacles.filter((o) => !['tower', 'core'].includes(o.kind))
	const obstacle = cover && sweepObstacles(from, to, shot.radius, cover)
	const edge = mapExit(from, to, shot.radius, bounds)
	const blocked = obstacle === null ? edge : edge === null ? obstacle : Math.min(obstacle, edge)
	let at = blocked ?? Infinity
	const hits = []
	for (const target of targets) {
		if (shot.pierce && shot.passed.includes(target.id)) continue
		const t = sweepHit(ax, az, bx, bz, target.x, target.z, shot.radius + target.radius)
		if (t !== null && shot.pierce && t < (blocked ?? Infinity)) {
			hits.push({ hit: target, point: { x: ax + (bx - ax) * t, z: az + (bz - az) * t }, at: t })
			continue
		}
		if (t !== null && t < at) {
			at = t
			hit = target
		}
	}
	if (shot.pierce) {
		hits.sort((a, b) => a.at - b.at || String(a.hit.id).localeCompare(String(b.hit.id)))
		for (const entry of hits) shot.passed.push(entry.hit.id)
		const end = blocked ?? 1
		shot.x = ax + (bx - ax) * end
		shot.z = az + (bz - az) * end
		shot.travelled += step * end
		const banked = blocked !== null && cushion(shot, cover, bounds)
		if (banked)
			return {
				hit: null,
				hits,
				nearMisses: [],
				cushions: [banked],
				remaining: (step * (1 - end)) / shot.speed,
				expired: shot.travelled >= shot.range - 1e-9,
			}
		return {
			hit: null,
			hits,
			nearMisses: [],
			blocked: blocked !== null,
			expired: blocked !== null || shot.travelled >= shot.range - 1e-9,
			point: { x: shot.x, z: shot.z },
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
		const banked = cushion(shot, cover, bounds)
		if (banked)
			return {
				hit: null,
				nearMisses: [],
				cushions: [banked],
				remaining: (step * (1 - blocked)) / shot.speed,
				expired: shot.travelled >= shot.range - 1e-9,
			}
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
