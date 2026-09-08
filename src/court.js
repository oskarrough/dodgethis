import * as THREE from 'three'
import { ARENA, bounds } from './arena.js'

// Re-exported for readability at call sites that only want the dimensions.
export const COURT = ARENA
export const KILL_Y = ARENA.killY

function cssColor(name, fallback) {
	if (typeof document === 'undefined') return fallback // headless (tests) — no DOM
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

// Builds the floor: a Three mesh + a matching fixed Rapier collider, both sized
// from ARENA so the thing you see and the thing you stand on cannot drift apart.
export function buildCourt(scene, world, RAPIER) {
	const { width, depth, thickness } = ARENA
	const courtColor = cssColor('--court-bg', '#69d66f')
	const lineColor = cssColor('--court-line', '#fff7c7')
	const rimColor = cssColor('--court-rim', '#ffd35d')

	const mesh = new THREE.Mesh(
		new THREE.BoxGeometry(width, thickness, depth),
		new THREE.MeshStandardMaterial({ color: courtColor, roughness: 0.8 }),
	)
	mesh.position.y = -thickness / 2
	mesh.receiveShadow = true
	scene.add(mesh)

	// Center line (the "net" line) for orientation.
	const line = new THREE.Mesh(
		new THREE.BoxGeometry(width, 0.02, 0.12),
		new THREE.MeshBasicMaterial({ color: lineColor }),
	)
	line.position.y = 0.011
	scene.add(line)

	// Painted rim warning: where the ground stops being safe. Purely visual —
	// it carries no collider, so walking (or dashing) off the edge still works.
	const rim = new THREE.Group()
	const rimMat = new THREE.MeshBasicMaterial({ color: rimColor })
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

	return mesh
}
