import { tune } from './tune.js'
import { overthrowLayout } from './maps/overthrow/layout.js'
export { mapLayout } from './maps/index.js'
export { flagfallLayoutTune } from './maps/flagfall/layout.js'

const m = tune.map
// Compatibility defaults for geometry helpers; each run gets its own layout.
const defaults = overthrowLayout()
export const FLOOR = defaults.bounds
export const SPAWN = defaults.spawns.A
export const PILLARS = defaults.pillars
export const BOXES = defaults.boxes
export const OBSTACLES = defaults.obstacles

export function clampMap(p, margin = 0, bounds = FLOOR) {
	return {
		x: Math.max(-bounds.halfX + margin, Math.min(bounds.halfX - margin, p.x)),
		z: Math.max(-bounds.halfZ + margin, Math.min(bounds.halfZ - margin, p.z)),
	}
}

// First exit from the map, preserving a shot/aim's heading rather than bending it along the edge.
export function mapExit(a, b, margin = 0, bounds = FLOOR) {
	let at = null
	for (const [key, half] of [
		['x', bounds.halfX - margin],
		['z', bounds.halfZ - margin],
	]) {
		if (Math.abs(a[key]) > half) return 0
		if (Math.abs(b[key]) <= half) continue
		const t = ((b[key] > 0 ? half : -half) - a[key]) / (b[key] - a[key])
		at = at === null ? t : Math.min(at, t)
	}
	return at
}

export function projectMap(a, b, bounds = FLOOR) {
	const t = mapExit(a, b, 0, bounds) ?? 1
	return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }
}

export function walkable(x, z, radius = 0, clearance = 0, obstacles = OBSTACLES, bounds = FLOOR) {
	const r = radius + clearance
	if (Math.abs(x) > bounds.halfX - r || Math.abs(z) > bounds.halfZ - r) return false
	return obstacles.every((o) =>
		o.r !== undefined
			? Math.hypot(x - o.x, z - o.z) >= o.r + r
			: Math.hypot(
					Math.max(0, Math.abs(x - o.x) - o.halfX),
					Math.max(0, Math.abs(z - o.z) - o.halfZ),
				) >= r && !(Math.abs(x - o.x) < o.halfX && Math.abs(z - o.z) < o.halfZ),
	)
}

export function clampWalkable(point, radius, clearance = 0, obstacles = OBSTACLES, bounds = FLOOR) {
	const r = radius + clearance + tune.collision.separation
	let p = clampMap(point, r, bounds)
	for (let pass = 0; pass < tune.collision.clampPasses; pass++) {
		for (const o of obstacles) {
			if (o.r !== undefined) {
				const dx = p.x - o.x,
					dz = p.z - o.z,
					d = Math.hypot(dx, dz)
				if (d < o.r + r) {
					p.x = o.x + (d ? dx / d : 0) * (o.r + r)
					p.z = o.z + (d ? dz / d : 1) * (o.r + r)
				}
			} else {
				const x = Math.max(o.x - o.halfX, Math.min(o.x + o.halfX, p.x))
				const z = Math.max(o.z - o.halfZ, Math.min(o.z + o.halfZ, p.z))
				const dx = p.x - x,
					dz = p.z - z,
					d = Math.hypot(dx, dz)
				if (d > 0 && d < r) {
					p.x = x + (dx / d) * r
					p.z = z + (dz / d) * r
				} else if (d === 0) {
					// Choose a face that can be reached without leaving the map (base walls touch its edge).
					const faces = [
						{ x: o.x - o.halfX - r, z: p.z },
						{ x: o.x + o.halfX + r, z: p.z },
						{ x: p.x, z: o.z - o.halfZ - r },
						{ x: p.x, z: o.z + o.halfZ + r },
					].filter((q) => Math.abs(q.x) <= bounds.halfX - r && Math.abs(q.z) <= bounds.halfZ - r)
					faces.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))
					p = faces[0] ?? p
				}
			}
			p = clampMap(p, r, bounds)
		}
		if (walkable(p.x, p.z, radius, clearance, obstacles, bounds)) break
	}
	return p
}

export function sweepHit(ax, az, bx, bz, cx, cz, r) {
	const dx = bx - ax,
		dz = bz - az,
		fx = ax - cx,
		fz = az - cz
	const c = fx * fx + fz * fz - r * r
	if (c <= 0) return 0
	const a = dx * dx + dz * dz
	if (!a) return null
	const b = 2 * (fx * dx + fz * dz),
		disc = b * b - 4 * a * c
	if (disc < 0) return null
	const t = (-b - Math.sqrt(disc)) / (2 * a)
	return t >= 0 && t <= 1 ? t : null
}

// Slab test on x then z; hot enough in path planning that it allocates nothing.
function sweepBox(a, b, x, z, hx, hz) {
	let enter = 0,
		leave = 1
	for (let axis = 0; axis < 2; axis++) {
		const start = axis ? a.z : a.x,
			delta = axis ? b.z - a.z : b.x - a.x,
			lo = axis ? z - hz : x - hx,
			hi = axis ? z + hz : x + hx
		if (Math.abs(delta) < tune.collision.epsilon) {
			if (start < lo || start > hi) return null
			continue
		}
		const t1 = (lo - start) / delta,
			t2 = (hi - start) / delta
		enter = Math.max(enter, Math.min(t1, t2))
		leave = Math.min(leave, Math.max(t1, t2))
		if (enter > leave) return null
	}
	return enter
}

