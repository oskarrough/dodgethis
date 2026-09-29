import { expect, test } from 'bun:test'
import { createSnapshotBuffer } from '../src/core/snapshot-buffer.js'

test('samples between the two states around now - delay, clamped, and refuses the past', () => {
	const buffer = createSnapshotBuffer({ delay: 0.1, size: 3 })
	expect(buffer.sample(1)).toBeNull()
	expect(buffer.push(1, 'a')).toBe(true)
	expect(buffer.push(1.2, 'b')).toBe(true)
	const mid = buffer.sample(1.2)
	expect(mid).toMatchObject({ before: 'a', after: 'b', latest: 'b' })
	expect(mid.blend).toBeCloseTo(0.5)
	expect(buffer.sample(0)).toMatchObject({ before: 'a', after: 'a', blend: 1 })
	expect(buffer.sample(9)).toMatchObject({ before: 'b', after: 'b', blend: 1 })
	expect(buffer.accepts(1.1)).toBe(false)
	expect(buffer.push(1.1, 'late')).toBe(false)
	expect(buffer.push(1.2, 'b2')).toBe(true) // the newest time again replaces it
	buffer.push(1.4, 'c')
	buffer.push(1.6, 'd')
	expect(buffer.sample(0).before).toBe('b2') // 'a' fell out of a buffer of three
	buffer.clear()
	expect(buffer.sample(2)).toBeNull()
})
