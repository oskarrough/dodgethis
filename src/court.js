import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { ARENA, bounds } from './arena.js'
import { PALETTE } from './style.js'

// Re-exported for readability at call sites that only want the dimensions.
export const COURT = ARENA
export const KILL_Y = ARENA.killY

// Builds the floor: a Three mesh + a matching fixed Rapier collider, both sized
// from ARENA so the thing you see and the thing you stand on cannot drift apart.
export function buildCourt(scene, world, RAPIER) {
	const { width, depth, thickness } = ARENA

	const mesh = new THREE.Mesh(
		new THREE.BoxGeometry(width, thickness, depth),
		new THREE.MeshStandardMaterial({ color: PALETTE.court, roughness: 0.8 }),
	)
	mesh.position.y = -thickness / 2
	mesh.receiveShadow = true
	scene.add(mesh)

	// Center line (the "net" line) for orientation.
	const line = new THREE.Mesh(
		new THREE.BoxGeometry(width, 0.02, 0.12),
		new THREE.MeshBasicMaterial({ color: PALETTE.courtLine }),
	)
	line.position.y = 0.011
	scene.add(line)

	// Painted rim warning: where the ground stops being safe. Purely visual —
	// it carries no collider, so walking (or dashing) off the edge still works.
	const rim = new THREE.Group()
	const rimMat = new THREE.MeshBasicMaterial({ color: PALETTE.courtRim })
	const b = bounds(ARENA.inset.rim / 2)
	const band = ARENA.inset.rim
	for (const [w, d, x, z] of [
		[width, band, 0, b.z],
		[width, band, 0, -b.z],
		[band, depth, b.x, 0],
		[band, depth, -b.x, 0],
	]) {
		const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), rimMat)
		strip.position.set(x, 0.008, z)
		rim.add(strip)
	}
	scene.add(rim)

	const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
	world.createCollider(
		RAPIER.ColliderDesc.cuboid(width / 2, thickness / 2, depth / 2).setTranslation(
			0,
			-thickness / 2,
			0,
		),
		body,
	)

	// Peripheral scenery is merged by ink role. The playing surface stays quiet,
	// and nothing outside the painted rim changes the fall/collision rules.
	const batches = new Map()
	function box(role, w, h, d, x, y, z) {
		const geometry = new THREE.BoxGeometry(w, h, d)
		geometry.translate(x, y, z)
		if (!batches.has(role)) batches.set(role, [])
		batches.get(role).push(geometry)
	}
	for (const side of [-1, 1]) {
		for (let row = 0; row < 3; row++) {
			const x = side * (width / 2 + 1.6 + row * 0.65)
			box('scenery', 0.62, 0.22, depth * 0.64, x, row * 0.45 - 0.3, 0)
			for (const z of [-depth * 0.26, depth * 0.26])
				box('ink', 0.12, 0.7 + row * 0.45, 0.12, x, row * 0.225 - 0.65, z)
		}
	}
	// Service lines frame the ends without laying texture under moving ammo.
	for (const z of [-depth * 0.3, depth * 0.3]) {
		box('courtLine', width * 0.8, 0.01, 0.055, 0, 0.018, z)
		box('courtLine', 0.055, 0.01, 0.55, 0, 0.018, z)
	}
	const boardZ = -depth / 2 - 2
	box('ink', 5.8, 1.9, 0.22, 0, 2.1, boardZ)
	box('cream', 5.35, 1.5, 0.08, 0, 2.1, boardZ + 0.15)
	for (const x of [-2.3, 2.3]) box('ink', 0.16, 2.4, 0.16, x, 0.15, boardZ)
	box('teamA', 0.2, 1.1, 0.08, -2.35, 2.1, boardZ + 0.22)
	box('teamB', 0.2, 1.1, 0.08, 2.35, 2.1, boardZ + 0.22)
	for (const [role, geometries] of batches) {
		const decoration = new THREE.Mesh(
			mergeGeometries(geometries),
			new THREE.MeshBasicMaterial({ color: PALETTE[role] }),
		)
		decoration.name = `court-${role}`
		decoration.matrixAutoUpdate = false
		scene.add(decoration)
		for (const geometry of geometries) geometry.dispose()
	}
	const scorePips = []
	for (let team = 0; team < 2; team++) {
		for (let i = 0; i < 2; i++) {
			const pip = new THREE.Mesh(
				new THREE.CircleGeometry(0.22, 12),
				new THREE.MeshBasicMaterial({ color: team ? PALETTE.teamB : PALETTE.teamA }),
			)
			pip.position.set((team ? 1 : -1) * (0.65 + i * 0.75), 2.1, boardZ + 0.22)
			scene.add(pip)
			scorePips.push(pip)
		}
	}
	return {
		floor: mesh,
		updateScore(a, b) {
			for (let i = 0; i < 4; i++) scorePips[i].scale.setScalar(i % 2 < (i < 2 ? a : b) ? 1 : 0.25)
		},
	}
}