// Swept discs against circles and rounded boxes: exact corners, shared by shots and path edges.
export function sweepObstacles(a, b, radius = 0, obstacles = OBSTACLES) {
	let at = null
	const keep = (t) => {
		if (t !== null && (at === null || t < at)) at = t
	}
	for (const o of obstacles) {
		if (o.r !== undefined) {
			keep(sweepHit(a.x, a.z, b.x, b.z, o.x, o.z, o.r + radius))
			continue
		}
		keep(sweepBox(a, b, o.x, o.z, o.halfX + radius, o.halfZ))
		keep(sweepBox(a, b, o.x, o.z, o.halfX, o.halfZ + radius))
		for (const sx of [-1, 1])
			for (const sz of [-1, 1])
				keep(sweepHit(a.x, a.z, b.x, b.z, o.x + sx * o.halfX, o.z + sz * o.halfZ, radius))
	}
	return at
}

// The outward normal of whatever a disc at `p` is touching: the nearest obstacle surface or map edge.
// Called once per contact (a bounce), never per tick.
export function contactNormal(p, radius = 0, obstacles = OBSTACLES, bounds = FLOOR) {
	let best = null,
		gap = Infinity
	const keep = (g, x, z) => {
		if (Math.abs(g) >= gap) return
		gap = Math.abs(g)
		best = { x, z }
	}
	keep(bounds.halfX - radius - Math.abs(p.x), -Math.sign(p.x), 0)
	keep(bounds.halfZ - radius - Math.abs(p.z), 0, -Math.sign(p.z))
	for (const o of obstacles) {
		const cx = o.r !== undefined ? o.x : Math.max(o.x - o.halfX, Math.min(o.x + o.halfX, p.x))
		const cz = o.r !== undefined ? o.z : Math.max(o.z - o.halfZ, Math.min(o.z + o.halfZ, p.z))
		const dx = p.x - cx,
			dz = p.z - cz,
			d = Math.hypot(dx, dz)
		if (d > 0) {
			keep(d - radius - (o.r ?? 0), dx / d, dz / d)
			continue
		}
		// Centre inside a box: push out along the shallower axis.
		const px = o.halfX - Math.abs(p.x - o.x),
			pz = o.halfZ - Math.abs(p.z - o.z)
		if (px < pz) keep(-px - radius, Math.sign(p.x - o.x) || 1, 0)
		else keep(-pz - radius, 0, Math.sign(p.z - o.z) || 1)
	}
	return best
}

export function segmentClear(a, b, inflate = 0, obstacles = OBSTACLES, bounds = FLOOR) {
	if (Math.abs(b.x) > bounds.halfX - inflate || Math.abs(b.z) > bounds.halfZ - inflate) return false
	return sweepObstacles(a, b, Math.max(0, inflate - tune.collision.epsilon), obstacles) === null
}

// Top at y = 0, `depth` deep: the ring's points for a convex hull.
function ellipsePrism(halfX, halfZ, depth, segments = 64) {
	const points = []
	for (let i = 0; i < segments; i++) {
		const t = (i / segments) * Math.PI * 2
		const x = Math.cos(t) * halfX,
			z = Math.sin(t) * halfZ
		points.push(x, 0, z, x, -depth, z)
	}
	return new Float32Array(points)
}

// Rapier movement and analytical queries consume the same descriptors.
// An `island` ({ halfX, halfZ, round }) swaps the endless ground for a slab, or an elliptical one,
// with open edges to walk off.
export function buildColliders(
	world,
	RAPIER,
	obstacles = OBSTACLES,
	bounds = FLOOR,
	scale = 1,
	island = null,
) {
	const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
	// A flat arena needs no terrain triangles: their seams snag capsules and slow every sweep.
	// The boundary colliders below contain the lane.
	world.createCollider(
		island?.round
			? RAPIER.ColliderDesc.convexHull(ellipsePrism(island.halfX, island.halfZ, 2))
			: island
				? RAPIER.ColliderDesc.cuboid(island.halfX, 1, island.halfZ).setTranslation(0, -1, 0)
				: new RAPIER.ColliderDesc(new RAPIER.HalfSpace({ x: 0, y: 1, z: 0 })),
		body,
	)
	for (const o of obstacles) {
		const h =
			(o.r !== undefined ? m.pillarHeight : o.kind === 'hedge' ? m.hedgeHeight : m.wallHeight) *
			scale
		const shape =
			o.r !== undefined
				? RAPIER.ColliderDesc.cylinder(h / 2, o.r)
				: RAPIER.ColliderDesc.cuboid(o.halfX, h / 2, o.halfZ)
		world.createCollider(shape.setTranslation(o.x, h / 2, o.z), body)
	}
	const w = m.boundaryThickness * scale
	if (island) return () => world.removeRigidBody(body)
	const wallHeight = m.wallHeight * scale
	for (const side of [-1, 1]) {
		world.createCollider(
			RAPIER.ColliderDesc.cuboid(w, wallHeight / 2, bounds.halfZ + w).setTranslation(
				side * (bounds.halfX + w),
				wallHeight / 2,
				0,
			),
			body,
		)
		world.createCollider(
			RAPIER.ColliderDesc.cuboid(bounds.halfX + w, wallHeight / 2, w).setTranslation(
				0,
				wallHeight / 2,
				side * (bounds.halfZ + w),
			),
			body,
		)
	}
	return () => world.removeRigidBody(body)
}
