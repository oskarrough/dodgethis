import { describe, expect, test } from 'bun:test'
import { LAYOUTS, blocksSight, pointInside, steerAround, distanceTo } from '../src/obstacles.js'
import { ARENA, spawnPoint } from '../src/arena.js'

const pillar = { kind: 'pillar', x: 0, z: 0, r: 0.5, h: 2.2 }
const lowWall = { kind: 'wall', x: 0, z: 0, w: 2, d: 0.4, h: 0.9 }
const tallWall = { ...lowWall, h: 2 }

describe('geometry', () => {
	test('distance and normal for pillars and walls, inside and out', () => {
		expect(distanceTo(2, 0, pillar).d).toBeCloseTo(1.5)
		expect(distanceTo(2, 0, pillar).nx).toBeCloseTo(1)
		expect(distanceTo(0, 0.2, pillar).d).toBeLessThan(0)
		expect(distanceTo(0, 1.2, lowWall).d).toBeCloseTo(1)
		expect(distanceTo(0, 1.2, lowWall).nz).toBeCloseTo(1)
		expect(distanceTo(1.6, 0.6, lowWall).d).toBeCloseTo(Math.hypot(0.6, 0.4))
		const inside = distanceTo(0.9, 0.05, lowWall)
		expect(inside.d).toBeLessThan(0)
		expect(inside.nx).toBe(1)
	})

	test('pointInside honours padding', () => {
		expect(pointInside(0.8, 0, [pillar])).toBe(false)
		expect(pointInside(0.8, 0, [pillar], 0.5)).toBe(true)
	})

	test('sightlines pass low walls, stop at tall ones and pillars, and miss to the side', () => {
		expect(blocksSight(0, -3, 0, 3, [pillar])).toBe(true)
		expect(blocksSight(1, -3, 1, 3, [pillar])).toBe(false)
		expect(blocksSight(0, -3, 0, 3, [lowWall])).toBe(false)
		expect(blocksSight(0, -3, 0, 3, [tallWall])).toBe(true)
		expect(blocksSight(-3, 0.5, 3, 0.5, [tallWall])).toBe(false)
		expect(blocksSight(-3, -1, 3, 1, [tallWall])).toBe(true)
	})

	test('steering deflects a head-on approach sideways and ignores a clear path', () => {
		const head = steerAround({ x: 0, z: -1 }, 0.01, 1.2, [pillar])
		expect(Math.abs(head.x)).toBeGreaterThan(0.3)
		expect(head.z).toBeLessThan(0) // still making progress
		const clear = steerAround({ x: 0, z: -1 }, 3, 1.2, [pillar])
		expect(clear).toEqual({ x: 0, z: -1 })
		const behind = steerAround({ x: 0, z: -1 }, 0, -0.9, [pillar])
		expect(behind).toEqual({ x: 0, z: -1 })
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
