import { describe, expect, test } from 'bun:test'
import { createRegistry, labelOf } from '../src/core/registry.js'

describe('tune registry', () => {
	test('every number, switch, colour and array number in a section is a value', () => {
		const registry = createRegistry()
		const ball = { speed: 14, live: true, tint: '#ff8800', name: 'ball', view: { depth: [1, 2] } }
		registry.add('lane/ball', ball)
		const paths = registry.entries().map((e) => e.path)
		expect(paths).toEqual([
			'lane/ball/speed',
			'lane/ball/live',
			'lane/ball/tint',
			'lane/ball/view/depth/0',
			'lane/ball/view/depth/1',
		])
		const labels = registry.entries().map((e) => e.label)
		expect(labels).toEqual(['speed', 'live', 'tint', 'depth 1', 'depth 2'])
	})

	test('notes label, range and hide values; units and onChange come from the section', () => {
		const registry = createRegistry()
		const changed = []
		const ball = { carrySpeed: 0.85, still: 0.15, first: 60 }
		registry.add('lane/ball', ball, {
			notes: { carrySpeed: { label: 'carrier speed', range: [0, 1] }, still: { hidden: true } },
			units: (object, key) => (key === 'first' ? 's' : undefined),
			onChange: (dotted, value) => changed.push([dotted, value]),
		})
		const [carry, first] = registry.entries()
		expect(registry.entries()).toHaveLength(2)
		expect([carry.label, carry.min, carry.max]).toEqual(['carrier speed', 0, 1])
		expect(first.unit).toBe('s')
		first.setValue(30)
		first.setValue(30)
		expect(ball.first).toBe(30)
		first.reset()
		expect(ball.first).toBe(60)
		expect(changed).toEqual([
			['first', 30],
			['first', 60],
		])
	})

	test('a value nested in two sections shows once, under the one holding it most directly', () => {
		const registry = createRegistry()
		const terrain = { margin: 1, haze: { near: 4 } }
		registry.add('lane/terrain', terrain)
		const remove = registry.add('style/terrain/haze', terrain.haze)
		expect(registry.entries().map((e) => e.path)).toEqual([
			'lane/terrain/margin',
			'style/terrain/haze/near',
		])
		remove()
		expect(registry.entries().map((e) => e.path)).toContain('lane/terrain/haze/near')
	})

	test('colliding short labels keep their parent', () => {
		const registry = createRegistry()
		registry.add('front', { splash: { lift: 1 }, lobby: { lift: 2 }, zoom: 1 })
		expect(registry.entries().map((e) => e.label)).toEqual(['splash lift', 'lobby lift', 'zoom'])
		expect(labelOf('dodgeReaction')).toBe('dodge reaction')
	})
})
