import { describe, expect, test } from 'bun:test'
import {
	clampArrowLanding,
	launchVelocity,
	projectArrowFlight,
	solveLaunch,
} from '../src/plugins/dodgeball/arrow.js'
import { tune } from '../src/plugins/dodgeball/tune.js'
import { tune as coreTune } from '../src/core/tune.js'

// The ballistic solve is the contract behind the reticle: an arrow loosed at solveLaunch(dist)'s speed must (drag aside) land `dist` meters out. Verify against the closed-form flight time at the fixed launch angle.
describe('solveLaunch', () => {
	test('lands on the reticle across the court and clamps at the extremes', () => {
		const H = 1.6
		const g = -coreTune.physics.gravity
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

		const gravity = coreTune.physics.gravity
		coreTune.physics.gravity = 0
		try {
			expect(projectArrowFlight(30, 1.6, distances, heights)).toBeNull()
		} finally {
			coreTune.physics.gravity = gravity
		}
	})
})
