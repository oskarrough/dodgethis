import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { makeStyleMaterial } from '../../core/stylepass.js'

// The feel slice's floor (docs/moba-plan.md, M1): 40 × 40 m, flat, with three round pillars. Static circles are the whole collision layout.
export const FLOOR = { id: 'feel', half: 20, thickness: 1 }
export const PILLARS = Object.freeze([
	{ x: -5, z: -4, r: 1.2 },
	{ x: 4.5, z: -1.5, r: 0.9 },
	{ x: 0, z: -12, r: 1.5 },
])
export const SPAWN = { x: 0, z: 4 }

// Is (x, z) a place a body of `radius` may stand?
export function walkable(x, z, radius, clearance = 0) {
	const edge = FLOOR.half - radius
	if (Math.abs(x) > edge || Math.abs(z) > edge) return false
	return PILLARS.every((p) => Math.hypot(x - p.x, z - p.z) >= p.r + radius + clearance)
}

// The nearest point a body of `radius` may stand on: pushed out of pillars, then clamped to the floor.
export function clampWalkable(point, radius, clearance = 0) {
	const edge = FLOOR.half - radius - clearance
	let x = Math.max(-edge, Math.min(edge, point.x))
	let z = Math.max(-edge, Math.min(edge, point.z))
	for (let pass = 0; pass < 3; pass++) {
		let moved = false
		for (const p of PILLARS) {
			const need = p.r + radius + clearance + 1e-3
			const dx = x - p.x
			const dz = z - p.z
			const d = Math.hypot(dx, dz)
			if (d >= need) continue
			const nx = d > 1e-6 ? dx / d : 0
			const nz = d > 1e-6 ? dz / d : 1
			x = Math.max(-edge, Math.min(edge, p.x + nx * need))
			z = Math.max(-edge, Math.min(edge, p.z + nz * need))
			moved = true
		}
		if (!moved) break
	}
	return { x, z }
}

// Floor and pillars: meshes plus fixed colliders. Returns the teardown.
export function buildMap(scene, world, RAPIER) {
	const group = new THREE.Group()
	group.name = 'moba-map'
	const size = FLOOR.half * 2
	const floor = new THREE.Mesh(
		new THREE.BoxGeometry(size, FLOOR.thickness, size),
		makeStyleMaterial('court'),
	)
	floor.position.y = -FLOOR.thickness / 2
	group.add(floor)
	// A faint grid every 4 m, so speed reads against the floor.
	const lines = []
	for (let i = -FLOOR.half + 4; i < FLOOR.half; i += 4) {
		lines.push(new THREE.BoxGeometry(size, 0.02, 0.05).translate(0, 0.011, i))
		lines.push(new THREE.BoxGeometry(0.05, 0.02, size).translate(i, 0.011, 0))
	}
	const merged = new THREE.Mesh(
		mergeGeometries(lines),
		makeStyleMaterial('courtShade', { flat: true }),
	)
	group.add(merged)
	const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
	const colliders = [
		world.createCollider(
			RAPIER.ColliderDesc.cuboid(FLOOR.half, FLOOR.thickness / 2, FLOOR.half).setTranslation(
				0,
				-FLOOR.thickness / 2,
				0,
			),
			body,
		),
	]
	for (const g of lines) g.dispose()
	const meshes = [floor, merged]
	for (const p of PILLARS) {
		const h = 2.4
		const pillar = new THREE.Mesh(
			new THREE.CylinderGeometry(p.r, p.r, h, 24),
			makeStyleMaterial('scenery'),
		)
		pillar.position.set(p.x, h / 2, p.z)
		const cap = new THREE.Mesh(
			new THREE.CylinderGeometry(p.r * 0.8, p.r * 0.8, 0.04, 24),
			makeStyleMaterial('cream', { flat: true }),
		)
		cap.position.set(p.x, h + 0.02, p.z)
		group.add(pillar, cap)
		meshes.push(pillar, cap)
		colliders.push(
			world.createCollider(
				RAPIER.ColliderDesc.cylinder(h / 2, p.r).setTranslation(p.x, h / 2, p.z),
				body,
			),
		)
	}
	scene.add(group)
	return () => {
		scene.remove(group)
		for (const m of meshes) {
			m.geometry.dispose()
			m.material.dispose()
		}
		world.removeRigidBody(body)
	}
}
