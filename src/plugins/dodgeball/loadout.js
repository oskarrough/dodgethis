import * as THREE from 'three'
import { tune } from './tune.js'
import { makeStyleMaterial } from '../../core/stylepass.js'

// The hand sits ahead of a body along `dir`: held arrows, the aim preview and launches all start here.
export function handPoint(position, dir, out = new THREE.Vector3()) {
	return out.set(position.x + dir.x * 0.6, position.y + 0.6, position.z + dir.z * 0.6)
}

// Dodgeball's loadout on a core body (src/core/body.js): the team badge, bow and hand, the held arrow, weapon and windup,
// hit points, the dash cooldown, and which facts kick which spring. Returns the unit round.js, ai.js and replica.js know.
export function createLoadout(body, { id, participant, hp = 1, replica = false }) {
	const { visual, radius, halfHeight } = body
	const team = participant.team

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
	const hand = new THREE.Mesh(
		new THREE.SphereGeometry(0.14, 8, 6),
		makeStyleMaterial('cream', { flat: true }),
	)
	bow.add(hand)
	hand.position.set(0.28, 0, 0)

	let dashCd = 0 // >0 while dash is on cooldown (counts down from dashCooldown)
	const _hand = new THREE.Vector3()
	const unit = {
		id, // transient presentation/physics identity; use participantId across rounds
		participant,
		participantId: participant.id,
		team,
		isHuman: participant.controller === 'human',
		mesh: body.mesh,
		visual,
		body: body.rigidBody,
		collider: body.collider,
		controller: participant.controller,
		characterController: body.characterController,
		alive: true,
		hp, // hits left before elimination (damage() spends them)
		maxHp: hp,
		heldArrow: null,
		aim: new THREE.Vector3(0, 0, -1), // facing/launch direction (set by actions or AI)
		get colliderHandle() {
			return body.collider ? body.collider.handle : -1
		},
		/** The sim pose. Presentation reads `mesh.position`, which smoothing may place between steps. */
		get position() {
			return body.position
		},
		get yaw() {
			return body.yaw
		},
		/** Velocity (m/s) — useful for tests / leading. */
		get velocity() {
			return body.velocity
		},
		update,
		jump,
		consumeLanding: body.consumeLanding,
		dash,
		sync,
		face: body.face,
		get grounded() {
			return body.grounded
		},
		get dashTime() {
			return body.dashTime
		},
		get dashCooldown() {
			return Math.max(0, dashCd)
		},
		get dashing() {
			return body.dashing
		},
		get dashReady() {
			return dashCd <= 0
		},
		get dashDirection() {
			return body.dashDirection
		},
		react,
		updateVisual,
		handPosition,
		damage,
		eliminate,
		place: body.place,
		applyReplicaState,
		dispose,
	}

	// The muzzle, along aim. `rendered` reads the smoothed root instead of the sim pose.
	function handPosition(rendered = false) {
		return handPoint(rendered ? body.mesh.position : body.position, unit.aim, _hand)
	}

	function update(dir, dt) {
		if (replica || !unit.alive) return
		if (dashCd > 0) dashCd -= dt
		body.update(dir, dt)
	}

	function sync() {
		if (unit.alive) body.sync()
	}

	function jump() {
		return unit.alive && body.jump()
	}

	// Dash in `dir` or, with no steer, along aim; return whether a live, ready unit fired it.
	function dash(dir) {
		if (replica || !unit.alive || dashCd > 0 || body.dashing) return false
		let dx = dir ? dir.x : 0
		let dz = dir ? dir.z : 0
		if (dx === 0 && dz === 0) {
			dx = unit.aim.x
			dz = unit.aim.z
		}
		const p = tune.player
		if (
			!body.dash({ x: dx, z: dz }, { distance: p.speed * p.dashMul * p.dashTime, time: p.dashTime })
		)
			return false
		dashCd = p.dashCooldown
		return true
	}

	// Which facts kick which spring. Feedback never writes the root, body, aim or muzzle.
	function react(event) {
		if (!unit.alive) return
		if (event.type === 'dash') body.lean(event.direction)
		else if (event.type === 'shot') body.kick(event.perfect ? 0.22 : 0.16)
		else if (event.type === 'pickup') body.squash(0.16)
		else if (event.type === 'land') body.squash(Math.min(0.22, 0.05 + event.speed * 0.015))
		else if (event.type === 'impact' && event.outcome === 'hurt') {
			// A survived hit still stings: squash plus a bounded kick along the facing.
			body.squash(0.2)
			body.kick(0.2)
		}
	}

	// The mannequin plus the armed pose; `charge` (0–1) is the windup. Returns true on a footstep.
	function updateVisual(dt, charge = 0) {
		bow.visible = !!unit.heldArrow
		if (!unit.alive) return false // feedback owns the detached corpse
		const stepped = body.animate(dt, charge, unit.aim)
		bow.position.set(
			radius * 0.85,
			halfHeight * 0.15 + charge * 0.2,
			-0.05 + charge * 0.22 - body.recoil,
		)
		bow.rotation.z = Math.PI * 0.45 - charge * 0.3
		hand.position.x = 0.28 - charge * 0.2
		return stepped
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
		body.retire() // this contact step's pose, a neutral visual, no physics
		unit.alive = false
		visual.visible = false
		if (unit.heldArrow) {
			if (!replica) unit.heldArrow.ground()
			unit.heldArrow = null
		} // Replica projectile state comes only from the same authoritative snapshot.
	}

	// Trusted only after replica.js has validated the complete packet. Transforms
	// are interpolated separately; newest gameplay flags never run a guest action.
	function applyReplicaState(state) {
		if (!replica) throw new Error('Cannot apply replica state to a simulated player')
		body.applyReplicaState(state)
		dashCd = state.dashCooldown
		unit.windup = state.windup
		unit.weapon = state.weapon
		if (!state.alive) eliminate()
	}

	// Free the loadout's parts, then the body. The Round calls it on every unit to reset without a reload.
	function dispose() {
		for (const part of [badge, bow, hand]) {
			part.geometry.dispose()
			part.material.dispose()
		}
		body.dispose()
	}

	updateVisual(0)
	return unit
}
