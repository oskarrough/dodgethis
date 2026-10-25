import * as THREE from 'three'
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Carving has no palette, scene or tune dependency. Callers supply dimensions, carving
// values and a seeded random stream, and own the returned position/normal geometry.
// Intermediate geometry is consumed here, so a whole wall or prop is one draw per role.
function joinCarving(parts) {
	if (!parts.length) return null
	const ready = parts.map((g) => {
		if (g.index) {
			const indexed = g
			g = indexed.toNonIndexed()
			indexed.dispose()
		}
		g.deleteAttribute('uv')
		return g
	})
	const geometry = mergeGeometries(ready)
	for (const g of ready) g.dispose()
	return geometry
}

// Broad bevels and unequal corner bites, as on the flower walls.
export function sandstone(width, height, depth, chip = 0) {
	const bevel = Math.min(0.12, width / 5, height / 4, depth / 5)
	const points = []
	for (const [y, inset] of [
		[-height / 2, bevel],
		[-height / 2 + bevel, 0],
		[height / 2 - bevel, 0],
		[height / 2, bevel],
	]) {
		const x = width / 2 - inset
		const z = depth / 2 - inset
		for (const [sx, sz] of [
			[1, 1],
			[-1, 1],
			[-1, -1],
			[1, -1],
		]) {
			const cut = Math.min(bevel * (sx === sz ? 1 : 2) + chip, x * 0.4, z * 0.4)
			points.push(new THREE.Vector3(sx * (x - cut), y, sz * z))
			points.push(new THREE.Vector3(sx * x, y, sz * (z - cut)))
		}
	}
	if (chip > 0.12) {
		for (const point of points) {
			point.y += Math.sin(point.x * 4.7 + point.z * 2.3) * chip
			point.x += Math.sin(point.z * 3.2) * chip * 2
		}
	}
	return new ConvexGeometry(points)
}

// The wall's eight-petalled relief, facing +z; callers set the size and stone face.
export function flowerPanel(radius, relief, c) {
	const vertices = []
	for (let petal = 0; petal < c.petals; petal++) {
		const angle = (petal * Math.PI * 2) / c.petals
		const middle = (radius * (1 + c.flowerHeart)) / 2
		const edge = Array.from({ length: c.petalSides }, (_, j) => {
			const a = (j * Math.PI * 2) / c.petalSides
			return new THREE.Vector3(
				Math.cos(a) * radius * c.petalWidth,
				middle + Math.sin(a) * (radius - middle),
				0,
			).applyAxisAngle(new THREE.Vector3(0, 0, 1), angle)
		})
		const ridge = new THREE.Vector3(-Math.sin(angle) * middle, Math.cos(angle) * middle, relief)
		for (let j = 0; j < edge.length; j++)
			vertices.push(...edge[j], ...edge[(j + 1) % edge.length], ...ridge)
	}
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
	geometry.computeVertexNormals()
	return geometry
}

export function chippedBlock(width, height, depth, c, rand) {
	const bevel = Math.min(c.bevel, width / 4, height / 4, depth / 4)
	const cuts = Array.from({ length: 4 }, () => bevel + rand() * c.chip)
	const points = []
	for (const [y, inset] of [
		[-height / 2, bevel],
		[-height / 2 + bevel, 0],
		[height / 2 - bevel, 0],
		[height / 2, bevel],
	]) {
		const x = width / 2 - inset
		const z = depth / 2 - inset
		let corner = 0
		for (const [sx, sz] of [
			[1, 1],
			[-1, 1],
			[-1, -1],
			[1, -1],
		]) {
			const cut = Math.min(cuts[corner++], x / 2, z / 2)
			points.push(new THREE.Vector3(sx * (x - cut), y, sz * z))
			points.push(new THREE.Vector3(sx * x, y, sz * (z - cut)))
		}
	}
	return new ConvexGeometry(points)
}

