import * as THREE from 'three'

// Tennis-ish proportions: longer than wide. Units are meters.
export const COURT = { width: 11, depth: 24, thickness: 1 }

// Walk off the edge and gravity takes you. Fall below this Y and you've hit the
// (invisible) lava under the platform — instant death. The floor top is at y=0,
// so this leaves a brief, readable drop before the kill.
export const KILL_Y = -5

// Builds the floor: a Three mesh + a matching fixed Rapier collider.
export function buildCourt(scene, world, RAPIER) {
	const { width, depth, thickness } = COURT

	const mesh = new THREE.Mesh(
		new THREE.BoxGeometry(width, thickness, depth),
		new THREE.MeshStandardMaterial({ color: 0x2f6b3d, roughness: 0.95 }),
	)
	mesh.position.y = -thickness / 2
	mesh.receiveShadow = true
	scene.add(mesh)

	// Center line (the "net" line) for orientation.
	const line = new THREE.Mesh(
		new THREE.BoxGeometry(width, 0.02, 0.12),
		new THREE.MeshBasicMaterial({ color: 0xeaf0ff }),
	)
	line.position.y = 0.011
	scene.add(line)

	const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
	world.createCollider(
		RAPIER.ColliderDesc.cuboid(width / 2, thickness / 2, depth / 2).setTranslation(
			0,
			-thickness / 2,
			0,
		),
		body,
	)

	return mesh
}
