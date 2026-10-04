import { expect, test } from 'bun:test'
import { STEP } from '../src/core/app.js'
import { tune } from '../src/plugins/moba/tune.js'
import { sliderSections, T } from '../src/plugins/moba/sliders.js'

// Build rule: every slider has a sane range, and no slider value can produce NaN or reverse movement.
test('every moba slider names a live number inside a sane range', () => {
	const at = (v) => (v === T ? STEP : v)
	const names = new Set()
	for (const [name, object, sliders] of sliderSections(tune, { seed: tune.bots.seed })) {
		expect(names.has(name)).toBe(false)
		names.add(name)
		for (const [key, [min, max, step, , target = object]] of Object.entries(sliders)) {
			const where = `${name}.${key}`
			expect([where, typeof target[key]]).toEqual([where, 'number'])
			expect([where, at(min) < at(max), at(step) > 0]).toEqual([where, true, true])
			expect([where, target[key] >= at(min) && target[key] <= at(max)]).toEqual([where, true])
		}
	}
})