// Geometry for a run of collision boxes: stone and moss each form one batch.
export function carvedWalls(boxes, heightOf, c, rand) {
	const stone = []
	const moss = []
	const block = (width, height, depth) => chippedBlock(width, height, depth, c, rand)

	for (const b of boxes) {
		const h = heightOf(b)
		const top = h - c.mossHeight
		const foot = Math.min(c.footHeight, h / 6)
		const cap = Math.min(c.capHeight, h / 5)
		const faceHeight = top - foot - cap
		const width = b.halfX * 2
		const depth = b.halfZ * 2
		const nx = Math.max(1, Math.ceil(width / c.blockWidth))
		const nz = Math.max(1, Math.ceil(depth / c.blockWidth))
		const dx = width / nx
		const dz = depth / nz
		// Clamp after orienting: even a tuned petal or lichen tip cannot cross the collider.
		const put = (geometry, batch = stone) => {
			if (geometry.index) {
				const indexed = geometry
				geometry = indexed.toNonIndexed()
				indexed.dispose()
			}
			geometry.deleteAttribute('uv')
			const p = geometry.attributes.position
			for (let i = 0; i < p.count; i++)
				p.setXYZ(
					i,
					b.x + THREE.MathUtils.clamp(p.getX(i), -b.halfX, b.halfX),
					THREE.MathUtils.clamp(p.getY(i), 0, h),
					b.z + THREE.MathUtils.clamp(p.getZ(i), -b.halfZ, b.halfZ),
				)
			geometry.computeVertexNormals()
			batch.push(geometry)
		}
		for (let ix = 0; ix < nx; ix++) {
			for (let iz = 0; iz < nz; iz++) {
				const x = -b.halfX + (ix + 0.5) * dx
				const z = -b.halfZ + (iz + 0.5) * dz
				const left = ix === 0 ? c.faceInset : c.joint / 2
				const right = ix === nx - 1 ? c.faceInset : c.joint / 2
				const back = iz === 0 ? c.faceInset : c.joint / 2
				const front = iz === nz - 1 ? c.faceInset : c.joint / 2
				put(block(dx - c.joint, foot - c.joint, dz - c.joint).translate(x, foot / 2, z))
				put(
					block(dx - left - right, faceHeight - c.joint, dz - back - front).translate(
						x + (left - right) / 2,
						foot + faceHeight / 2,
						z + (back - front) / 2,
					),
				)
				put(block(dx - c.joint, cap / 2 - c.joint, dz - c.joint).translate(x, top - cap * 0.75, z))
				put(block(dx - c.capStep * 2, cap / 2, dz - c.capStep * 2).translate(x, top - cap / 4, z))
				if (rand() < c.mossChance) {
					const reach = Math.min(c.mossReach, dx / 2, dz / 2)
					for (let lobe = 0; lobe < c.mossLobes; lobe++) {
						const angle = (lobe * Math.PI * 2) / c.mossLobes
						const radius = reach * (0.5 + rand() / 2)
						put(
							new THREE.IcosahedronGeometry(1, 1)
								.scale(radius, c.mossHeight, radius)
								.translate(
									x + (Math.cos(angle) * reach) / 2,
									top,
									z + (Math.sin(angle) * reach) / 2,
								),
							moss,
						)
					}
					// Broad hanging lobes join the top patch; the flower below stays exposed.
					for (const [edge, alongX, sign] of [
						[iz === 0, true, -1],
						[iz === nz - 1, true, 1],
						[ix === 0, false, -1],
						[ix === nx - 1, false, 1],
					]) {
						if (!edge) continue
						const curtain = new THREE.IcosahedronGeometry(1, 1)
							.scale(reach, c.mossDrop, c.faceInset)
							.translate(
								alongX ? x : -z,
								top - c.mossDrop / 2,
								sign * ((alongX ? depth : width) / 2 - c.faceInset),
							)
						if (!alongX) curtain.rotateY(Math.PI / 2)
						put(curtain, moss)
					}
				}
			}
		}
		// The same square relief on all four faces, including the kiln block and wall ends.
		for (const [alongX, sign] of [
			[true, -1],
			[true, 1],
			[false, -1],
			[false, 1],
		]) {
			const count = alongX ? nx : nz
			const span = alongX ? dx : dz
			const length = alongX ? width : depth
			const face = (alongX ? depth : width) / 2 - c.faceInset
			const size = Math.min(faceHeight, span) - c.panelGap * 2
			const border = Math.min(c.panelBorder, size / 8)
			const radius = (size - border * 2) * c.flowerRadius
			for (let i = 0; i < count; i++) {
				const u = -length / 2 + (i + 0.5) * span
				const v = foot + faceHeight / 2
				const relief = (geometry) => {
					geometry.translate(u, v, face)
					if (sign < 0) geometry.rotateY(Math.PI)
					if (!alongX) geometry.rotateY(Math.PI / 2)
					put(geometry)
				}
				// A raised square rim leaves the flower's field recessed in the block.
				for (const side of [-1, 1]) {
					relief(
						block(size, border, c.relief).translate(0, (side * (size - border)) / 2, c.relief / 2),
					)
					relief(
						block(border, size - border * 2, c.relief).translate(
							(side * (size - border)) / 2,
							0,
							c.relief / 2,
						),
					)
				}
				relief(flowerPanel(radius, c.relief, c))
				relief(
					new THREE.CylinderGeometry(
						radius * c.flowerHeart,
						radius * c.flowerHeart * 2,
						c.relief,
						c.petals,
					)
						.rotateX(Math.PI / 2)
						.translate(0, 0, c.relief / 2),
				)
			}
		}
	}
	return { stone: joinCarving(stone), moss: joinCarving(moss) }
}

