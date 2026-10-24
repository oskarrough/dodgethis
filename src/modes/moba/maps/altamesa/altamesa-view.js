import * as THREE from 'three'
import { tune } from '../../tune.js'

// Sand to the walls, and a squat stone for each waystone. Bosses and packs bring their own bodies.
export function ground({ add, material, m }) {
	const s = tune.altamesa
	add(
		new THREE.PlaneGeometry(s.halfX * 2, s.halfZ * 2).rotateX(-Math.PI / 2),
		material('cream', { flat: true }),
		0,
		m.printLayers.lobby,
		0,
	)
	const stone = s.view.waystone
	for (const w of s.waystones)
		add(
			new THREE.CylinderGeometry(stone.top, stone.radius, stone.height, stone.sides),
			material('scenery'),
			w.x,
			stone.height / 2,
			w.z,
		)
}
