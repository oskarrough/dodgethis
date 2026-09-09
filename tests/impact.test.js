import { expect, test } from 'bun:test'
import { createImpactBeat } from '../src/impact.js'

test('only local eliminations slow time, and volleys cannot extend the beat', () => {
	const beat = createImpactBeat()
	const hit = { type: 'impact', outcome: 'eliminated', source: { isHuman: true } }
	expect(beat.trigger({ ...hit, source: { isHuman: false } })).toBe(false)
	expect(beat.trigger({ ...hit, outcome: 'landed' })).toBe(false)
	expect(beat.trigger(hit)).toBe(true)
	expect(beat.step(0.05)).toBeCloseTo(0.15)
	expect(beat.trigger(hit)).toBe(false)
	expect(beat.step(0.03)).toBeCloseTo(0.575)
	expect(beat.step(0.01)).toBe(1)
	beat.reset()
	expect(beat.step(0.05)).toBe(1)
	expect(beat.trigger(hit)).toBe(true)
})

test('remote human eliminations do not trigger the local impact beat', () => {
	const beat = createImpactBeat()
	const hit = {
		type: 'impact',
		outcome: 'eliminated',
		source: { isHuman: true, isLocal: false },
		target: { isHuman: true, isLocal: false },
	}
	expect(beat.trigger(hit)).toBe(false)
	expect(beat.trigger({ ...hit, target: { isHuman: true, isLocal: true } })).toBe(true)
})