// A framed flower block centred at the origin, with its carving toward +z.
export function carvedBlock(size, carving) {
	const parts = [
		sandstone(size * 1.3, size * 1.3, size * 0.7, 0.08),
		flowerPanel(size * 0.5, size * 0.1, carving).translate(0, 0, size * 0.355),
	]
	for (const side of [-1, 1]) {
		parts.push(
			sandstone(size * 1.18, size * 0.09, size * 0.1).translate(0, side * size * 0.56, size * 0.38),
		)
		parts.push(
			sandstone(size * 0.09, size, size * 0.1).translate(side * size * 0.56, 0, size * 0.38),
		)
	}
	return joinCarving(parts)
}

export function brokenColumn(size, courses, carving) {
	const parts = []

	// A fractured column, with the fallen capital beside it.
	parts.push(sandstone(size * 1.1, size * 0.24, size * 1.1).translate(0, size * 0.12, 0))
	for (let course = 0; course < courses; course++)
		parts.push(
			new THREE.CylinderGeometry(size * 0.35, size * 0.4, size * 0.48, 8)
				.rotateZ(course * 0.04)
				.translate(-course * size * 0.015, size * (0.5 + course * 0.49), 0),
		)
	parts.push(
		sandstone(size * 0.9, size * 0.3, size * 0.9, 0.1)
			.rotateZ(0.6)
			.translate(size * 0.85, size * 0.28, size * 0.1),
	)
	parts.push(flowerPanel(size * 0.23, size * 0.07, carving).translate(0, size * 0.75, size * 0.37))
	return joinCarving(parts)
}

export function ruinStair(size) {
	const parts = []

	// A stair runs along the ledge and stops abruptly over the drop.
	for (let step = 0; step < 5; step++) {
		const h = size * (0.22 + step * 0.23)
		parts.push(
			sandstone(size * 0.48, h, size * 0.95, 0.04).translate((step - 2) * size * 0.46, h / 2, 0),
		)
	}
	return joinCarving(parts)
}

