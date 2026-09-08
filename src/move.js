// Quake-inspired horizontal movement, pure functions for unit-testing: ground friction, wishdir accel, soft speed cap, separate air accel.

const EPS = 1e-6

/** Apply Quake-style friction to a horizontal velocity. */
export function applyFriction(vx, vz, friction, stopSpeed, dt) {
	const speed = Math.hypot(vx, vz)
	if (speed < EPS) return { vx: 0, vz: 0 }
	const control = speed < stopSpeed ? stopSpeed : speed
	const drop = control * friction * dt
	const newSpeed = speed - drop
	if (newSpeed <= 0) return { vx: 0, vz: 0 }
	const s = newSpeed / speed
	return { vx: vx * s, vz: vz * s }
}

/** Accelerate velocity toward wishdir * wishSpeed; only the component along wishdir is raised (classic CPM/Q3, strafe-friendly). */
export function accelerate(vx, vz, wishDirX, wishDirZ, wishSpeed, accel, dt) {
	if (wishSpeed <= 0) return { vx, vz }
	const currentSpeed = vx * wishDirX + vz * wishDirZ
	const addSpeed = wishSpeed - currentSpeed
	if (addSpeed <= 0) return { vx, vz }
	let accelSpeed = accel * wishSpeed * dt
	if (accelSpeed > addSpeed) accelSpeed = addSpeed
	return {
		vx: vx + accelSpeed * wishDirX,
		vz: vz + accelSpeed * wishDirZ,
	}
}

/** One tick of horizontal velocity for intent {x,z} (length ≤ 1); `grounded` picks ground vs air accel, `p` is typically tune.player. */
export function stepHorizontalVelocity(vx, vz, wishX, wishZ, grounded, dt, p) {
	const wishLen = Math.hypot(wishX, wishZ)
	let wishDirX = 0
	let wishDirZ = 0
	if (wishLen > EPS) {
		wishDirX = wishX / wishLen
		wishDirZ = wishZ / wishLen
	}
	const wishSpeed = p.speed * (wishLen > 1 ? 1 : wishLen)

	if (grounded) {
		// No wish → slam the brakes; softer friction otherwise lets accel win and settle at max speed.
		const fric = wishLen < 0.01 ? p.stopFriction : p.friction
		;({ vx, vz } = applyFriction(vx, vz, fric, p.stopSpeed, dt))
	}

	const accel = grounded ? p.accel : p.airAccel
	;({ vx, vz } = accelerate(vx, vz, wishDirX, wishDirZ, wishSpeed, accel, dt))

	// Soft cap; air allows a little overshoot so strafing still feels useful.
	const max = grounded ? p.speed * 1.02 : p.speed * p.airSpeedMul
	const speed = Math.hypot(vx, vz)
	if (speed > max) {
		const s = max / speed
		vx *= s
		vz *= s
	}

	return { vx, vz }
}
