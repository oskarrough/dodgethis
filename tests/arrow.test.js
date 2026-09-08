import { expect, test } from 'bun:test'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { createArrow } from '../src/arrow.js'
import { buildCourt } from '../src/court.js'
import { tune } from '../src/tune.js'

await RAPIER.init({})

const aim = new THREE.Vector3(0, 0, -1)
const hand = new THREE.Vector3(2, 1.6, 3)

test.each(['arrow', 'bowl'])(
	'%s ammo cycles grounded/held/flying without leaking colliders',
	(kind) => {
		const scene = new THREE.Scene()
		const world = new RAPIER.World({ x: 0, y: tune.physics.gravity, z: 0 })
		buildCourt(scene, world, RAPIER)
		const courtColliders = world.colliders.len()
		const arrow = createArrow(scene, world, RAPIER, { position: [1, 0, 2] })
		// Ammo at rest is grabbable and owns no collider; only a flying shot does.
		function expectGrounded() {
			expect(arrow.state).toBe('grounded')
			expect(world.colliders.len()).toBe(courtColliders)
			expect(Math.abs(arrow.position.x)).toBeLessThanOrEqual(5)
			expect(Math.abs(arrow.position.z)).toBeLessThanOrEqual(11.5)
		}
		try {
			expectGrounded()
			arrow.hold()
			arrow.setHeldPose(hand, aim)
			expect(arrow.state).toBe('held')
			expect(world.colliders.len()).toBe(courtColliders)
			arrow.ground() // eliminated holder drops ammo at the hand
			expectGrounded()

			arrow.loose(hand, aim, 'A', 15, { kind })
			expect(arrow.state).toBe('flying')
			expect(world.colliders.len()).toBe(courtColliders + 1)
			for (let i = 0; i < 10; i++) world.step()
			arrow.ground() // hit drops from the body, including the bowl's hidden arrow mesh
			expectGrounded()

			arrow.hold()
			arrow.loose(hand, aim, 'A', 30, { kind })
			for (let i = 0; i < 600 && arrow.state === 'flying'; i++) {
				world.step()
				arrow.update()
			}
			expectGrounded() // natural touchdown / bowl settlement, including the rim clamp
		} finally {
			arrow.dispose()
			world.free()
		}
	},
)

test.each(['grounded', 'held', 'flying'])(
	'disposing %s ammo frees its own meshes and leaves shared shaders alone',
	(state) => {
		const scene = new THREE.Scene()
		const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
		const arrow = createArrow(scene, world, RAPIER)
		const other = createArrow(scene, world, RAPIER)
		const shared = arrow.mesh.children[0].material
		expect(other.mesh.children[0].material).toBe(shared)
		let sharedDisposed = false
		const onDispose = () => (sharedDisposed = true)
		shared.addEventListener('dispose', onDispose)
		let geometriesDisposed = 0
		let materialsDisposed = 0
		scene.getObjectByName('pickup-marker').traverse((mesh) => {
			mesh.geometry.addEventListener('dispose', () => geometriesDisposed++)
			mesh.material.addEventListener('dispose', () => materialsDisposed++)
		})
		if (state === 'held') arrow.hold()
		if (state === 'flying') arrow.loose(hand, aim)
		arrow.dispose()
		try {
			expect(geometriesDisposed).toBe(2)
			expect(materialsDisposed).toBe(0) // palette materials belong to all arrows
			expect(sharedDisposed).toBe(false)
			other.loose(hand, aim)
			expect(other.mesh.children[0].material).toBe(shared)
			other.dispose()
			expect(scene.children).toHaveLength(0)
			expect(world.colliders.len()).toBe(0)
		} finally {
			shared.removeEventListener('dispose', onDispose)
			world.free()
		}
	},
)
