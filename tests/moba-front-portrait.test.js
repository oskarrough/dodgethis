import { expect, test } from 'bun:test'
import { heroStats, travelAt, numberLines } from '../src/plugins/moba/front/stats.js'
import { tune as kit } from '../src/plugins/moba/tune.js'
import { tune } from '../src/plugins/moba/front/tune.js'

test('Q flight-and-acceleration dodge margin crosses zero from both sides', () => {
	const values = structuredClone(kit)
	const front = structuredClone(tune)
	const s = heroStats(values, front)
	expect(s.q.margin).toBeCloseTo(0.5444444444444444, 10)
	expect(numberLines(s, 8).join(' ')).toContain('Dodge Loose: moving from rest')
	expect(numberLines(s, 8).join(' ')).not.toContain('to spare')
	const threshold = (s.q.sidestep - s.q.warning) * values.loose.speed
	front.preview.distance = threshold - 1e-5
	const short = heroStats(values, front)
	expect(short.q.margin).toBeLessThan(0)
	expect(travelAt(short.q.warning + short.q.flight, values.hero)).toBeLessThan(short.q.clear)
	expect(numberLines(short, front.preview.distance).join(' ')).not.toContain('too late')
	front.preview.distance = threshold + 1e-5
	const long = heroStats(values, front)
	expect(long.q.margin).toBeGreaterThan(0)
	expect(travelAt(long.q.warning + long.q.flight, values.hero)).toBeGreaterThan(long.q.clear)
})
