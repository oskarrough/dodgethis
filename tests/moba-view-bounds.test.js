import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { createFollow } from '../src/plugins/moba/follow.js'
import { createBody } from '../src/core/body.js'
import { dressHero } from '../src/plugins/moba/hero-view.js'
import { HEROES } from '../src/plugins/moba/heroes.js'
import { tune } from '../src/plugins/moba/tune.js'
import { FLOOR } from '../src/plugins/moba/obstacles.js'

function assertCorners(frame, aspect, fov = frame.fov, shake = 0) {
	const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 200)
	camera.position.set(frame.eye.x + shake, frame.eye.y + shake, frame.eye.z + shake)
	camera.lookAt(frame.target.x, 0, frame.target.z)
	camera.updateMatrixWorld(true)
	const ray = new THREE.Raycaster(),
		floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
	for (const x of [-1, 1])
		for (const y of [-1, 1]) {
			ray.setFromCamera(new THREE.Vector2(x, y), camera)
			const hit = ray.ray.intersectPlane(floor, new THREE.Vector3())
			expect(hit).not.toBeNull()
			expect(Math.abs(hit.x)).toBeLessThanOrEqual(FLOOR.halfX + 1e-6)
			expect(Math.abs(hit.z)).toBeLessThanOrEqual(FLOOR.halfZ + 1e-6)
		}
}
for (const aspect of [390 / 844, 1440 / 900, 2560 / 1080])
	test(`all camera corners stay on-map through pan reversals and kicks at aspect ${aspect}`, () => {
		const follow = createFollow()
		for (const x of [-100, 100])
			for (const z of [-100, 100]) {
				follow.focus({ x, z })
				const frame = follow.frame(0.1, { x, z }, null, { aspect })
				assertCorners(frame, aspect)
				for (const shake of [-0.35, 0.35]) assertCorners(frame, aspect, frame.fov, shake)
				follow.reserveKick(8)
				const kicked = follow.frame(0.1, { x, z }, null, { aspect, cameraFov: frame.fov })
				assertCorners(kicked, aspect, kicked.fov + 8)
				for (const pan of [
					{ x: -1, z: -1 },
					{ x: 1, z: 1 },
				])
					assertCorners(follow.frame(10, { x, z }, null, { aspect, pan }), aspect)
			}
	})

test('live wide-angle and high camera tunes shrink the view instead of reversing or exposing sky', () => {
	for (const height of [1, 20, 50])
		for (const back of [0, 12.5, 80]) {
			const follow = createFollow({ ...tune.follow, height, back, fov: 90 })
			assertCorners(follow.frame(0, { x: -48, z: 12 }, null, { aspect: 2560 / 1080 }), 2560 / 1080)
		}
})

test('every body bottom sits on its inked disc; quiver fins tilt back and Skip is wider than the collision disc', () => {
	const scene = new THREE.Scene()
	for (const id of Object.keys(HEROES)) {
		const body = createBody(scene, null, null, { profile: tune.hero, replica: true })
		const undress = dressHero(body, id)
		body.visual.geometry.computeBoundingBox()
		expect(body.visual.geometry.boundingBox.min.y + body.mesh.position.y).toBeCloseTo(
			tune.silhouettes.discY,
			6,
		)
		if (id === 'fletcher') {
			const arrows = body.visual.children.filter((p) => p.type === 'Group')
			expect(arrows).toHaveLength(3)
			for (const arrow of arrows) {
				expect(arrow.rotation.x).toBe(tune.silhouettes.arrowTilt)
				expect(arrow.children.filter((p) => p.geometry.type === 'PlaneGeometry')).toHaveLength(2)
			}
		}
		if (id === 'skip')
			expect(body.visual.geometry.parameters.width).toBeGreaterThan(body.radius * 2)
		undress()
		body.dispose()
	}
})
