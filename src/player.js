import * as THREE from 'three'
import { tune } from './tune.js'
import { startDeath } from './death.js'

// A unit (the human player or an enemy) is a capsule driven by a Rapier
// KinematicCharacterController. Kinematic = we move it explicitly; it slides
// against colliders but isn't shoved by them. Gravity is applied by hand so it
// hugs the floor. Units belong to a team and can be eliminated by arrow hits.

let _uid = 0

export function createPlayer(
	scene,
	world,
	RAPIER,
	{ position = [0, 0, 0], color = 0x5db4ff, team = 'A', isHuman = false } = {},
) {
	const id = _uid++
	const { radius, halfHeight } = tune.player

	const mesh = new THREE.Mesh(
		new THREE.CapsuleGeometry(radius, halfHeight * 2, 8, 16),
		new THREE.MeshStandardMaterial({ color, roughness: 0.6 }),
	)
	mesh.castShadow = true
	scene.add(mesh)

	// Little facing nub so you can read orientation (aim direction).
	const nose = new THREE.Mesh(
		new THREE.BoxGeometry(0.18, 0.18, 0.4),
		new THREE.MeshStandardMaterial({ color: 0xffffff }),
	)
	nose.position.set(0, halfHeight, -radius)
	mesh.add(nose)

	const [px, py, pz] = position
	const spawnY = py + radius + halfHeight
	const body = world.createRigidBody(
		RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(px, spawnY, pz),
	)
	const collider = world.createCollider(RAPIER.ColliderDesc.capsule(halfHeight, radius), body)

	const controller = world.createCharacterController(0.01)
	controller.enableAutostep(0.3, 0.2, true)
	controller.enableSnapToGround(0.3)
	controller.setApplyImpulsesToDynamicBodies(true)

	let vy = 0
	let death = null // active death animation (death.js), or null while alive
	const _hand = new THREE.Vector3()
	const unit = {
		id,
		team,
		isHuman,
		mesh,
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
		update,
		sync,
		face,
		handPosition,
		eliminate,
		updateDeath,
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

	function update(dir, dt) {
		if (!unit.alive) return
		const speed = tune.player.speed
		const desired = { x: dir.x * speed * dt, y: 0, z: dir.z * speed * dt }

		vy += tune.physics.gravity * dt
		desired.y = vy * dt

		controller.computeColliderMovement(collider, desired)
		const mv = controller.computedMovement()
		const t = body.translation()
		body.setNextKinematicTranslation({ x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z })
		if (controller.computedGrounded()) vy = 0

		if (dir.x !== 0 || dir.z !== 0) mesh.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI
	}

	function sync() {
		if (!unit.alive) return
		const t = body.translation()
		mesh.position.set(t.x, t.y, t.z)
	}

	// Out! Pull the unit from the physics world (so arrows fly through the corpse)
	// and hand the mesh to a death animation — a random melt/crumble/implode/etc.
	// that plays out over a couple seconds via updateDeath. A `fell` death uses the
	// plunge-into-the-void style. The animation owns the mesh from here on.
	function eliminate({ fell = false } = {}) {
		if (!unit.alive) return
		unit.alive = false
		if (unit.heldArrow) {
			unit.heldArrow.ground()
			unit.heldArrow = null
		} // drop the arrow
		world.removeRigidBody(body) // removes its collider too
		death = startDeath(scene, mesh, { fell, radius })
	}

	// Advance the death animation (no-op while alive). The round ticks this each
	// frame for every unit; sync() has already bailed for dead units, so the
	// animation has sole control of the mesh transform.
	function updateDeath(dt) {
		if (death) death.update(dt)
	}

	// Teleport a *live* unit (kinematic body + mesh) to a spot, killing vertical
	// velocity. Used by godmode to rescue a player who walked off the edge.
	function place(x, y, z) {
		body.setTranslation({ x, y, z }, true)
		vy = 0
		mesh.position.set(x, y, z)
	}

	// Free everything this unit put into the world + scene. Like Godot's
	// queue_free(): the Round calls it on every unit to reset without a reload.
	// A live unit still has its body/collider; an eliminated one already shed them.
	function dispose() {
		if (unit.alive) world.removeRigidBody(body)
		if (death) death.dispose()
		world.removeCharacterController(controller)
		scene.remove(mesh)
		mesh.geometry.dispose()
		mesh.material.dispose()
		nose.geometry.dispose()
		nose.material.dispose()
	}

	return unit
}
