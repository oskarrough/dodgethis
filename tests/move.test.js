import { describe, expect, test } from 'bun:test'
import { accelerate, applyFriction, stepHorizontalVelocity } from '../src/move.js'
import { tune } from '../src/tune.js'

const dt = 1 / 60
const p = tune.player

describe('applyFriction', () => {
	test('kills near-zero velocity', () => {
		const out = applyFriction(1e-8, 0, p.friction, p.stopSpeed, dt)
		expect(out.vx).toBe(0)
		expect(out.vz).toBe(0)
	})

	test('stopFriction bleeds speed faster than walk friction', () => {
		const start = { vx: p.speed, vz: 0 }
		const soft = applyFriction(start.vx, start.vz, p.friction, p.stopSpeed, dt)
		const hard = applyFriction(start.vx, start.vz, p.stopFriction, p.stopSpeed, dt)
		expect(Math.hypot(hard.vx, hard.vz)).toBeLessThan(Math.hypot(soft.vx, soft.vz))
	})
})

describe('accelerate', () => {
	test('builds speed along wishdir from rest', () => {
		const out = accelerate(0, 0, 1, 0, p.speed, p.accel, dt)
		expect(out.vx).toBeGreaterThan(0)
		expect(out.vz).toBeCloseTo(0, 9)
		expect(out.vx).toBeLessThanOrEqual(p.speed)
	})

	test('does not add speed when already at wishspeed along wishdir', () => {
		const out = accelerate(p.speed, 0, 1, 0, p.speed, p.accel, dt)
		expect(out.vx).toBeCloseTo(p.speed, 9)
		expect(out.vz).toBeCloseTo(0, 9)
	})

	test('strafe accel adds a perpendicular component (Q3-style)', () => {
		// Moving +X, wishing +Z — classic air/ground strafe contribution.
		const out = accelerate(p.speed, 0, 0, 1, p.speed, p.accel, dt)
		expect(out.vz).toBeGreaterThan(0)
		expect(out.vx).toBeCloseTo(p.speed, 9)
	})
})

describe('stepHorizontalVelocity', () => {
	test('reaches near max ground speed quickly under full wish', () => {
		let vx = 0
		let vz = 0
		for (let i = 0; i < 20; i++) {
			;({ vx, vz } = stepHorizontalVelocity(vx, vz, 0, -1, true, dt, p))
		}
		const speed = Math.hypot(vx, vz)
		expect(speed).toBeGreaterThan(p.speed * 0.95)
		expect(speed).toBeLessThanOrEqual(p.speed * 1.02 + 1e-6)
	})

	test('stops promptly when wish drops to zero', () => {
		let vx = 0
		let vz = -p.speed
		for (let i = 0; i < 18; i++) {
			;({ vx, vz } = stepHorizontalVelocity(vx, vz, 0, 0, true, dt, p))
		}
		expect(Math.hypot(vx, vz)).toBeLessThan(0.05)
	})

	test('analog stick scales wishspeed', () => {
		let half = { vx: 0, vz: 0 }
		let full = { vx: 0, vz: 0 }
		for (let i = 0; i < 30; i++) {
			half = stepHorizontalVelocity(half.vx, half.vz, 0.5, 0, true, dt, p)
			full = stepHorizontalVelocity(full.vx, full.vz, 1, 0, true, dt, p)
		}
		expect(Math.hypot(half.vx, half.vz)).toBeLessThan(Math.hypot(full.vx, full.vz) * 0.7)
		expect(Math.hypot(half.vx, half.vz)).toBeGreaterThan(p.speed * 0.35)
	})

	test('air control still steers without ground friction', () => {
		// Coasting +Z in air, wish +X — should pick up a lateral component.
		let vx = 0
		let vz = p.speed
		;({ vx, vz } = stepHorizontalVelocity(vx, vz, 1, 0, false, dt, p))
		expect(vx).toBeGreaterThan(0)
		// Air soft-cap allows a little overshoot, but not runaway.
		expect(Math.hypot(vx, vz)).toBeLessThanOrEqual(p.speed * p.airSpeedMul + 1e-6)
	})

	test('direction change on ground is committed (velocity carries through turn)', () => {
		let vx = 0
		let vz = 0
		for (let i = 0; i < 20; i++) {
			;({ vx, vz } = stepHorizontalVelocity(vx, vz, 0, -1, true, dt, p))
		}
		// Snap wish to strafe; for a few frames we should still have -Z momentum.
		;({ vx, vz } = stepHorizontalVelocity(vx, vz, 1, 0, true, dt, p))
		expect(vx).toBeGreaterThan(0)
		expect(vz).toBeLessThan(0)
	})
})
