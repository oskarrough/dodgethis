import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { createShadows } from '../src/shadows.js'
import { ARENA } from '../src/arena.js'

const unit = (x, z, alive = true, y = 1) => ({ alive, position: { x, y, z } })
const arrow = (x, z, state = 'flying', y = 3) => ({ state, kind: 'arrow', position: { x, y, z } })
const visible = (scene) => scene.children.filter((c) => c.visible)

test('only live units and airborne ammo cast, and nothing casts over the void', () => {
	const scene = new THREE.Scene()
	const shadows = createShadows(scene)
	shadows.update({
		units: [unit(0, 0), unit(1, 1, false), unit(ARENA.width, 0)],
		arrows: [arrow(2, 2), arrow(3, 3, 'grounded'), arrow(4, 4, 'held')],
	})
	expect(visible(scene)).toHaveLength(2) // one live unit, one flying arrow
	shadows.dispose()
})

test('height shrinks the disc, so a high shot still reads as high', () => {
	const scene = new THREE.Scene()
	const shadows = createShadows(scene)
	shadows.update({ units: [], arrows: [arrow(0, 0, 'flying', 0)] })
	const low = visible(scene)[0].scale.x
	shadows.update({ units: [], arrows: [arrow(0, 0, 'flying', 8)] })
	const high = visible(scene)[0].scale.x
	expect(high).toBeLessThan(low)
	expect(high).toBeGreaterThan(0)
	shadows.dispose()
})

test('the pool is bounded and fully released between rounds', () => {
	const scene = new THREE.Scene()
	const shadows = createShadows(scene)
	const many = Array.from({ length: 200 }, (_, i) => unit((i % 5) - 2, (i % 7) - 3))
	shadows.update({ units: many, arrows: [] })
	const count = scene.children.length
	expect(visible(scene).length).toBeLessThanOrEqual(count)
	expect(count).toBeLessThan(200) // pooled, not one mesh per caster
	shadows.update(null)
	expect(visible(scene)).toHaveLength(0)
	expect(scene.children.length).toBe(count) // nothing allocated or dropped
	shadows.dispose()
	expect(scene.children).toHaveLength(0)
})
