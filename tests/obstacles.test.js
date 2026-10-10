import { describe, expect, test } from 'bun:test'
import { LAYOUTS, blocksSight, pointInside } from '../src/plugins/dodgeball/obstacles.js'
import { ARENA, spawnPoint } from '../src/plugins/dodgeball/arena.js'

const pillar = { kind: 'pillar', x: 0, z: 0, r: 0.5, h: 2.2 }
const lowWall = { kind: 'wall', x: 0, z: 0, w: 2, d: 0.4, h: 0.9 }
const tallWall = { ...lowWall, h: 2 }

describe('geometry', () => {
	test('sightlines pass low walls, stop at tall ones and pillars, and miss to the side', () => {
		expect(blocksSight(0, -3, 0, 3, [pillar])).toBe(true)
		expect(blocksSight(1, -3, 1, 3, [pillar])).toBe(false)
		expect(blocksSight(0, -3, 0, 3, [lowWall])).toBe(false)
		expect(blocksSight(0, -3, 0, 3, [tallWall])).toBe(true)
		expect(blocksSight(-3, 0.5, 3, 0.5, [tallWall])).toBe(false)
		expect(blocksSight(-3, -1, 3, 1, [tallWall])).toBe(true)
	})
})

describe('layouts', () => {
	const r = 0.4
	for (const [name, shapes] of Object.entries(LAYOUTS)) {
		test(`${name} keeps spawn rows clear and leaves a straight lane`, () => {
			for (const team of ['A', 'B'])
				for (let i = 0; i < 20; i++) {
					const [x, , z] = spawnPoint(team, i, 20)
					expect(pointInside(x, z, shapes, r + 0.2)).toBe(false)
				}
			// Some x lane walks the whole court without touching a shape, with a player's radius to spare.
			let lane = false
			for (let x = -ARENA.width / 2 + 1; x <= ARENA.width / 2 - 1; x += 0.1) {
				let free = true
				for (let z = -ARENA.depth / 2; z <= ARENA.depth / 2 && free; z += 0.1)
					if (pointInside(x, z, shapes, r + 0.15)) free = false
				if (free) lane = true
			}
			expect(lane).toBe(true)
			for (const o of shapes) {
				const reach = o.kind === 'pillar' ? o.r : Math.max(o.w, o.d) / 2
				expect(Math.abs(o.x) + reach).toBeLessThan(ARENA.width / 2 - 1)
				expect(Math.abs(o.z) + reach).toBeLessThan(5)
			}
		})
	}
})
