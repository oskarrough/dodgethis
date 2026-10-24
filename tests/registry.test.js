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

describe('hand-made controls', () => {
	test('a builder labels, ranges and hooks values, and wins over the walk', () => {
		const registry = createRegistry()
		const changed = []
		const look = { tint: 0xff8800, hero: 'mitts', gain: 0.5, depth: 2, sub: { lift: 1 } }
		registry.add('front', look, {}, (f, o) => {
			f.add(o, 'gain', 0, 1, 0.01)
				.name('volume')
				.onChange((v) => changed.push(v))
			f.add(o, 'hero', { Mitts: 'mitts', Hook: 'hook' }).name('hero')
			f.addColor(o, 'tint')
			f.addFolder('sub').add(o.sub, 'lift', 0, 4, 1)
			f.add({ go: () => changed.push('ran') }, 'go').name('go')
		})
		const byPath = Object.fromEntries(registry.entries().map((e) => [e.path, e]))
		expect(Object.keys(byPath)).toEqual([
			'front/gain',
			'front/hero',
			'front/tint',
			'front/go',
			'front/sub/lift',
			'front/depth',
		])
		const gain = byPath['front/gain']
		expect([gain.label, gain.min, gain.max, gain.step]).toEqual(['volume', 0, 1, 0.01])
		gain.setValue(0.25)
		expect(look.gain).toBe(0.25)
		expect(byPath['front/hero'].choices).toEqual([
			['Mitts', 'mitts'],
			['Hook', 'hook'],
		])
		const tint = byPath['front/tint']
		expect(tint.format.toHexString(tint.getValue())).toBe('#ff8800')
		tint.setValue(tint.format.fromHexString('#0000ff'))
		expect(look.tint).toBe(0xff)
		byPath['front/go'].run()
		expect(changed).toEqual([0.25, 'ran'])
	})
})
