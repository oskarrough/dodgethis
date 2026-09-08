// DOM-free obstacle layouts and 2D geometry for steering, sightlines and placement. Shapes are axis-aligned and sit on the floor.
//   { kind: 'pillar', x, z, r, h }
//   { kind: 'wall', x, z, w, d, h }   // box centred at (x,z), w along x, d along z
// Layouts keep |z| >= 5 clear for spawn rows and always leave a straight lane from one spawn row to the other.
export const LAYOUTS = Object.freeze({
	open: [],
	pillars: [
		{ kind: 'pillar', x: 0, z: 0, r: 0.5, h: 2.2 },
		{ kind: 'pillar', x: -2.6, z: -2.6, r: 0.45, h: 2.2 },
		{ kind: 'pillar', x: 2.6, z: -2.6, r: 0.45, h: 2.2 },
		{ kind: 'pillar', x: -2.6, z: 2.6, r: 0.45, h: 2.2 },
		{ kind: 'pillar', x: 2.6, z: 2.6, r: 0.45, h: 2.2 },
	],
	walls: [
		{ kind: 'wall', x: -2.2, z: 0, w: 2.4, d: 0.35, h: 0.9 },
		{ kind: 'wall', x: 2.2, z: 0, w: 2.4, d: 0.35, h: 0.9 },
		{ kind: 'pillar', x: -3.8, z: -3.2, r: 0.4, h: 2.2 },
		{ kind: 'pillar', x: 3.8, z: -3.2, r: 0.4, h: 2.2 },
		{ kind: 'pillar', x: -3.8, z: 3.2, r: 0.4, h: 2.2 },
		{ kind: 'pillar', x: 3.8, z: 3.2, r: 0.4, h: 2.2 },
	],
	mixed: [
		{ kind: 'pillar', x: 0, z: 0, r: 0.5, h: 2.2 },
		{ kind: 'wall', x: -2.6, z: -3.2, w: 1.8, d: 0.35, h: 0.9 },
		{ kind: 'wall', x: 2.6, z: -3.2, w: 1.8, d: 0.35, h: 0.9 },
		{ kind: 'wall', x: -2.6, z: 3.2, w: 1.8, d: 0.35, h: 0.9 },
		{ kind: 'wall', x: 2.6, z: 3.2, w: 1.8, d: 0.35, h: 0.9 },
	],
})

export const SIGHT_HEIGHT = 1.2 // obstacles at least this tall block a shot; lower ones are jumped and shot over

// Signed distance from (x,z) to the shape's footprint (negative inside) and the outward normal at the closest point.
export function distanceTo(x, z, o, out = { d: 0, nx: 0, nz: 0 }) {
	if (o.kind === 'pillar') {
		const dx = x - o.x
		const dz = z - o.z
		const len = Math.hypot(dx, dz)
		out.d = len - o.r
		out.nx = len > 1e-6 ? dx / len : 1
		out.nz = len > 1e-6 ? dz / len : 0
		return out
	}
	const hw = o.w / 2
	const hd = o.d / 2
	const dx = x - o.x
	const dz = z - o.z
	const ox = Math.abs(dx) - hw
	const oz = Math.abs(dz) - hd
	if (ox > 0 || oz > 0) {
		const ex = Math.max(ox, 0)
		const ez = Math.max(oz, 0)
		out.d = Math.hypot(ex, ez)
		out.nx = ox > 0 ? Math.sign(dx) * (ex / out.d) : 0
		out.nz = oz > 0 ? Math.sign(dz) * (ez / out.d) : 0
		return out
	}
	// Inside: push out along the shallower axis.
	if (ox > oz) {
		out.d = ox
		out.nx = Math.sign(dx) || 1
		out.nz = 0
	} else {
		out.d = oz
		out.nx = 0
		out.nz = Math.sign(dz) || 1
	}
	return out
}

export function pointInside(x, z, obstacles, pad = 0) {
	for (const o of obstacles) if (distanceTo(x, z, o, _d).d < pad) return true
	return false
}
const _d = { d: 0, nx: 0, nz: 0 }

function segmentHitsCircle(ax, az, bx, bz, cx, cz, r) {
	const dx = bx - ax
	const dz = bz - az
	const len2 = dx * dx + dz * dz
	let t = len2 > 0 ? ((cx - ax) * dx + (cz - az) * dz) / len2 : 0
	t = Math.max(0, Math.min(1, t))
	const px = ax + dx * t - cx
	const pz = az + dz * t - cz
	return px * px + pz * pz <= r * r
}

function segmentHitsBox(ax, az, bx, bz, cx, cz, hw, hd) {
	// Slab test against the box's extents.
	const dx = bx - ax
	const dz = bz - az
	let t0 = 0
	let t1 = 1
	for (const [a, d, c, h] of [
		[ax, dx, cx, hw],
		[az, dz, cz, hd],
	]) {
		if (Math.abs(d) < 1e-9) {
			if (a < c - h || a > c + h) return false
			continue
		}
		let tn = (c - h - a) / d
		let tf = (c + h - a) / d
		if (tn > tf) [tn, tf] = [tf, tn]
		t0 = Math.max(t0, tn)
		t1 = Math.min(t1, tf)
		if (t0 > t1) return false
	}
	return true
}

// Does the ground-plane segment A→B cross any obstacle tall enough to block a shot?
export function blocksSight(ax, az, bx, bz, obstacles, minHeight = SIGHT_HEIGHT) {
	for (const o of obstacles) {
		if (o.h < minHeight) continue
		const hit =
			o.kind === 'pillar'
				? segmentHitsCircle(ax, az, bx, bz, o.x, o.z, o.r)
				: segmentHitsBox(ax, az, bx, bz, o.x, o.z, o.w / 2, o.d / 2)
		if (hit) return true
	}
	return false
}

// Deflect a desired move around nearby obstacles ahead of it: part push-away, part slide along the tangent, weighted by proximity. Mutates and returns `move`.
export function steerAround(move, x, z, obstacles, clearance = 1.1) {
	const mx = move.x
	const mz = move.z
	const ml = Math.hypot(mx, mz)
	if (ml < 1e-6) return move
	let ax = 0
	let az = 0
	for (const o of obstacles) {
		const { d, nx, nz } = distanceTo(x, z, o, _d)
		if (d >= clearance) continue
		// Only obstacles we are moving toward matter; one behind us is already passed.
		if ((-nx * mx - nz * mz) / ml < -0.2 && d > 0) continue
		const w = 1 - Math.max(0, d) / clearance
		// Tangent on whichever side keeps most of the intended heading.
		let tx = -nz
		let tz = nx
		if (tx * mx + tz * mz < 0) {
			tx = -tx
			tz = -tz
		}
		ax += (nx * 0.6 + tx) * w * ml
		az += (nz * 0.6 + tz) * w * ml
	}
	move.x = mx + ax
	move.z = mz + az
	return move
}