export function brokenArch(size, carving) {
	const parts = []

	// Voussoirs turn out from one surviving jamb; the crown is missing.
	parts.push(
		sandstone(size * 0.75, size * 0.25, size * 0.9).translate(-size * 0.7, size * 0.125, 0),
	)
	for (let course = 0; course < 3; course++)
		parts.push(
			sandstone(size * 0.52, size * 0.43, size * 0.65, 0.04).translate(
				-size * 0.7,
				size * (0.48 + course * 0.44),
				0,
			),
		)
	for (let wedge = 0; wedge < 4; wedge++) {
		const a = Math.PI - wedge * 0.29
		parts.push(
			sandstone(size * 0.49, size * 0.39, size * 0.68, 0.03)
				.rotateZ(a)
				.translate(Math.cos(a) * size * 0.7, size * 1.52 + Math.sin(a) * size * 0.7, 0),
		)
	}
	parts.push(
		flowerPanel(size * 0.2, size * 0.07, carving).translate(-size * 0.7, size * 0.92, size * 0.33),
	)
	return joinCarving(parts)
}

export function bleachedBones(size) {
	const parts = []

	// A small rib cage lies along the shelf, with an angular skull at its end.
	for (let bone = 0; bone < 7; bone++) {
		const x = (bone - 3) * size * 0.25
		parts.push(sandstone(size * 0.19, size * 0.16, size * 0.21).translate(x, size * 0.15, 0))
		if (bone > 0 && bone < 6)
			parts.push(
				new THREE.TorusGeometry(
					size * (0.42 - Math.abs(bone - 3) * 0.04),
					size * 0.055,
					4,
					9,
					Math.PI,
				)
					.rotateY(Math.PI / 2)
					.translate(x, size * 0.13, 0),
			)
	}
	parts.push(
		sandstone(size * 0.43, size * 0.32, size * 0.32, 0.08)
			.rotateZ(-0.2)
			.translate(size, size * 0.2, 0),
	)
	return joinCarving(parts)
}

export function carvedPillar(p, h, carving, relief) {
	const stone = []

	const put = (g) => {
		if (g.index) {
			const indexed = g
			g = indexed.toNonIndexed()
			indexed.dispose()
		}
		g.deleteAttribute('uv')
		// Ornament, cap and base all fit the existing cylinder, including its height.
		const position = g.attributes.position
		for (let i = 0; i < position.count; i++) {
			const x = position.getX(i),
				z = position.getZ(i)
			const shrink = Math.min(1, p.r / (Math.hypot(x, z) || 1))
			position.setXYZ(
				i,
				p.x + x * shrink,
				THREE.MathUtils.clamp(position.getY(i), 0, h),
				p.z + z * shrink,
			)
		}
		g.computeVertexNormals()
		stone.push(g)
	}
	for (const [bottom, top, radius] of [
		[0, 0.14, 0.98],
		[0.15, 0.3, 0.88],
		[0.31, 0.73, 0.78],
		[0.74, 0.83, 0.88],
		[0.84, 0.94, 1],
		[0.94, 1, 0.88],
	]) {
		put(
			new THREE.CylinderGeometry(p.r * radius * 0.97, p.r * radius, h * (top - bottom), 8)
				.rotateY(Math.PI / 8)
				.translate(0, (h * (bottom + top)) / 2, 0),
		)
	}
	for (let side = 0; side < 8; side++) {
		const angle = (side * Math.PI) / 4
		put(
			flowerPanel(Math.min(p.r * 0.27, h * 0.18), p.r * relief, carving)
				.translate(0, h * 0.52, p.r * 0.725)
				.rotateY(angle),
		)
	}
	return joinCarving(stone)
}

