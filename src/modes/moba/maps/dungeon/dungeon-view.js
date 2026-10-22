import * as THREE from 'three'
import { tune } from '../../tune.js'

export function ground({ add, material, m }) {
	const shape = new THREE.Shape()
	shape.absarc(0, 0, tune.dungeon.radius, 0, Math.PI * 2, false)
	add(
		new THREE.ShapeGeometry(shape, tune.dungeon.segments).rotateX(-Math.PI / 2),
		material('cream', { flat: true }),
		0,
		m.printLayers.lobby,
		0,
	)
}
