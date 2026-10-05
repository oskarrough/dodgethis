import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { createBody } from '../src/core/body.js'
import { dressHero } from '../src/plugins/moba/hero-view.js'
import { HEROES } from '../src/plugins/moba/heroes.js'
import { tune } from '../src/plugins/moba/tune.js'
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
