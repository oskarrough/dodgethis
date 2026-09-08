import * as THREE from 'three'
import { tune } from './tune.js'
import { bounds as courtBounds } from './arena.js'
import { PALETTE } from './style.js'
import { makeStyleMaterial, styleRoleFromColor } from './stylepass.js'
import { stepHorizontalVelocity } from './move.js'

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

// A unit (the human player or an enemy) is a capsule driven by a Rapier
// KinematicCharacterController. Kinematic = we move it explicitly; it slides
// against colliders but isn't shoved by them. Gravity is applied by hand so it
// hugs the floor. Units belong to a team and can be eliminated by arrow hits.

let _uid = 0

export function createPlayer(
	scene,
	world,
	RAPIER,
	{ position = [0, 0, 0], color = PALETTE.teamA, team = 'A', isHuman = false } = {},
) {
	const id = _uid++
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

	// Facing wedge: a pointed nose reads as a direction from across the court,
	// where a square nub just reads as a bump.
	const nose = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.42, 4), makeStyleMaterial('cream'))
	nose.rotation.set(-Math.PI / 2, 0, Math.PI / 4)
	nose.position.set(0, halfHeight, -radius - 0.08)
	visual.add(nose)

	// Team badge: a shape, not a color, so ally and enemy survive a grayscale
	// capture and the style pass's flattening. Team A wears a ring, team B a bar.
	const badge = new THREE.Mesh(
		team === 'A'
			? new THREE.TorusGeometry(0.17, 0.05, 6, 16)
			: new THREE.BoxGeometry(0.42, 0.09, 0.09),
		makeStyleMaterial('ink'),
	)
	badge.position.set(0, halfHeight + radius * 0.55, 0)
	badge.rotation.x = Math.PI / 2
	visual.add(badge)

	// The bow: a readable armed silhouette. Shown only while this unit actually
	// holds an arrow, so ARMED is legible with the HUD hidden. Decoration only —
	// the capsule collider is unchanged, so it never enlarges the target.
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
	const body = world.createRigidBody(
		RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(px, spawnY, pz),
	)
	const collider = world.createCollider(RAPIER.ColliderDesc.capsule(halfHeight, radius), body)

	const controller = world.createCharacterController(0.01)
	// Solid bleachers aren't auto-stepped. Autostep adds shape casts against
	// crowded capsules and can climb other players, trapping overlapping spawns.
	controller.enableSnapToGround(0.3)
	controller.setApplyImpulsesToDynamicBodies(true)

	let vx = 0
	let vz = 0
	let vy = 0
	let grounded = true // last tick's controller grounded flag (spawn on court)
	let dashT = 0 // >0 while the dash burst is active
	let dashCd = 0 // >0 while dash is on cooldown (counts down from dashCooldown)
	const dashDir = new THREE.Vector3()
	const _hand = new THREE.Vector3()
	const leanX = { value: 0, velocity: 0 }
	const leanZ = { value: 0, velocity: 0 }
	const recoil = { value: 0, velocity: 0 }
	const pickup = { value: 0, velocity: 0 }
	const unit = {
		id,
		team,
		isHuman,
		mesh,
		visual,
		body,
		collider,
		controller,
		alive: true,
		heldArrow: null,
		aim: new THREE.Vector3(0, 0, -1), // facing/launch direction (set by input or AI)
		get colliderHandle() {
			return collider.handle
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
		dash,
		sync,
		face,
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
		eliminate,
		place,
		dispose,
	}

	// The hand (muzzle): ~0.6m in front of and above the center, along the aim.
	// Where held arrows ride and loosed arrows are born; both main (aim preview)
	// and the round (loosing) read it, so the unit owns it.
	function handPosition() {
		const p = mesh.position
		const d = unit.aim
		return _hand.set(p.x + d.x * 0.6, p.y + 0.6, p.z + d.z * 0.6)
	}

	// Point the mesh along a horizontal direction (independent of movement).
	function face(dir) {
		if (dir.x !== 0 || dir.z !== 0) mesh.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI
	}

	// Start a dash burst in `dir` (falls back to current facing if dir is ~zero).
	// No-op if dead or still on cooldown. Returns true if a dash actually fired.
	function dash(dir) {
		if (!unit.alive || dashCd > 0 || dashT > 0) return false
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
		if (!unit.alive || !grounded) return false
		vy = tune.player.jumpSpeed
		grounded = false
		return true
	}

	function update(dir, dt) {
		if (!unit.alive) return
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
			// Q3-style accel/friction (ground vs air). Uses last tick's grounded
			// flag — one-frame lag is fine at 60Hz and keeps spawn grounded=true.
			;({ vx, vz } = stepHorizontalVelocity(vx, vz, dir.x, dir.z, grounded, dt, tune.player))
		}

		const desired = { x: vx * dt, y: 0, z: vz * dt }
		// Keep only normal run speed after the final burst step; otherwise the next
		// un-clamped frame carries dash velocity straight off the court.
		if (dashEnding) {
			vx = dashDir.x * tune.player.speed
			vz = dashDir.z * tune.player.speed
		}

		vy += tune.physics.gravity * dt
		desired.y = vy * dt

		controller.computeColliderMovement(collider, desired)
		const mv = controller.computedMovement()
		const t = body.translation()
		let nx = t.x + mv.x
		let nz = t.z + mv.z
		// A dash commits a big step; clamp it to the court so it can't fling a unit
		// off the rim into the lava (normal walking can still walk off — that's skill).
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
		grounded = vy <= 0 && controller.computedGrounded()
		if (grounded) vy = 0

		// Face the steer/aim direction (not the latched dash dir) so a dash reads as
		// a sidestep, not a spin.
		if (dir.x !== 0 || dir.z !== 0) mesh.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI
	}

	function sync() {
		if (!unit.alive) return
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
			unit.heldArrow.ground()
			unit.heldArrow = null
		} // drop the arrow
		world.removeRigidBody(body) // removes its collider too
	}

	// Teleport a *live* unit (kinematic body + mesh) to a spot, killing velocity.
	// Used by godmode to rescue a player who walked off the edge.
	function place(x, y, z) {
		body.setTranslation({ x, y, z }, true)
		vx = 0
		vz = 0
		vy = 0
		grounded = true
		mesh.position.set(x, y, z)
		visualPosition.copy(mesh.position)
		motion.setScalar(0)
		strideAmount = 0
		stepDistance = 0
	}

	// Free everything this unit put into the world + scene. Like Godot's
	// queue_free(): the Round calls it on every unit to reset without a reload.
	// A live unit still has its body/collider; an eliminated one already shed them.
	function dispose() {
		if (unit.alive) world.removeRigidBody(body)
		world.removeCharacterController(controller)
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
