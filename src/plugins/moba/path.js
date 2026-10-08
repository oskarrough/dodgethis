import { OBSTACLES, FLOOR, walkable, clampWalkable, segmentClear } from './obstacles.js'

// Cache the static grid for a run. Live radius/clearance/grid changes invalidate it on the next order, not on a tick.
export function createPathPlanner(options, obstacles = OBSTACLES, bounds = FLOOR) {
	let grid = buildGrid(options, obstacles, bounds)
	return (from, to, next = options) => {
		if (next.radius !== grid.radius || next.clearance !== grid.clearance || next.grid !== grid.grid)
			grid = buildGrid(next, obstacles, bounds)
		return route(from, to, grid)
	}
}

function buildGrid({ radius, clearance, grid }, obstacles, bounds) {
	const nx = Math.ceil((bounds.halfX * 2) / grid)
	const nz = Math.ceil((bounds.halfZ * 2) / grid)
	const point = (c) => ({
		x: ((c % nx) + 0.5) * grid - bounds.halfX,
		z: (Math.floor(c / nx) + 0.5) * grid - bounds.halfZ,
	})
	const open = new Uint8Array(nx * nz)
	// Mark an entire cell free, not merely its centre: this also protects edges near circle tangencies.
	const margin = radius + clearance + grid * Math.SQRT1_2
	for (let c = 0; c < open.length; c++) {
		const p = point(c)
		open[c] = walkable(p.x, p.z, margin, 0, obstacles, bounds) ? 1 : 0
	}
	// A* scratch, reset on every search.
	const scratch = {
		g: new Float32Array(nx * nz),
		from: new Int32Array(nx * nz),
		closed: new Uint8Array(nx * nz),
		heap: { f: [], c: [] },
	}
	return { radius, clearance, grid, nx, nz, point, open, obstacles, bounds, scratch }
}

function route(
	from,
	to,
	{ radius, clearance, grid, nx, nz, point, open, obstacles, bounds, scratch },
) {
	if (!walkable(from.x, from.z, radius, 0, obstacles, bounds)) return []
	const inflate = radius + clearance
	const firstMargin = walkable(from.x, from.z, radius, clearance, obstacles, bounds)
		? inflate
		: radius
	to = clampWalkable(to, radius, clearance, obstacles, bounds)
	if (firstMargin === inflate && segmentClear(from, to, inflate, obstacles, bounds))
		return [{ ...to }]
	const nearestOpen = (p, margin) => {
		const ci = Math.max(0, Math.min(nx - 1, Math.floor((p.x + bounds.halfX) / grid)))
		const cj = Math.max(0, Math.min(nz - 1, Math.floor((p.z + bounds.halfZ) / grid)))
		for (let r = 0; r < Math.max(nx, nz); r++) {
			const candidates = []
			for (let j = Math.max(0, cj - r); j <= Math.min(nz - 1, cj + r); j++)
				for (let i = Math.max(0, ci - r); i <= Math.min(nx - 1, ci + r); i++) {
					if (r && Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue
					const c = j * nx + i
					if (open[c]) candidates.push(c)
				}
			candidates.sort((a, b) => {
				const pa = point(a),
					pb = point(b)
				return Math.hypot(pa.x - p.x, pa.z - p.z) - Math.hypot(pb.x - p.x, pb.z - p.z)
			})
			for (const c of candidates) if (segmentClear(p, point(c), margin, obstacles, bounds)) return c
		}
		return -1
	}
	const start = nearestOpen(from, firstMargin),
		goal = nearestOpen(to, inflate)
	if (start < 0 || goal < 0) return []
	const cells = astar(open, nx, nz, start, goal, scratch)
	if (!cells) return []
	const points = [from, ...cells.map(point), to]
	// A tight start rejoins a fully clear grid cell before any shortcut is considered.
	const pulled = firstMargin === inflate ? [] : [{ ...points[1] }]
	let i = firstMargin === inflate ? 0 : 1
	while (i < points.length - 1) {
		let j = points.length - 1
		while (j > i && !segmentClear(points[i], points[j], inflate, obstacles, bounds)) j--
		if (j === i) return []
		pulled.push({ ...points[j] })
		i = j
	}
	return pulled
}

// 8-connected A* with no corner cutting; returns cell indices from start to goal, or null.
function astar(open, n, rows, start, goal, { g, from, closed, heap }) {
	const gx = goal % n
	const gz = (goal / n) | 0
	const h = (c) => {
		const dx = Math.abs((c % n) - gx)
		const dz = Math.abs(((c / n) | 0) - gz)
		return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)
	}
	g.fill(Infinity)
	from.fill(-1)
	closed.fill(0)
	heap.f.length = heap.c.length = 0
	push(heap, h(start), start)
	g[start] = 0
	while (heap.f.length) {
		const c = pop(heap)
		if (c === goal) break
		if (closed[c]) continue
		closed[c] = 1
		const ci = c % n
		const cj = (c / n) | 0
		for (let dj = -1; dj <= 1; dj++)
			for (let di = -1; di <= 1; di++) {
				if (!di && !dj) continue
				const i = ci + di
				const j = cj + dj
				if (i < 0 || j < 0 || i >= n || j >= rows) continue
				const next = j * n + i
				if (!open[next] || closed[next]) continue
				if (di && dj && (!open[cj * n + i] || !open[j * n + ci])) continue
				const cost = g[c] + (di && dj ? Math.SQRT2 : 1)
				if (cost >= g[next]) continue
				g[next] = cost
				from[next] = c
				push(heap, cost + h(next), next)
			}
	}
	if (from[goal] < 0 && goal !== start) return null
	const path = [goal]
	for (let c = goal; c !== start; c = from[c]) path.push(from[c])
	return path.reverse()
}

