import { FLOOR, PILLARS, walkable } from './map.js'

// Pathing (docs/moba-plan.md, "Pathing"): straight when the segment clears every static circle, otherwise A* on a grid, then string-pulling.

// Does a→b keep `inflate` clear of every circle? A start already inside that margin may still leave it.
export function segmentClear(a, b, inflate, circles = PILLARS) {
	const dx = b.x - a.x
	const dz = b.z - a.z
	const len2 = dx * dx + dz * dz
	for (const c of circles) {
		const need = c.r + inflate
		const t = len2 > 0 ? Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.z - a.z) * dz) / len2)) : 0
		const closest = Math.hypot(a.x + dx * t - c.x, a.z + dz * t - c.z)
		if (closest >= need - 1e-6) continue
		if (closest >= Math.hypot(a.x - c.x, a.z - c.z) - 1e-6) continue // heading out, never deeper
		return false
	}
	return true
}

// Waypoints from `from` to `to` (both {x, z}), excluding `from` and ending on `to`.
export function planPath(from, to, { radius, clearance, grid }) {
	const inflate = radius + clearance
	if (segmentClear(from, to, inflate)) return [{ x: to.x, z: to.z }]
	const n = Math.ceil((FLOOR.half * 2) / grid)
	const centre = (i) => (i + 0.5) * grid - FLOOR.half
	const cellOf = (v) => Math.max(0, Math.min(n - 1, Math.floor((v + FLOOR.half) / grid)))
	const open = new Uint8Array(n * n)
	for (let j = 0; j < n; j++)
		for (let i = 0; i < n; i++)
			open[j * n + i] = walkable(centre(i), centre(j), radius, clearance) ? 1 : 0
	const nearestOpen = (p) => {
		const ci = cellOf(p.x)
		const cj = cellOf(p.z)
		let best = -1
		let bestD = Infinity
		for (let r = 0; r < 6 && best < 0; r++)
			for (let j = Math.max(0, cj - r); j <= Math.min(n - 1, cj + r); j++)
				for (let i = Math.max(0, ci - r); i <= Math.min(n - 1, ci + r); i++) {
					if (!open[j * n + i]) continue
					const d = Math.hypot(centre(i) - p.x, centre(j) - p.z)
					if (d < bestD) {
						bestD = d
						best = j * n + i
					}
				}
		return best
	}
	const start = nearestOpen(from)
	const goal = nearestOpen(to)
	if (start < 0 || goal < 0) return [{ x: to.x, z: to.z }]
	const cells = astar(open, n, start, goal)
	if (!cells) return [{ x: to.x, z: to.z }]
	const points = [
		from,
		...cells.slice(1, -1).map((c) => ({ x: centre(c % n), z: centre((c / n) | 0) })),
		to,
	]
	// String-pull: from each kept point, jump to the farthest point still in plain sight.
	const pulled = []
	let i = 0
	while (i < points.length - 1) {
		let j = points.length - 1
		while (j > i + 1 && !segmentClear(points[i], points[j], inflate)) j--
		pulled.push({ x: points[j].x, z: points[j].z })
		i = j
	}
	return pulled
}

// 8-connected A* with no corner cutting; returns cell indices from start to goal, or null.
function astar(open, n, start, goal) {
	const gx = goal % n
	const gz = (goal / n) | 0
	const h = (c) => {
		const dx = Math.abs((c % n) - gx)
		const dz = Math.abs(((c / n) | 0) - gz)
		return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)
	}
	const g = new Float32Array(n * n).fill(Infinity)
	const from = new Int32Array(n * n).fill(-1)
	const closed = new Uint8Array(n * n)
	const heap = [[h(start), start]]
	g[start] = 0
	while (heap.length) {
		const [, c] = pop(heap)
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
				if (i < 0 || j < 0 || i >= n || j >= n) continue
				const next = j * n + i
				if (!open[next] || closed[next]) continue
				if (di && dj && (!open[cj * n + i] || !open[j * n + ci])) continue
				const cost = g[c] + (di && dj ? Math.SQRT2 : 1)
				if (cost >= g[next]) continue
				g[next] = cost
				from[next] = c
				push(heap, [cost + h(next), next])
			}
	}
	if (from[goal] < 0 && goal !== start) return null
	const path = [goal]
	for (let c = goal; c !== start; c = from[c]) path.push(from[c])
	return path.reverse()
}

function push(heap, item) {
	heap.push(item)
	let i = heap.length - 1
	while (i > 0) {
		const parent = (i - 1) >> 1
		if (heap[parent][0] <= heap[i][0]) break
		;[heap[parent], heap[i]] = [heap[i], heap[parent]]
		i = parent
	}
}
function pop(heap) {
	const top = heap[0]
	const last = heap.pop()
	if (heap.length) {
		heap[0] = last
		let i = 0
		for (;;) {
			const l = i * 2 + 1
			const r = l + 1
			let m = i
			if (l < heap.length && heap[l][0] < heap[m][0]) m = l
			if (r < heap.length && heap[r][0] < heap[m][0]) m = r
			if (m === i) break
			;[heap[m], heap[i]] = [heap[i], heap[m]]
			i = m
		}
	}
	return top
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
		if (t < 1 || k >= pts.length - 2) break
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
