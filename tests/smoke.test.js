import { describe, expect, test } from 'bun:test'
import { clampArrowLanding, launchVelocity, projectArrowFlight, solveLaunch } from '../src/arrow.js'
import { createChargeMeter } from '../src/weapons.js'
import { nearest } from '../src/spatial.js'
import { tune } from '../src/tune.js'

// The ballistic solve is the contract behind the reticle: an arrow loosed at solveLaunch(dist)'s speed must (drag aside) land `dist` meters out. Verify against the closed-form flight time at the fixed launch angle.
describe('solveLaunch', () => {
	test('lands on the reticle across the court and clamps at the extremes', () => {
		const H = 1.6
		const g = -tune.physics.gravity
		for (const dist of [8, 10, 12, 14, 16]) {
			const v = solveLaunch(dist, H)
			expect(v).toBeGreaterThan(8)
			expect(v).toBeLessThan(tune.arrow.maxSpeed)
			const { vx, vy } = launchVelocity(v)
			const tFlight = (vy + Math.sqrt(vy * vy + 2 * g * H)) / g
			expect(vx * tFlight).toBeCloseTo(dist, 5)
		}
		expect(solveLaunch(0.5)).toBeGreaterThanOrEqual(8)
		expect(solveLaunch(500)).toBeLessThanOrEqual(tune.arrow.maxSpeed)
		const { vx, vy } = launchVelocity(20)
		expect(Math.hypot(vx, vy)).toBeCloseTo(20, 9)
		expect((Math.atan2(vy, vx) * 180) / Math.PI).toBeCloseTo(tune.arrow.launchAngle, 9)
	})

	test('flight preview reaches a clamped landing and handles zero gravity', () => {
		const distances = new Float32Array(32)
		const heights = new Float32Array(32)
		const distance = projectArrowFlight(30, 1.6, distances, heights)
		expect(distance).toBeGreaterThan(0)
		expect(distances.at(-1)).toBeCloseTo(distance, 4)
		expect(heights.at(-1)).toBeLessThan(0.07)
		expect(clampArrowLanding(100, -100)).toEqual({ x: 5, z: -11.5 })

		const gravity = tune.physics.gravity
		tune.physics.gravity = 0
		try {
			expect(projectArrowFlight(30, 1.6, distances, heights)).toBeNull()
		} finally {
			tune.physics.gravity = gravity
		}
	})
})

test('the charge meter winds up, peaks perfect, unwinds past the band, and cancels', () => {
	const w = tune.weapons
	const m = createChargeMeter()
	expect(m.release()).toBeNull() // not charging yet
	m.press()
	m.update(w.chargeTime / 2)
	expect(m.value).toBeCloseTo(0.5, 6)
	expect(m.previewSpeed()).toBeCloseTo(w.chargeMin + (w.chargeMax - w.chargeMin) * 0.5, 6)
	m.update(w.chargeTime / 2) // at the peak
	expect(m.value).toBeCloseTo(1, 6)
	expect(m.perfect).toBe(true)
	expect(m.previewSpeed()).toBeCloseTo(w.chargeMax * w.perfectMult, 6)
	const shot = m.release()
	expect(shot.perfect).toBe(true)
	expect(shot.speed).toBeCloseTo(w.chargeMax * w.perfectMult, 6)
	expect(m.charging).toBe(false)
	// Holding on past the peak unwinds back down, out of the perfect band.
	const held = createChargeMeter()
	held.press()
	held.update(w.chargeTime * 1.5)
	expect(held.value).toBeCloseTo(0.5, 6)
	expect(held.perfect).toBe(false)
	held.cancel()
	expect(held.release()).toBeNull()
	expect(held.value).toBe(0)
})

test('nearest finds the closest passing item with its squared distance', () => {
	const items = [
		{ position: { x: 0, z: 0 }, tag: 'origin' },
		{ position: { x: 3, z: 4 }, tag: 'fiveAway' },
		{ position: { x: 1, z: 0 }, tag: 'close' },
	]
	const { item, d2 } = nearest(items, 0.4, 0, () => true)
	expect(item.tag).toBe('origin')
	expect(d2).toBeCloseTo(0.16, 9)
	expect(nearest(items, 0, 0, (it) => it.tag !== 'origin').item.tag).toBe('close')
	const none = nearest(items, 0, 0, () => false)
	expect(none.item).toBeNull()
	expect(none.d2).toBe(Infinity)
})