// A binary min-heap on f, stored as two parallel arrays; ties resolve exactly as a heap of [f, cell] pairs did.
function push({ f, c }, key, cell) {
	f.push(key)
	c.push(cell)
	let i = f.length - 1
	while (i > 0) {
		const parent = (i - 1) >> 1
		if (f[parent] <= f[i]) break
		swap(f, c, parent, i)
		i = parent
	}
}
function pop({ f, c }) {
	const top = c[0]
	const lastF = f.pop()
	const lastC = c.pop()
	if (f.length) {
		f[0] = lastF
		c[0] = lastC
		let i = 0
		for (;;) {
			const l = i * 2 + 1
			const r = l + 1
			let m = i
			if (l < f.length && f[l] < f[m]) m = l
			if (r < f.length && f[r] < f[m]) m = r
			if (m === i) break
			swap(f, c, m, i)
			i = m
		}
	}
	return top
}
function swap(f, c, a, b) {
	const tf = f[a]
	f[a] = f[b]
	f[b] = tf
	const tc = c[a]
	c[a] = c[b]
	c[b] = tc
}

// Pursuit along a polyline [from, ...waypoints]: the point `ahead` metres past the body's projection, and the distance left.
// `path.leg` is the index of the segment being walked; it only moves forward.
export function pursue(path, pos, ahead) {
	const pts = path.points
	let k = path.leg
	let t = 0
	for (;;) {
		const a = pts[k]
		const b = pts[k + 1]
		const dx = b.x - a.x
		const dz = b.z - a.z
		const len2 = dx * dx + dz * dz
		t = len2 > 0 ? Math.max(0, Math.min(1, ((pos.x - a.x) * dx + (pos.z - a.z) * dz) / len2)) : 1
		if (k >= pts.length - 2) break
		if (t < 1) {
			// Look-ahead turns before a vertex: advance once the next leg is the closer forward projection.
			const c = pts[k + 2],
				nx = c.x - b.x,
				nz = c.z - b.z
			const nextLen2 = nx * nx + nz * nz
			const u = nextLen2
				? Math.max(0, Math.min(1, ((pos.x - b.x) * nx + (pos.z - b.z) * nz) / nextLen2))
				: 0
			const currentDistance = Math.hypot(pos.x - a.x - dx * t, pos.z - a.z - dz * t)
			const nextDistance = Math.hypot(pos.x - b.x - nx * u, pos.z - b.z - nz * u)
			if (u <= 0 || nextDistance >= currentDistance) break
		}
		k++
	}
	path.leg = k
	const a = pts[k]
	const b = pts[k + 1]
	let px = a.x + (b.x - a.x) * t
	let pz = a.z + (b.z - a.z) * t
	let left = ahead
	let remaining = 0
	let carrot = null
	for (let i = k; i < pts.length - 1; i++) {
		const ex = pts[i + 1].x
		const ez = pts[i + 1].z
		const seg = Math.hypot(ex - px, ez - pz)
		remaining += seg
		if (!carrot && seg >= left) {
			const s = seg > 0 ? left / seg : 0
			carrot = { x: px + (ex - px) * s, z: pz + (ez - pz) * s }
		} else if (!carrot) left -= seg
		px = ex
		pz = ez
	}
	const end = pts.at(-1)
	return { carrot: carrot ?? { x: end.x, z: end.z }, remaining }
}
