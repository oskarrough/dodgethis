import { expect, test } from 'bun:test'
import { aimArrowSpeed, projectArrowFlight } from '../src/arrow.js'
import { createChargeMeter } from '../src/weapons.js'
import { tune } from '../src/tune.js'

function range(speed, height = 1.6) {
	return projectArrowFlight(speed, height, new Float32Array(2), new Float32Array(2))
}

test('the solver lands on the cursor across the court, and clamps to available charge', () => {
	for (const distance of [0, 0.2, 1, 3, 6, 10]) {
		const speed = aimArrowSpeed(distance, 1.6, 35)
		expect(speed).toBeLessThanOrEqual(35)
		expect(Math.abs(range(speed) - distance)).toBeLessThan(0.12)
	}
	// Out of reach: spend what the charge allows, never unlimited power.
	expect(aimArrowSpeed(100, 1.6, 10)).toBe(10)
	expect(range(aimArrowSpeed(100, 1.6, 25))).toBeGreaterThan(range(10))
	// Launch height and drag are read live, not baked in at import.
	const original = tune.arrow.linearDamping
	try {
		tune.arrow.linearDamping = 0.8
		for (const height of [0.7, 1.6, 3])
			expect(Math.abs(range(aimArrowSpeed(5, height, 35), height) - 5)).toBeLessThan(0.12)
	} finally {
		tune.arrow.linearDamping = original
	}
})

test('charging longer does not overshoot a nearby target; release agrees with preview', () => {
	const charge = createChargeMeter()
	charge.press()
	charge.update(tune.weapons.chargeTime * 0.5)
	const before = aimArrowSpeed(2, 1.6, charge.previewSpeed())
	charge.update(tune.weapons.chargeTime * 0.5)
	expect(charge.perfect).toBe(true)
	const preview = aimArrowSpeed(2, 1.6, charge.previewSpeed())
	const shot = charge.release()
	expect(shot.perfect).toBe(true)
	expect(aimArrowSpeed(2, 1.6, shot.speed)).toBe(preview)
	expect(Math.abs(range(before) - range(preview))).toBeLessThan(0.12)
})