// A rib of cliff, not a pile of shelves: tall unequal pillars under a broken lip.
export function ruinStack(size, shape, rand) {
	const parts = []
	for (let column = 0; column < 3; column++) {
		if (column !== 1 && rand() < shape.gaps) continue
		const width = size * (0.68 + rand() * 0.32)
		const depth = size * (shape.depth[0] + rand() * (shape.depth[1] - shape.depth[0]))
		const height = size * (shape.height[0] + rand() * (shape.height[1] - shape.height[0]))
		const top = column === 1 ? 0 : -size * rand() * 0.7
		const x = (column - 1) * size * 0.72
		const z = -size * 0.35 + (rand() - 0.5) * size * 0.4
		const lean = (rand() - 0.5) * shape.tilt
		const split = height * (0.4 + rand() * 0.3)
		for (const [y, h] of [
			[0, split],
			[split, height - split],
		]) {
			parts.push(
				sandstone(width, h - size * 0.025, depth, size * 0.12)
					.translate(0, top - y - h / 2, 0)
					.rotateZ(lean)
					.translate(x, 0, z),
			)
		}
		if (rand() > shape.gaps)
			parts.push(
				sandstone(width * 1.09, size * (0.12 + rand() * 0.12), depth * 1.06, 0.14)
					.rotateZ(lean * 0.7)
					.translate(x, top - split, z),
			)
	}
	return joinCarving(parts)
}

// One crooked trunk leans into +z (out over the drop), with a broken side bough.
export function deadTree(height, shape, rand) {
	const parts = []
	const up = new THREE.Vector3(0, 1, 0)
	const h = height * (0.9 + rand() * 0.5)
	const hand = rand() < 0.5 ? -1 : 1
	const limb = (from, to, bottom, top) => {
		const direction = to.clone().sub(from)
		parts.push(
			new THREE.CylinderGeometry(top, bottom, direction.length(), 6)
				.translate(0, direction.length() / 2, 0)
				.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction.normalize()))
				.translate(from.x, from.y, from.z),
		)
	}
	const root = new THREE.Vector3(0, 0, 0)
	const elbow = new THREE.Vector3(hand * h * 0.12, h * 0.65, h * shape.lean)
	const crook = new THREE.Vector3(-hand * h * 0.2, h * 0.92, h * shape.lean * 1.65)
	const tip = new THREE.Vector3(-hand * h * 0.15, h * 1.35, h * shape.lean * 1.8)
	limb(root, elbow, h * 0.11, h * 0.075)
	limb(elbow, crook, h * 0.075, h * 0.045)
	limb(crook, tip, h * 0.045, h * 0.012)
	const bough = new THREE.Vector3(hand * h * 0.34, h * 0.85, h * shape.lean * 1.6)
	limb(elbow, bough, h * 0.045, h * 0.025)
	limb(
		bough,
		new THREE.Vector3(hand * h * 0.48, h * 1.08, h * shape.lean * 1.64),
		h * 0.025,
		h * 0.008,
	)
	limb(
		crook,
		new THREE.Vector3(-hand * h * 0.42, h * 1.03, h * shape.lean * 1.65),
		h * 0.025,
		h * 0.008,
	)
	for (const side of [-1, 1])
		limb(root, new THREE.Vector3(side * h * 0.3, 0.03, -h * 0.12), h * 0.075, h * 0.02)
	return joinCarving(parts)
}

// Low scalloped patches drape over a stone edge; x/z offsets keep the lobes irregular.
export function lichenClump(radius, shape, rand) {
	const parts = []
	for (let lobe = 0; lobe < shape.lobes; lobe++) {
		const a = (lobe * Math.PI * 2) / shape.lobes
		const r = radius * (0.55 + rand() * 0.25)
		parts.push(
			new THREE.SphereGeometry(r, 8, 5)
				.scale(1, shape.squash, 0.8)
				.translate(
					Math.cos(a) * radius * (0.4 + rand() * 0.2),
					(rand() - 0.5) * radius * 0.1,
					Math.sin(a) * radius * 0.5,
				),
		)
	}
	return joinCarving(parts)
}
