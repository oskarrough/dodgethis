import * as THREE from 'three'
import { tune } from './tune.js'
import { PALETTE } from './style.js'
import { makeStyleMaterial, styleRoleFromColor } from './stylepass.js'
import { stepHorizontalVelocity } from './move.js'

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const UP = new THREE.Vector3(0, 1, 0)

// A body is the core of anything that walks: the sim pose, a manually moved Rapier kinematic capsule with hand-applied gravity and collider sliding, and the mannequin that renders it.
// `profile` is the movement profile, read live so tuning applies at once.
// `bounds(radius)` returns the { x, z } half-extents a dash may not leave; `smooth` is app.smooth. A replica has no physics: its rendered root is its pose.
export function createBody(
	scene,
	world,
	RAPIER,
	{
		profile,
		position = [0, 0, 0],
		color = PALETTE.teamA,
		bounds = null,
		smooth = null,
		replica = false,
	},
) {
	const { radius, halfHeight } = profile

	// Gameplay reads only the sim pose. The rendered root follows it; squash, lean and recoil live on its child.
	const mesh = new THREE.Group()
	const visual = new THREE.Mesh(
		new THREE.CapsuleGeometry(radius, halfHeight * 2, 8, 16),
		makeStyleMaterial(styleRoleFromColor(color)),
	)
	visual.castShadow = true
	mesh.add(visual)
	scene.add(mesh)
	// Plain vectors, not an Object3D: three draws Math.random for every object's uuid, and unseeded rounds share that stream.
	const pose = replica
		? mesh
		: { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), rotation: { y: 0 } }

	// A pointed nose reads as facing direction from across the court.
	const nose = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.42, 4), makeStyleMaterial('cream'))
	nose.rotation.set(-Math.PI / 2, 0, Math.PI / 4)
	nose.position.set(0, halfHeight, -radius - 0.08)
	visual.add(nose)

	const feet = new THREE.InstancedMesh(
		new THREE.BoxGeometry(radius * 0.85, 0.18, radius * 1.3),
		makeStyleMaterial('ink', { flat: true }),
		2,
	)
	feet.name = 'shoes'
	feet.frustumCulled = false
	feet.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
	visual.add(feet)
	const footPose = new THREE.Object3D()
	let stride = 0
	let stepDistance = 0
	let strideAmount = 0
	const motion = new THREE.Vector3()
	const visualPosition = new THREE.Vector3()

	const [px, py, pz] = position
	const spawnY = py + radius + halfHeight
	pose.position.set(px, spawnY, pz)
	mesh.position.copy(pose.position)
	visualPosition.copy(mesh.position)
	const rigidBody = replica
		? null
		: world.createRigidBody(
				RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(px, spawnY, pz),
			)
	const collider = replica
		? null
		: world.createCollider(RAPIER.ColliderDesc.capsule(halfHeight, radius), rigidBody)

	const controller = replica ? null : world.createCharacterController(0.01)
	// No autostep: it shape-casts against every crowded capsule and can climb other bodies, trapping overlapping spawns.
	controller?.enableSnapToGround(0.3)
	controller?.setApplyImpulsesToDynamicBodies(true)
	const unsmooth = replica ? null : smooth?.(mesh, () => pose)
	let retired = false
	let disposed = false

	let vx = 0
	let vz = 0
	let vy = 0
	let grounded = true // last tick's controller grounded flag (spawns stand)
	let airTime = 0 // seconds since last grounded; jump() forgives short walk-offs
	let jumped = false // a jump was taken since last grounded, so coyote must not grant a second
	let landingSpeed = 0 // downward speed (m/s) of the latest landing, read by consumeLanding()
	let dashT = 0 // >0 while a dash burst is active
	let dashSpeed = 0
	const dashDir = new THREE.Vector3()
	const leanX = { value: 0, velocity: 0 }
	const leanZ = { value: 0, velocity: 0 }
	const recoil = { value: 0, velocity: 0 }
	const squashSpring = { value: 0, velocity: 0 }

	const body = {
		mesh,
		visual,
		rigidBody,
		collider,
		characterController: controller,
		radius,
		halfHeight,
		speedMul: 1, // mounts, slows and levels scale the profile's speed
		get position() {
			return pose.position
		},
		get yaw() {
			return pose.rotation.y
		},
		get velocity() {
			return { x: vx, y: vy, z: vz }
		},
		get grounded() {
			return grounded
		},
		get dashing() {
			return dashT > 0
		},
		get dashTime() {
			return dashT
		},
		get dashDirection() {
			return { x: dashDir.x, y: 0, z: dashDir.z }
		},
		get recoil() {
			return recoil.value
		},
		get retired() {
			return retired
		},
		update,
		// Explicit motion transfer for a body replacement; never starts or redirects a dash.
		setVelocity(velocity) {
			if (!['x', 'y', 'z'].every((axis) => Number.isFinite(velocity[axis])))
				throw new Error('Body velocity must have finite x, y and z')
			vx = velocity.x
			vy = velocity.y
			vz = velocity.z
		},
		jump,
		consumeLanding,
		dash,
		cancelDash() {
			dashT = 0
			vx = 0
			vz = 0
		},
		sync,
		face,
		place,
		lean,
		kick,
		squash,
		animate,
		retire,
		applyReplicaState,
		dispose,
	}

	function face(dir) {
		if (dir.x === 0 && dir.z === 0) return
		const yaw = Math.atan2(dir.x, dir.z) + Math.PI
		if (!replica) {
			pose.rotation.y = yaw
			pose.quaternion.setFromAxisAngle(UP, yaw)
		}
		mesh.rotation.set(0, yaw, 0)
	}

	// Start a committed burst of `distance` metres over `time` seconds; false while one is running.
	function dash(dir, { distance, time }) {
		if (replica || retired || dashT > 0) return false
		const l = Math.hypot(dir.x, dir.z)
		if (l < 1e-4 || !(time > 0)) return false
		dashDir.set(dir.x / l, 0, dir.z / l)
		dashT = time
		dashSpeed = distance / time
		return true
	}

	function jump() {
		if (retired) return false
		const coyote = !jumped && airTime <= profile.coyoteTime
		if (!grounded && !coyote) return false
		vy = profile.jumpSpeed
		grounded = false
		jumped = true
		return true
	}

	// Downward speed (m/s) of the most recent landing since the last call, or 0.
	function consumeLanding() {
		const speed = landingSpeed
		landingSpeed = 0
		return speed
	}

	// `maxSpeed` caps this step's horizontal speed: a mode that plans arrival passes the remaining distance over dt.
	function update(dir, dt, maxSpeed = Infinity) {
		if (replica || retired) return
		const speed = profile.speed * body.speedMul
		const dashing = dashT > 0
		const dashEnding = dashing && dashT <= dt
		if (dashing) {
			// Committed burst: latch velocity on the dash heading (no mid-dash steer).
			dashT = Math.max(0, dashT - dt)
			vx = dashDir.x * dashSpeed
			vz = dashDir.z * dashSpeed
		} else {
			// Q3-style ground/air movement uses the prior grounded flag, preserving grounded spawn state.
			;({ vx, vz } = stepHorizontalVelocity(
				vx,
				vz,
				dir.x,
				dir.z,
				grounded,
				dt,
				profile,
				body.speedMul,
				maxSpeed,
			))
		}

		const desired = { x: vx * dt, y: 0, z: vz * dt }
		// Drop to walking speed after the final burst so the next unclamped step cannot carry it off.
		if (dashEnding) {
			vx = dashDir.x * speed
			vz = dashDir.z * speed
		}

		// Body-only gravity: snappier arcs than projectiles, which keep world gravity.
		vy += tune.physics.gravity * profile.gravityMul * dt
		desired.y = vy * dt

		controller.computeColliderMovement(collider, desired)
		const mv = controller.computedMovement()
		const t = rigidBody.translation()
		let nx = t.x + mv.x
		let nz = t.z + mv.z
		// Clamp dash steps to the bounds while walking can still leave them; never pull an outside body back in.
		const lim = bounds?.(radius)
		if (dashing && lim && Math.abs(t.x) <= lim.x && Math.abs(t.z) <= lim.z) {
			const clampedX = clamp(nx, -lim.x, lim.x)
			const clampedZ = clamp(nz, -lim.z, lim.z)
			if (clampedX !== nx) vx = 0
			if (clampedZ !== nz) vz = 0
			nx = clampedX
			nz = clampedZ
		}
		rigidBody.setNextKinematicTranslation({ x: nx, y: t.y + mv.y, z: nz })
		// A sideways contact with a higher step must not cancel takeoff.
		const wasGrounded = grounded
		grounded = vy <= 0 && controller.computedGrounded()
		if (grounded) {
			if (!wasGrounded) landingSpeed = -vy
			vy = 0
			airTime = 0
			jumped = false
		} else airTime += dt

		// Face the steer, not the latched dash direction, so dashes read as sidesteps.
		face(dir)
	}

	// Read the stepped physics into the sim pose. The rendered root follows directly unless smoothing owns it.
	function sync() {
		if (replica || retired) return
		const t = rigidBody.translation()
		pose.position.set(t.x, t.y, t.z)
		mesh.position.copy(pose.position)
	}

	// Springs: a sideways lean, a recoil kick along the facing, and a squash.
	function lean(direction, amount = 20) {
		leanX.velocity += direction.x * amount
		leanZ.velocity += direction.z * amount
	}
	function kick(amount) {
		recoil.value = amount // bounded, even when kicks overlap
		recoil.velocity = 0
	}
	function squash(amount) {
		squashSpring.value = amount
	}

	// Step the mannequin from the rendered pose. `windup` (0–1) coils the body; `facing` points the recoil (defaults to the nose).
	// Returns true on a footstep.
	function animate(dt, windup = 0, facing = null) {
		dt = Math.max(0, Math.min(dt, 0.1))
		const dx = mesh.position.x - visualPosition.x
		const dz = mesh.position.z - visualPosition.z
		visualPosition.copy(mesh.position)
		const distance = Math.hypot(dx, dz)
		const walking = grounded && dashT <= 0 && distance < 2
		const speed = walking && dt > 0 ? Math.min(distance / dt, profile.speed) : 0
		motion.set(walking && dt > 0 ? dx / dt : 0, 0, walking && dt > 0 ? dz / dt : 0)
		strideAmount += (speed / profile.speed - strideAmount) * (1 - Math.exp(-16 * dt))
		if (walking) stride += (distance * Math.PI) / 0.7
		stepSpring(leanX, clamp(motion.x * 0.055, -0.4, 0.4), dt)
		stepSpring(leanZ, clamp(motion.z * 0.055, -0.4, 0.4), dt)
		stepSpring(recoil, windup * 0.12, dt)
		stepSpring(squashSpring, 0, dt)
		const c = Math.cos(pose.rotation.y)
		const s = Math.sin(pose.rotation.y)
		const kickX = facing ? c * facing.x - s * facing.z : 0
		const kickZ = facing ? s * facing.x + c * facing.z : -1
		visual.position.set(
			-kickX * recoil.value,
			Math.abs(Math.sin(stride)) * 0.045 * strideAmount,
			-kickZ * recoil.value,
		)
		visual.rotation.set(
			(s * leanX.value + c * leanZ.value) * 0.35,
			-windup * 0.13,
			-(c * leanX.value - s * leanZ.value) * 0.35,
		)
		visual.scale.set(1 + squashSpring.value, 1 - squashSpring.value * 0.5, 1 + squashSpring.value)
		for (let i = 0; i < 2; i++) {
			const step = Math.sin(stride + i * Math.PI) * strideAmount
			footPose.position.set(
				(i ? 1 : -1) * radius * 0.62,
				-radius - halfHeight + 0.09 + Math.max(0, step) * 0.15,
				-0.07 + step * 0.18,
			)
			footPose.rotation.x = step * 0.18
			footPose.updateMatrix()
			feet.setMatrixAt(i, footPose.matrix)
		}
		feet.instanceMatrix.needsUpdate = true
		if (walking && speed > 0.5) stepDistance += distance
		else stepDistance = 0
		if (stepDistance >= 0.95) {
			stepDistance %= 0.95
			return true
		}
		return false
	}

	// Teleport while clearing velocity.
	function place(x, y, z) {
		rigidBody?.setTranslation({ x, y, z }, true)
		vx = 0
		vz = 0
		vy = 0
		grounded = true
		airTime = 0
		jumped = false
		pose.position.set(x, y, z)
		mesh.position.set(x, y, z)
		visualPosition.copy(mesh.position)
		motion.setScalar(0)
		strideAmount = 0
		stepDistance = 0
		smooth?.snap(mesh)
	}

	// Leave the simulation: settle on this step's pose, drop the physics, and hand a neutral visual to whatever animates the exit.
	function retire() {
		if (retired) return
		sync()
		retired = true
		visual.position.set(0, 0, 0)
		visual.rotation.set(0, 0, 0)
		visual.scale.setScalar(1)
		if (rigidBody) world.removeRigidBody(rigidBody) // removes its collider too
		smooth?.snap(mesh)
	}

	// Motion state from an authoritative snapshot, already validated by the caller.
	function applyReplicaState(state) {
		if (!replica) throw new Error('Cannot apply replica state to a simulated body')
		vx = state.velocity.x
		vy = state.velocity.y
		vz = state.velocity.z
		grounded = state.grounded
		dashT = state.dashTime
		dashDir.copy(state.dashDirection)
	}

	function dispose() {
		if (disposed) return
		disposed = true
		unsmooth?.()
		if (!retired && rigidBody) world.removeRigidBody(rigidBody)
		if (controller) world.removeCharacterController(controller)
		scene.remove(mesh)
		visual.removeFromParent() // exit presentation may have reparented it
		for (const part of [visual, nose, feet]) {
			part.geometry.dispose()
			part.material.dispose()
		}
		feet.dispose()
	}

	return body
}

// Exact critically damped spring step; clamping also bounds recovery after a stall.
function stepSpring(spring, target, dt) {
	dt = Math.max(0, Math.min(dt, 0.1))
	const offset = spring.value - target
	const speed = spring.velocity + 18 * offset
	const decay = Math.exp(-18 * dt)
	spring.value = target + (offset + speed * dt) * decay
	spring.velocity = (spring.velocity - 18 * speed * dt) * decay
}
