import * as THREE from 'three'

// Flagfall's yard cover, redrawn as a mooring bollard: a fat painted iron post with a flared
// cap, a few coils of rope round its waist and a lifebuoy lying round its foot, on a sand pad.
// Faceted and a little wonky, like the windbreaks. Pure geometry; map.js merges each role
// into one mesh.

export const BOLLARD_ROLES = {
	sand: 'sand',
	body: 'seaTeal',
	cap: 'scenery',
	rope: 'driftwood',
	buoy: 'terracotta',
	bands: 'cream',
}

const SIDES = 7 // odd on purpose: no two facets face the same way
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

// Lathe the profile ([radius, height] pairs) and nudge the top over, so no two posts match.
function lathe(points, x, z, lean, seed) {
	const g = new THREE.LatheGeometry(
		points.map(([r, y]) => new THREE.Vector2(r, y)),
		SIDES,
	)
	const top = Math.max(...points.map((p) => p[1]))
	const p = g.attributes.position
	const tilt = hash(x, z, seed) * lean
	const turn = hash(x, z, seed + 1) * Math.PI
	for (let i = 0; i < p.count; i++) {
		const k = p.getY(i) / top
		p.setX(i, p.getX(i) + tilt * k * k)
	}
	g.rotateY(turn)
	g.translate(x, 0, z)
	return flat(g)
}

// A ring lying flat at height y, tube radius `tube`, tipped a hair so it sits on the sand.
function ring(radius, tube, y, x, z, seed, arc = Math.PI * 2, spin = 0) {
	const g = new THREE.TorusGeometry(radius, tube, 5, arc < Math.PI * 2 ? 2 : 10, arc)
	g.rotateZ(spin)
	g.rotateX(Math.PI / 2)
	g.rotateX(hash(x, z, seed) * 0.12)
	g.rotateZ(hash(x, z, seed + 1) * 0.12)
	g.translate(x, y, z)
	return flat(g)
}

// `p` is the pillar's collision circle ({ x, z, r }), `height` the old pillar height
// (already map-scaled). Everything stays inside the circle.
export function bollardGeometries(p, height) {
	const { x, z, r } = p
	const out = { sand: [], body: [], cap: [], rope: [], buoy: [], bands: [] }
	const seed = Math.round(x * 3 + z * 7)
	const padHeight = height * 0.05
	const pad = new THREE.CylinderGeometry(r * 0.9, r, padHeight, 8, 1)
	pad.translate(x, padHeight / 2, z)
	out.sand.push(flat(pad))

	const h = height * 1.25
	const waist = r * 0.5
	out.body.push(
		lathe(
			[
				[0.001, 0],
				[waist * 1.25, 0],
				[waist * 1.05, h * 0.12],
				[waist, h * 0.3],
				[waist * 0.92, h * 0.74],
				[waist * 0.8, h * 0.78],
			],
			x,
			z,
			0.12,
			seed,
		),
	)
	// Flared cap: a lip that overhangs the waist, then a blunt dome-ish top.
	out.cap.push(
		lathe(
			[
				[waist * 0.8, h * 0.76],
				[waist * 1.3, h * 0.8],
				[waist * 1.32, h * 0.92],
				[waist * 1.15, h],
				[0.001, h],
			],
			x,
			z,
			0.12,
			seed,
		),
	)

	// Rope: two fat coils on the waist, each a touch off level.
	for (let i = 0; i < 2; i++)
		out.rope.push(
			ring(
				waist * (1.05 - i * 0.02) + r * 0.04,
				r * 0.13,
				h * (0.3 + i * 0.22),
				x,
				z,
				seed + i * 5,
			),
		)

	// A coil of spare rope on top: the camera looks down, so the top has to read too.
	out.rope.push(ring(waist * 0.8, r * 0.13, h + r * 0.05, x, z, seed + 20))

	// Lifebuoy lying round the foot: terracotta ring with four cream bands.
	const buoyRadius = r * 0.78
	const buoyTube = r * 0.2
	const buoyY = padHeight + buoyTube * 0.8
	const turn = hash(x, z, seed + 9) * Math.PI
	out.buoy.push(ring(buoyRadius, buoyTube, buoyY, x, z, seed + 11))
	for (let i = 0; i < 4; i++)
		out.bands.push(
			ring(
				buoyRadius,
				buoyTube * 1.08,
				buoyY,
				x,
				z,
				seed + 11,
				Math.PI / 4,
				turn + (i * Math.PI) / 2,
			),
		)
	return out
}
