import * as THREE from 'three'

// Flagfall's hedge as a beach windbreak: striped canvas panels zig-zagging between wooden
// poles, on a low sand berm. Pure geometry; map.js merges each role into one mesh.

export const WINDBREAK_ROLES = {
	sand: 'sand',
	wood: 'driftwood',
	stripes: ['seaTeal', 'cream', 'terracotta'],
}

const PANEL = 1.3 // target panel width, metres before scale
const flat = (geometry) => {
	const g = geometry.index ? geometry.toNonIndexed() : geometry
	g.computeVertexNormals()
	return g
}

// Same input, same wobble: a rebuilt map must look identical.
const hash = (x, z, i) => {
	const v = Math.sin(x * 127.1 + z * 311.7 + i * 74.7) * 43758.5453
	return v - Math.floor(v) - 0.5
}

// A frustum filling the footprint, its corners nudged so no two berms match.
function berm(box, height, seed) {
	const g = new THREE.CylinderGeometry(Math.SQRT2 * 0.8, Math.SQRT2, 1, 4, 1)
	g.rotateY(Math.PI / 4)
	g.scale(box.halfX, height, box.halfZ)
	const p = g.attributes.position
	for (let i = 0; i < p.count; i++) {
		const top = p.getY(i) > 0
		p.setXYZ(
			i,
			p.getX(i) + hash(p.getX(i), p.getZ(i), seed) * 0.5,
			p.getY(i) + (top ? hash(p.getX(i), p.getZ(i), seed + 1) * height * 0.3 : 0),
			p.getZ(i),
		)
	}
	g.translate(box.x, height / 2, box.z)
	return flat(g)
}

// One canvas panel between two pole feet: a thin slab, tops leaning and sagging a touch.
function panel(a, b, base, height, thickness, seed) {
	const length = Math.hypot(b.x - a.x, b.z - a.z)
	const g = new THREE.BoxGeometry(length, height, thickness, 1, 1, 1)
	const p = g.attributes.position
	for (let i = 0; i < p.count; i++) {
		if (p.getY(i) <= 0) continue
		p.setXYZ(
			i,
			p.getX(i),
			p.getY(i) + hash(p.getX(i), seed, 3) * height * 0.22,
			p.getZ(i) + hash(p.getX(i), seed, 4) * thickness * 2,
		)
	}
	g.rotateY(-Math.atan2(b.z - a.z, b.x - a.x))
	g.translate((a.x + b.x) / 2, base + height / 2, (a.z + b.z) / 2)
	return flat(g)
}

function pole(x, z, base, height, seed) {
	const g = new THREE.CylinderGeometry(0.07, 0.1, height, 5, 1)
	const p = g.attributes.position
	const lean = hash(x, z, seed) * 0.25
	for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setX(i, p.getX(i) + lean)
	g.translate(x, base + height / 2, z)
	return flat(g)
}

// `height` is the hedge height (already map-scaled); `box` the hedge's collision box.
export function windbreakGeometries(box, height, scale = 1) {
	const out = { sand: [], wood: [], stripes: [[], [], []] }
	const bermHeight = height * 0.3
	out.sand.push(berm(box, bermHeight, box.x * 3 + box.z))
	const panels = Math.max(2, Math.round((box.halfX * 2 - 0.8 * scale) / (PANEL * scale)))
	const span = (box.halfX * 2 - 0.8 * scale) / panels
	const zig = Math.min(box.halfZ * 0.55, 0.45 * scale)
	const stationAt = (i) => ({
		x: box.x - box.halfX + 0.4 * scale + i * span,
		z: box.z + (i % 2 ? zig : -zig),
	})
	const panelHeight = height * 0.95
	for (let i = 0; i <= panels; i++) {
		const s = stationAt(i)
		out.wood.push(pole(s.x, s.z, bermHeight * 0.6, height * 1.3, i + box.x))
		if (i < panels)
			out.stripes[(i + Math.abs(Math.round(box.x))) % 3].push(
				panel(s, stationAt(i + 1), bermHeight * 0.8, panelHeight, 0.1 * scale, i + box.x * 7),
			)
	}
	return out
}
