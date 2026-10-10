import { expect, test } from 'bun:test'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { createArrow } from '../src/plugins/dodgeball/arrow.js'
import { buildCourt } from '../src/plugins/dodgeball/court.js'
import { tune } from '../src/core/tune.js'

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
