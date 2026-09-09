import * as THREE from 'three'
import { tune } from './tune.js'
import { bounds as courtBounds } from './arena.js'
import { PALETTE } from './style.js'
import { makeStyleMaterial, styleRoleFromColor } from './stylepass.js'
import { stepHorizontalVelocity } from './move.js'
import { validateRoster } from './roster.js'

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

// A unit is a team-owned, manually moved Rapier kinematic capsule with hand-applied gravity, collider sliding, and arrow elimination.

let _uid = 0

export function createPlayer(
	scene,
	world,
	RAPIER,
	{
		position = [0, 0, 0],
		color = PALETTE.teamA,
		team = 'A',
		isHuman = false,
		hp = 1,
		participant,
		replica = false,
	} = {},
) {
	// Validate before allocating meshes, bodies or character controllers.
	participant = validateRoster([
		participant ?? {
			id: `unit-${_uid}`,
			team,
			controller: isHuman ? 'human' : 'bot',
			peerId: isHuman ? 'local' : null,
		},
	])[0]
	team = participant.team
	isHuman = participant.controller === 'human'
	const id = replica ? null : _uid++
	const { radius, halfHeight } = tune.player

	// Gameplay only reads this root. All squash, lean and recoil live on its child.
	const mesh = new THREE.Group()
	const visual = new THREE.Mesh(
		new THREE.CapsuleGeometry(radius, halfHeight * 2, 8, 16),
		makeStyleMaterial(styleRoleFromColor(color)),
	)
	visual.castShadow = true
	mesh.add(visual)
	scene.add(mesh)

	// A pointed nose reads as facing direction from across the court.
	const nose = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.42, 4), makeStyleMaterial('cream'))
	nose.rotation.set(-Math.PI / 2, 0, Math.PI / 4)
	nose.position.set(0, halfHeight, -radius - 0.08)
	visual.add(nose)

	// Shape-coded badges survive grayscale and style flattening: Team A wears a ring, Team B a bar.
	const badge = new THREE.Mesh(
		team === 'A'
			? new THREE.TorusGeometry(0.17, 0.05, 6, 16)
			: new THREE.BoxGeometry(0.42, 0.09, 0.09),
		makeStyleMaterial('ink'),
	)
	badge.position.set(0, halfHeight + radius * 0.55, 0)
	badge.rotation.x = Math.PI / 2
	visual.add(badge)

	// The decorative bow exposes armed state without changing the capsule target.
	const bow = new THREE.Mesh(
		new THREE.TorusGeometry(0.34, 0.045, 6, 16, Math.PI * 1.1),
		makeStyleMaterial('ammoShaft'),
	)
	bow.position.set(radius * 0.85, halfHeight * 0.15, -0.05)
	bow.rotation.set(0, Math.PI / 2, Math.PI * 0.45)
	bow.visible = false
	visual.add(bow)

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
	const hand = new THREE.Mesh(
		new THREE.SphereGeometry(0.14, 8, 6),
		makeStyleMaterial('cream', { flat: true }),
	)
	bow.add(hand)
	hand.position.set(0.28, 0, 0)
	let stride = 0
	let stepDistance = 0
	let strideAmount = 0
	const motion = new THREE.Vector3()
	const visualPosition = new THREE.Vector3()

	const [px, py, pz] = position
	const spawnY = py + radius + halfHeight
	mesh.position.set(px, spawnY, pz)
	visualPosition.copy(mesh.position)
	const body = replica
		? null
		: world.createRigidBody(
				RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(px, spawnY, pz),
			)
	const collider = replica
		? null
		: world.createCollider(RAPIER.ColliderDesc.capsule(halfHeight, radius), body)

	const controller = replica ? null : world.createCharacterController(0.01)
	// The court has no stairs. Autostep performs extra shape casts against every
	// crowded capsule and can climb other players, trapping overlapping spawns.
	controller?.enableSnapToGround(0.3)
	controller?.setApplyImpulsesToDynamicBodies(true)
	let disposed = false

	let vx = 0
	let vz = 0
	let vy = 0
	let grounded = true // last tick's controller grounded flag (spawn on court)
	let airTime = 0 // seconds since last grounded; jump() forgives short walk-offs
	let jumped = false // a jump was taken since last grounded, so coyote must not grant a second
	let landingSpeed = 0 // downward speed (m/s) of the latest landing, read by consumeLanding()
	let dashT = 0 // >0 while the dash burst is active
	let dashCd = 0 // >0 while dash is on cooldown (counts down from dashCooldown)
	const dashDir = new THREE.Vector3()
	const _hand = new THREE.Vector3()
	const leanX = { value: 0, velocity: 0 }
	const leanZ = { value: 0, velocity: 0 }
	const recoil = { value: 0, velocity: 0 }
	const pickup = { value: 0, velocity: 0 }
	const unit = {
		id, // transient presentation/physics identity; use participantId across rounds
		participant,
		participantId: participant.id,
		peerId: participant.peerId,
		team,
		isHuman,
		mesh,
		visual,
		body,
		collider,
		controller: participant.controller,
		characterController: controller,
		alive: true,
		hp, // hits left before elimination (damage() spends them)
		maxHp: hp,
		heldArrow: null,
		aim: new THREE.Vector3(0, 0, -1), // facing/launch direction (set by input or AI)
		get colliderHandle() {
			return collider ? collider.handle : -1
		},
		get position() {
			return mesh.position
		},
		/** Horizontal velocity (m/s) — useful for tests / leading. */
		get velocity() {
			return { x: vx, y: vy, z: vz }
		},
		update,
		jump,
		consumeLanding,
		dash,
		sync,
		face,
		get grounded() {
			return grounded
		},
		get dashTime() {
			return dashT
		},
		get dashCooldown() {
			return Math.max(0, dashCd)
		},
		get dashing() {
			return dashT > 0
		},
		get dashReady() {
			return dashCd <= 0
		},
		get dashDirection() {
			return { x: dashDir.x, y: 0, z: dashDir.z }
		},
		react,
		updateVisual,
		handPosition,
		damage,
		eliminate,
		place,
		applyReplicaState,
		dispose,
	}

	// The unit-owned muzzle sits along aim for held arrows, previews, and launches.
	function handPosition() {
		const p = mesh.position
		const d = unit.aim
		return _hand.set(p.x + d.x * 0.6, p.y + 0.6, p.z + d.z * 0.6)
	}

	// Point the mesh along a horizontal direction (independent of movement).
	function face(dir) {
		if (dir.x !== 0 || dir.z !== 0) mesh.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI
	}

	// Start a dash in `dir` or current facing; return whether a live, ready unit fired it.
	function dash(dir) {
		if (replica || !unit.alive || dashCd > 0 || dashT > 0) return false
		let dx = dir ? dir.x : 0
		let dz = dir ? dir.z : 0
		if (dx === 0 && dz === 0) {
			dx = unit.aim.x
			dz = unit.aim.z // no steer input → scoot where you're facing
		}
		const l = Math.hypot(dx, dz)
		if (l < 1e-4) return false
		dashDir.set(dx / l, 0, dz / l)
		dashT = tune.player.dashTime
		dashCd = tune.player.dashCooldown
		return true
	}

	function jump() {
		if (!unit.alive) return false
		const coyote = !jumped && airTime <= tune.player.coyoteTime
		if (!grounded && !coyote) return false
		vy = tune.player.jumpSpeed
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

	function update(dir, dt) {
		if (replica || !unit.alive) return
		if (dashCd > 0) dashCd -= dt

		const dashing = dashT > 0
		const dashEnding = dashing && dashT <= dt
		if (dashing) {
			// Committed burst: latch velocity on the dash heading (no mid-dash steer).
			dashT = Math.max(0, dashT - dt)
			const burst = tune.player.speed * tune.player.dashMul
			vx = dashDir.x * burst
			vz = dashDir.z * burst
		} else {
			// Q3-style ground/air movement uses the prior grounded flag, preserving grounded spawn state.
			;({ vx, vz } = stepHorizontalVelocity(vx, vz, dir.x, dir.z, grounded, dt, tune.player))
		}

		const desired = { x: vx * dt, y: 0, z: vz * dt }
		// Reduce velocity after the final burst so the next unclamped frame cannot carry it off-court.
		if (dashEnding) {
			vx = dashDir.x * tune.player.speed
			vz = dashDir.z * tune.player.speed
		}

		// Player-only gravity: snappier arcs than the arrows, which keep world gravity.
		vy += tune.physics.gravity * tune.player.gravityMul * dt
		desired.y = vy * dt

		controller.computeColliderMovement(collider, desired)
		const mv = controller.computedMovement()
		const t = body.translation()
		let nx = t.x + mv.x
		let nz = t.z + mv.z
		// Clamp committed dash steps to the court while normal walking can still leave the rim.
		const lim = courtBounds(radius)
		// Don't teleport a bleacher/airborne player back inside the court.
		if (dashing && Math.abs(t.x) <= lim.x && Math.abs(t.z) <= lim.z) {
			const clampedX = clamp(nx, -lim.x, lim.x)
			const clampedZ = clamp(nz, -lim.z, lim.z)
			if (clampedX !== nx) vx = 0
			if (clampedZ !== nz) vz = 0
			nx = clampedX
			nz = clampedZ
		}
		body.setNextKinematicTranslation({ x: nx, y: t.y + mv.y, z: nz })
		// A sideways contact with a higher bleacher must not cancel takeoff.
		const wasGrounded = grounded
		grounded = vy <= 0 && controller.computedGrounded()
		if (grounded) {
			if (!wasGrounded) landingSpeed = -vy
			vy = 0
			airTime = 0
			jumped = false
		} else airTime += dt

		// Face steer or aim rather than latched dash direction so dashes read as sidesteps.
		if (dir.x !== 0 || dir.z !== 0) mesh.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI
	}

	function sync() {
		if (replica || !unit.alive) return
		const t = body.translation()
		mesh.position.set(t.x, t.y, t.z)
	}

	// Semantic action feedback never writes the root, body, aim or muzzle.
	function react(event) {
		if (!unit.alive) return
		if (event.type === 'dash') {
			leanX.velocity += event.direction.x * 20
			leanZ.velocity += event.direction.z * 20
		} else if (event.type === 'shot') {
			recoil.value = event.perfect ? 0.22 : 0.16 // a bounded kick, even when shots overlap
			recoil.velocity = 0
		} else if (event.type === 'pickup') pickup.value = 0.16
		else if (event.type === 'land') pickup.value = Math.min(0.22, 0.05 + event.speed * 0.015)
		else if (event.type === 'impact' && event.outcome === 'hurt') {
			// A survived hit still stings: squash plus a bounded kick along the facing.
			pickup.value = 0.2
			recoil.value = 0.2
			recoil.velocity = 0
		}
	}

	function updateVisual(dt, charge = 0) {
		bow.visible = !!unit.heldArrow
		if (!unit.alive) return // feedback owns the detached corpse
		dt = Math.max(0, Math.min(dt, 0.1))
		const dx = mesh.position.x - visualPosition.x
		const dz = mesh.position.z - visualPosition.z
		visualPosition.copy(mesh.position)
		const distance = Math.hypot(dx, dz)
		const walking = grounded && !unit.dashing && distance < 2
		const speed = walking && dt > 0 ? Math.min(distance / dt, tune.player.speed) : 0
		motion.set(walking && dt > 0 ? dx / dt : 0, 0, walking && dt > 0 ? dz / dt : 0)
		strideAmount += (speed / tune.player.speed - strideAmount) * (1 - Math.exp(-16 * dt))
		if (walking) stride += (distance * Math.PI) / 0.7
		stepSpring(leanX, clamp(motion.x * 0.055, -0.4, 0.4), dt)
		stepSpring(leanZ, clamp(motion.z * 0.055, -0.4, 0.4), dt)
		stepSpring(recoil, charge * 0.12, dt)
		stepSpring(pickup, 0, dt)
		const c = Math.cos(mesh.rotation.y)
		const s = Math.sin(mesh.rotation.y)
		const aimX = c * unit.aim.x - s * unit.aim.z
		const aimZ = s * unit.aim.x + c * unit.aim.z
		visual.position.set(
			-aimX * recoil.value,
			Math.abs(Math.sin(stride)) * 0.045 * strideAmount,
			-aimZ * recoil.value,
		)
		visual.rotation.set(
			(s * leanX.value + c * leanZ.value) * 0.35,
			-charge * 0.13,
			-(c * leanX.value - s * leanZ.value) * 0.35,
		)
		visual.scale.set(1 + pickup.value, 1 - pickup.value * 0.5, 1 + pickup.value)
		bow.position.set(
			radius * 0.85,
			halfHeight * 0.15 + charge * 0.2,
			-0.05 + charge * 0.22 - recoil.value,
		)
		bow.rotation.z = Math.PI * 0.45 - charge * 0.3
		hand.position.x = 0.28 - charge * 0.2
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

	// Spend hit points from a live unit; true means the pool hit zero and the caller must eliminate().
	function damage(amount = 1) {
		if (!unit.alive) return false
		unit.hp = Math.max(0, unit.hp - amount)
		return unit.hp === 0
	}

	// Resolve the out immediately; presentation may reveal and animate the corpse.
	function eliminate() {
		if (!unit.alive) return
		sync() // use this contact step's body pose, not last frame's mesh
		// Detach a neutral pose, not a half-finished recoil.
		visual.position.set(0, 0, 0)
		visual.rotation.set(0, 0, 0)
		visual.scale.setScalar(1)
		unit.alive = false
		visual.visible = false
		if (unit.heldArrow) {
			if (!replica) unit.heldArrow.ground()
			unit.heldArrow = null
		} // Replica projectile state comes only from the same authoritative snapshot.
		if (body) world.removeRigidBody(body) // removes its collider too
	}

	// Teleport a live body and mesh while clearing velocity, used for godmode rescues.
	function place(x, y, z) {
		body?.setTranslation({ x, y, z }, true)
		vx = 0
		vz = 0
		vy = 0
		grounded = true
		airTime = 0
		jumped = false
		mesh.position.set(x, y, z)
		visualPosition.copy(mesh.position)
		motion.setScalar(0)
		strideAmount = 0
		stepDistance = 0
	}

	// Trusted only after replica.js has validated the complete packet. Transforms
	// are interpolated separately; newest gameplay flags never run a guest action.
	function applyReplicaState(state) {
		if (!replica) throw new Error('Cannot apply replica state to a simulated player')
		vx = state.velocity.x
		vy = state.velocity.y
		vz = state.velocity.z
		grounded = state.grounded
		dashT = state.dashTime
		dashCd = state.dashCooldown
		dashDir.copy(state.dashDirection)
		unit.windup = state.windup
		unit.weapon = state.weapon
		if (!state.alive) eliminate()
	}

	// Free everything this unit put into the world + scene. Like Godot's
	// queue_free(): the Round calls it on every unit to reset without a reload.
	// A live unit still has its body/collider; an eliminated one already shed them.
	function dispose() {
		if (disposed) return
		disposed = true
		if (unit.alive && body) world.removeRigidBody(body)
		if (controller) world.removeCharacterController(controller)
		scene.remove(mesh)
		visual.removeFromParent() // death presentation may have attached it to the scene
		visual.geometry.dispose()
		visual.material.dispose()
		feet.dispose()
		for (const part of [nose, badge, bow, feet, hand]) {
			part.geometry.dispose()
			part.material.dispose()
		}
	}

	updateVisual(0)
	return unit
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
