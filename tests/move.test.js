import { describe, expect, test } from 'bun:test'
import { accelerate, applyFriction, stepHorizontalVelocity } from '../src/move.js'
import { tune } from '../src/tune.js'

const dt = 1 / 60
const p = tune.player

test('friction kills near-zero velocity, and stopFriction bleeds speed faster than walking', () => {
	const dead = applyFriction(1e-8, 0, p.friction, p.stopSpeed, dt)
	expect(dead.vx).toBe(0)
	expect(dead.vz).toBe(0)
	const soft = applyFriction(p.speed, 0, p.friction, p.stopSpeed, dt)
	const hard = applyFriction(p.speed, 0, p.stopFriction, p.stopSpeed, dt)
	expect(Math.hypot(hard.vx, hard.vz)).toBeLessThan(Math.hypot(soft.vx, soft.vz))
})

test('accelerate builds toward wishspeed and adds a perpendicular strafe component (Q3-style)', () => {
	const rest = accelerate(0, 0, 1, 0, p.speed, p.accel, dt)
	expect(rest.vx).toBeGreaterThan(0)
	expect(rest.vz).toBeCloseTo(0, 9)
	expect(rest.vx).toBeLessThanOrEqual(p.speed)
	// Already at wishspeed along wishdir: nothing more to give.
	const capped = accelerate(p.speed, 0, 1, 0, p.speed, p.accel, dt)
	expect(capped.vx).toBeCloseTo(p.speed, 9)
	expect(capped.vz).toBeCloseTo(0, 9)
	// Moving +X, wishing +Z — the classic air/ground strafe contribution.
	const strafe = accelerate(p.speed, 0, 0, 1, p.speed, p.accel, dt)
	expect(strafe.vz).toBeGreaterThan(0)
	expect(strafe.vx).toBeCloseTo(p.speed, 9)
})

describe('stepHorizontalVelocity', () => {
	function run(frames, wx, wz, grounded = true, start = { vx: 0, vz: 0 }) {
		let v = start
		for (let i = 0; i < frames; i++) v = stepHorizontalVelocity(v.vx, v.vz, wx, wz, grounded, dt, p)
		return v
	}

	test('full wish reaches near max ground speed, zero wish stops, analog scales between', () => {
		const full = run(20, 0, -1)
		const speed = Math.hypot(full.vx, full.vz)
		expect(speed).toBeGreaterThan(p.speed * 0.95)
		expect(speed).toBeLessThanOrEqual(p.speed * 1.02 + 1e-6)
		const stopped = run(18, 0, 0, true, { vx: 0, vz: -p.speed })
		expect(Math.hypot(stopped.vx, stopped.vz)).toBeLessThan(0.05)
		const half = run(30, 0.5, 0)
		const whole = run(30, 1, 0)
		expect(Math.hypot(half.vx, half.vz)).toBeLessThan(Math.hypot(whole.vx, whole.vz) * 0.7)
		expect(Math.hypot(half.vx, half.vz)).toBeGreaterThan(p.speed * 0.35)
	})

	test('momentum carries through a turn, and air control steers without ground friction', () => {
		// Coasting +Z in air, wish +X — should pick up a lateral component under a soft cap.
		const air = run(1, 1, 0, false, { vx: 0, vz: p.speed })
		expect(air.vx).toBeGreaterThan(0)
		expect(Math.hypot(air.vx, air.vz)).toBeLessThanOrEqual(p.speed * p.airSpeedMul + 1e-6)
		// On the ground, snapping wish to a strafe keeps the old -Z momentum for a few frames.
		const turned = run(1, 1, 0, true, run(20, 0, -1))
		expect(turned.vx).toBeGreaterThan(0)
		expect(turned.vz).toBeLessThan(0)
	})
})
