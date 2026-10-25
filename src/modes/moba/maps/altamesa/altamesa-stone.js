import * as THREE from 'three'
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js'
import { tune } from '../../tune.js'

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
export function flower(radius, relief) {
	const c = tune.altamesa.walls
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
