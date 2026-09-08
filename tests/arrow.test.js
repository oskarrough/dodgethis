import { expect, test } from 'bun:test'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { clampArrowLanding, createArrow } from '../src/arrow.js'
import { buildCourt } from '../src/court.js'
import { tune } from '../src/tune.js'

await RAPIER.init({})

const aim = new THREE.Vector3(0, 0, -1)
const hand = new THREE.Vector3(2, 1.6, 3)

test.each(['arrow', 'bowl'])('%s pickup marker follows the ammo lifecycle', (kind) => {
	const scene = new THREE.Scene()
	const world = new RAPIER.World({ x: 0, y: tune.physics.gravity, z: 0 })
	buildCourt(scene, world, RAPIER)
	const courtColliders = world.colliders.len()
	const arrow = createArrow(scene, world, RAPIER, { position: [1, 0, 2] })
	const marker = scene.getObjectByName('pickup-marker')
	function expectGroundedMarker() {
		expect(arrow.state).toBe('grounded')
		expect(marker.visible).toBe(true)
		expect(marker.position.x).toBe(arrow.position.x)
		expect(marker.position.z).toBe(arrow.position.z)
		expect(marker.position.y).toBeGreaterThan(0.021) // clear the center stripe
		expect(marker.position.y).toBeLessThan(arrow.position.y)
		expect(world.colliders.len()).toBe(courtColliders)
	}
	try {
		expectGroundedMarker()
		const rotation = marker.quaternion.clone()
		arrow.hold()
		arrow.setHeldPose(hand, aim)
		expect(marker.visible).toBe(false)
		arrow.ground() // eliminated holder drops ammo at the hand
		expectGroundedMarker()
		expect(marker.position.x).toBe(hand.x)
		expect(marker.quaternion.equals(rotation)).toBe(true)

		arrow.loose(hand, aim, 'A', 15, { kind })
		expect(marker.visible).toBe(false)
		expect(world.colliders.len()).toBe(courtColliders + 1)
		for (let i = 0; i < 10; i++) world.step()
		const impact = clampArrowLanding(arrow.position.x, arrow.position.z)
		arrow.ground() // hit drops from the body, including the bowl's hidden arrow mesh
		expectGroundedMarker()
		expect(marker.position.x).toBeCloseTo(impact.x, 5)
		expect(marker.position.z).toBeCloseTo(impact.z, 5)

		arrow.hold()
		arrow.loose(hand, aim, 'A', 30, { kind })
		expect(marker.visible).toBe(false)
		for (let i = 0; i < 600 && arrow.state === 'flying'; i++) {
			world.step()
			arrow.update()
		}
		expectGroundedMarker() // natural touchdown / bowl settlement, including rim clamp
		expect(marker.quaternion.equals(rotation)).toBe(true)
	} finally {
		arrow.dispose()
		world.free()
	}
})

test.each(['grounded', 'held', 'flying'])('disposing %s ammo frees its marker', (state) => {
	const scene = new THREE.Scene()
	const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
	const arrow = createArrow(scene, world, RAPIER)
	const marker = scene.getObjectByName('pickup-marker')
	let geometriesDisposed = 0
	let materialsDisposed = 0
	marker.traverse((mesh) => {
		mesh.geometry.addEventListener('dispose', () => geometriesDisposed++)
		mesh.material.addEventListener('dispose', () => materialsDisposed++)
	})
	if (state === 'held') arrow.hold()
	if (state === 'flying') arrow.loose(hand, aim)
	arrow.dispose()
	try {
		expect(scene.children).toHaveLength(0)
		expect(world.colliders.len()).toBe(0)
		expect(geometriesDisposed).toBe(2)
		expect(materialsDisposed).toBe(0) // palette materials belong to all arrows
	} finally {
		world.free()
	}
})

test("new ammo has owned render routing and disposal preserves another arrow's shared shaders", () => {
	const scene = new THREE.Scene()
	const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
	const first = createArrow(scene, world, RAPIER)
	const second = createArrow(scene, world, RAPIER)
	const shared = first.mesh.children[0].material
	let disposed = false
	const onDispose = () => {
		disposed = true
	}
	shared.addEventListener('dispose', onDispose)
	try {
		expect(second.mesh.children[0].material).toBe(shared)
		scene.traverse((object) => {
			if (object.isMesh) {
				expect(object.material.isShaderMaterial).toBe(true)
				expect(object.layers.mask).toBe(1)
			}
			if (object.isLine) expect(object.layers.mask).toBe(2)
		})
		first.dispose()
		expect(disposed).toBe(false)
		second.loose(hand, aim)
		expect(second.mesh.children[0].material).toBe(shared)
	} finally {
		shared.removeEventListener('dispose', onDispose)
		second.dispose()
		world.free()
	}
})
