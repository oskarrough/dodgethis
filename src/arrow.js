import * as THREE from 'three'
import { tune } from './tune.js'
import { TRAIL } from './weapons.js'
import { ARENA, clamp as clampToCourt, onCourt } from './arena.js'
import { PALETTE } from './style.js'
import { makeStyleMaterial, FORWARD_LAYER } from './stylepass.js'

// Held → flying → grounded → held (plan.md): only flying arrows own bodies; held arrows ride hands, grounded arrows are pickup markers.

const FORWARD = new THREE.Vector3(0, 0, 1)
const GROUND_Y = 0.045
export function clampArrowLanding(x, z) {
	return clampToCourt(x, z, ARENA.inset.landing)
}

// Sample real-flight gravity/damping/ground threshold into muzzle distances and world heights; return landing distance or null if unreachable.
export function projectArrowFlight(speed, startHeight, distances, heights, dt = 1 / 60) {
	const launch = launchVelocity(speed)
	const damping = 1 / (1 + tune.arrow.linearDamping * dt)
	const maxSteps = 600
	let distance = 0
	let y = startHeight
	let horizontalSpeed = launch.vx
	let verticalSpeed = launch.vy
	let impactStep = 0

	for (let step = 1; step <= maxSteps; step++) {
		verticalSpeed += tune.physics.gravity * dt
		horizontalSpeed *= damping
		verticalSpeed *= damping
		distance += horizontalSpeed * dt
		y += verticalSpeed * dt
		if (y <= GROUND_Y + 0.02 && verticalSpeed <= 0.5) {
			impactStep = step
			break
		}
	}
	if (!impactStep || !Number.isFinite(distance)) return null

	distances[0] = 0
	heights[0] = startHeight
	distance = 0
	y = startHeight
	horizontalSpeed = launch.vx
	verticalSpeed = launch.vy
	let sample = 1
	for (let step = 1; step <= impactStep; step++) {
		verticalSpeed += tune.physics.gravity * dt
		horizontalSpeed *= damping
		verticalSpeed *= damping
		distance += horizontalSpeed * dt
		y += verticalSpeed * dt
		while (
			sample < distances.length &&
			step >= Math.round((sample * impactStep) / (distances.length - 1))
		) {
			distances[sample] = distance
			heights[sample] = Math.max(y, GROUND_Y)
			sample++
		}
	}
	return distance
}

// Invert damped preview flight, not ideal AI ballistics; charge caps speed so close targets aren't overshot.
const solveDistances = new Float32Array(2)
const solveHeights = new Float32Array(2)
export function aimArrowSpeed(distance, height, availableSpeed) {
	const range = projectArrowFlight(availableSpeed, height, solveDistances, solveHeights)
	if (range === null || distance >= range) return availableSpeed
	let low = 0
	let high = availableSpeed
	for (let i = 0; i < 18; i++) {
		const mid = (low + high) / 2
		const landing = projectArrowFlight(mid, height, solveDistances, solveHeights)
		if (landing === null || landing > Math.max(0, distance)) high = mid
		else low = mid
	}
	return (low + high) / 2
}

let _id = 0

// Shared for the application lifetime; arrow disposal owns only its geometry.
const shaftMat = makeStyleMaterial('ammoShaft')
const tipMat = makeStyleMaterial('ammoTip')
const fletchMat = makeStyleMaterial('ammoFletch')
const pickupInkMat = makeStyleMaterial('ink', { flat: true })
const pickupCreamMat = makeStyleMaterial('cream', { flat: true })
const bowlMat = makeStyleMaterial('bowl')

function buildMesh() {
	// Built pointing along local +Z, ~0.9m long.
	const g = new THREE.Group()
	const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.8, 6), shaftMat)
	shaft.rotation.x = Math.PI / 2
	const tip = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.18, 8), tipMat)
	tip.rotation.x = Math.PI / 2
	tip.position.z = 0.49
	const fletch = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.01, 0.16), fletchMat)
	fletch.position.z = -0.36
	for (const m of [shaft, tip, fletch]) m.castShadow = true
	g.add(shaft, tip, fletch)
	return g
}

const TRAIL_N = 20 // points in an arrow's fading trail

export function createArrow(
	scene,
	world,
	RAPIER,
	{ position = [0, GROUND_Y, 0], replica = false, id: replicaId } = {},
) {
	const id = replica ? replicaId : _id++
	let disposed = false
	let replicaInitialized = false
	const mesh = buildMesh()
	scene.add(mesh)

	// A ground-only ammo diamond, separate so arrow heading and held pose cannot rotate it.
	const pickup = new THREE.Mesh(new THREE.CircleGeometry(0.5, 4), pickupInkMat)
	pickup.name = 'pickup-marker'
	pickup.rotation.x = -Math.PI / 2
	const pickupFill = new THREE.Mesh(new THREE.CircleGeometry(0.42, 4), pickupCreamMat)
	pickupFill.position.z = 0.001
	pickup.add(pickupFill)
	scene.add(pickup)

	// A flying bowl shows this ball instead of the arrow mesh.
	const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), bowlMat)
	ball.castShadow = true
	ball.visible = false
	scene.add(ball)

	// A short polyline that follows a flying arrow (newest point at index 0).
	const trailPos = new Float32Array(TRAIL_N * 3)
	const trailGeom = new THREE.BufferGeometry()
	trailGeom.setAttribute('position', new THREE.BufferAttribute(trailPos, 3))
	const trail = new THREE.Line(
		trailGeom,
		new THREE.LineBasicMaterial({ color: PALETTE.ammo, transparent: true, opacity: 0.55 }),
	)
	trail.layers.set(FORWARD_LAYER)
	trail.frustumCulled = false
	trail.visible = false
	scene.add(trail)

	function resetTrail(x, y, z) {
		for (let i = 0; i < TRAIL_N; i++) {
			trailPos[i * 3] = x
			trailPos[i * 3 + 1] = y
			trailPos[i * 3 + 2] = z
		}
		trailGeom.attributes.position.needsUpdate = true
		trail.visible = tune.fx.trails
	}

	function pushTrail(x, y, z) {
		for (let i = TRAIL_N - 1; i > 0; i--) {
			trailPos[i * 3] = trailPos[(i - 1) * 3]
			trailPos[i * 3 + 1] = trailPos[(i - 1) * 3 + 1]
			trailPos[i * 3 + 2] = trailPos[(i - 1) * 3 + 2]
		}
		trailPos[0] = x
		trailPos[1] = y
		trailPos[2] = z
		trailGeom.attributes.position.needsUpdate = true
		trail.visible = tune.fx.trails
	}

	let state = 'grounded'
	let body = null
	let collider = null
	let ownerTeam = null
	let kind = 'arrow' // 'arrow' | 'bowl' — how the in-flight body behaves
	let perfect = false // was this loosed on a perfect charge release?
	let source = null
	const launchDirection = new THREE.Vector3()
	const _lv = new THREE.Vector3() // last known velocity (for AI threat detection)

	function placeGrounded(x, z, heading = 0) {
		state = 'grounded'
		kind = 'arrow'
		ball.visible = false
		mesh.visible = true
		mesh.rotation.set(0, heading, 0)
		mesh.position.set(x, GROUND_Y, z)
		pickup.position.set(x, 0.025, z) // above the center stripe, below the arrow
		pickup.visible = true
	}
	placeGrounded(position[0], position[2], Math.random() * Math.PI)

	function destroyBody() {
		if (body) {
			world.removeRigidBody(body)
			body = null
			collider = null
		}
	}

	// Picked up: arrow leaves the world, becomes the holder's nocked arrow.
	function hold() {
		if (replica) return
		destroyBody()
		pickup.visible = false
		trail.visible = false
		ball.visible = false
		mesh.visible = true
		state = 'held'
	}

	// While held, main drives the pose each frame (position at hand, point at aim).
	function setHeldPose(pos, dir) {
		mesh.position.copy(pos)
		mesh.quaternion.setFromUnitVectors(FORWARD, dir)
	}

	// Launch from the hand at `speed` m/s (reticle-solved or tunable default); opts selects arrow/bowl and a perfect-release trail.
	function loose(fromPos, dir, team = null, speed = tune.arrow.impulse, opts = {}) {
		if (replica) return
		state = 'flying'
		pickup.visible = false
		ownerTeam = team
		kind = opts.kind === 'bowl' ? 'bowl' : 'arrow'
		perfect = !!opts.perfect
		source = { id: opts.sourceId ?? null, team, isHuman: !!opts.sourceIsHuman }
		if (kind === 'bowl') {
			looseBowl(fromPos, dir, speed)
			launchDirection.copy(body.linvel())
			return
		}

		mesh.visible = true
		ball.visible = false
		trail.material.color.set(perfect ? TRAIL.perfect : TRAIL.arrow)
		resetTrail(fromPos.x, fromPos.y, fromPos.z)
		body = world.createRigidBody(
			RAPIER.RigidBodyDesc.dynamic()
				.setTranslation(fromPos.x, fromPos.y, fromPos.z)
				.setLinearDamping(tune.arrow.linearDamping)
				.setCcdEnabled(true),
		)
		// Point-mass ball physics, mesh-only heading; collision events report arrow-vs-unit contacts.
		collider = world.createCollider(
			RAPIER.ColliderDesc.ball(0.06)
				.setDensity(2)
				.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
			body,
		)

		const a = (tune.arrow.launchAngle * Math.PI) / 180
		const horiz = Math.cos(a) * speed
		const vy = Math.sin(a) * speed
		body.setLinvel({ x: dir.x * horiz, y: vy, z: dir.z * horiz }, true)
		launchDirection.copy(body.linvel())
	}

	// Bowl rolls from ground level below the hand: slower, wider hits, then a pickup arrow when momentum dies (update).
	function looseBowl(fromPos, dir, speed) {
		const r = tune.weapons.bowlRadius
		mesh.visible = false
		ball.visible = true
		ball.scale.setScalar(r)
		ball.position.set(fromPos.x, r, fromPos.z)
		trail.material.color.set(TRAIL.bowl)
		resetTrail(fromPos.x, r, fromPos.z)
		body = world.createRigidBody(
			RAPIER.RigidBodyDesc.dynamic()
				.setTranslation(fromPos.x, r, fromPos.z)
				.setLinearDamping(tune.arrow.linearDamping)
				.setCcdEnabled(true),
		)
		collider = world.createCollider(
			RAPIER.ColliderDesc.ball(r)
				.setDensity(tune.weapons.bowlDensity)
				.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
			body,
		)
		body.setLinvel({ x: dir.x * speed, y: 0, z: dir.z * speed }, true)
		// Spin it about the axis perpendicular to travel so it visibly rolls.
		body.setAngvel({ x: (dir.z * speed) / r, y: 0, z: (-dir.x * speed) / r }, true)
	}

	// Clamp void landings to the rim: a small visual snap prevents unreachable ammo, AI suicides and an empty-pool soft-lock.
	function land(x, z, heading) {
		const landing = clampArrowLanding(x, z)
		x = landing.x
		z = landing.z
		destroyBody()
		_lv.set(0, 0, 0)
		trail.visible = false
		placeGrounded(x, z, heading)
	}

	// Only natural settlement reports a miss. Forced hit/holder drops use ground().
	function settle(x, z, heading) {
		const event = snapshotImpact()
		const landedOnCourt = onCourt(x, z)
		event.outcome = landedOnCourt ? 'landed' : 'recovered'
		event.surface = landedOnCourt ? 'court' : 'void'
		if (landedOnCourt) {
			event.point = { x, y: 0, z }
			event.pointKind = 'surface'
			event.normal = { x: 0, y: 1, z: 0 }
		}
		land(x, z, heading)
		return event
	}

	// Snapshot identity before contact resolution; previous flight velocity preserves incoming direction, not a bounce.
	function snapshotImpact() {
		const v = _lv.lengthSq() > 1e-4 ? _lv : launchDirection
		const length = v.length() || 1
		return {
			type: 'impact',
			arrowId: id,
			kind,
			perfect,
			source: { ...source },
			point: { ...(body ? body.translation() : kind === 'bowl' ? ball.position : mesh.position) },
			pointKind: 'projectile',
			direction: { x: v.x / length, y: v.y / length, z: v.z / length },
		}
	}

	// Hit drops use physics position so bowl ammo cannot jump back to the shooter's hidden arrow mesh.
	function ground() {
		if (replica) return
		if (body) {
			const p = body.translation()
			const v = body.linvel()
			land(p.x, p.z, Math.atan2(v.x, v.z))
			return
		}
		land(mesh.position.x, mesh.position.z, mesh.rotation.y)
	}

	const _v = new THREE.Vector3()
	function update() {
		if (state !== 'flying' || !body) return
		const t = body.translation()
		const lv = body.linvel()

		if (kind === 'bowl') {
			_lv.set(lv.x, lv.y, lv.z)
			ball.position.set(t.x, t.y, t.z)
			const r = body.rotation()
			ball.quaternion.set(r.x, r.y, r.z, r.w)
			pushTrail(t.x, t.y, t.z)
			// Settle once it has all but stopped (or rolled off the edge).
			if (Math.hypot(lv.x, lv.z) < tune.weapons.bowlStop || t.y < GROUND_Y) {
				return settle(t.x, t.z, Math.atan2(lv.x, lv.z))
			}
			return
		}

		if (t.y <= GROUND_Y + 0.02 && lv.y <= 0.5) {
			// Touched down — freeze it lying along its travel heading.
			return settle(t.x, t.z, Math.atan2(lv.x, lv.z))
		}

		_lv.set(lv.x, lv.y, lv.z)
		mesh.position.set(t.x, t.y, t.z)
		pushTrail(t.x, t.y, t.z)
		_v.set(lv.x, lv.y, lv.z)
		if (_v.lengthSq() > 1e-4) mesh.quaternion.setFromUnitVectors(FORWARD, _v.normalize())
	}

	function applyDamping() {
		if (body) body.setLinearDamping(tune.arrow.linearDamping)
	}

	// Plain authoritative facts, including held/grounded arrows with no body.
	function snapshot() {
		const pose = state === 'flying' && kind === 'bowl' ? ball : mesh
		const position = body ? body.translation() : pose.position
		const quaternion = body && kind === 'bowl' ? body.rotation() : pose.quaternion
		return {
			id,
			state,
			kind,
			perfect,
			ownerTeam,
			source: source ? { ...source } : null,
			position: { x: position.x, y: position.y, z: position.z },
			quaternion: { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w },
			velocity: { ...(body ? body.linvel() : _lv) },
		}
	}

	// Only replica.js calls these after whole-packet validation. The same meshes,
	// markers and trail implement both simulated and replicated presentation.
	function applyReplicaState(data) {
		if (!replica) throw new Error('Cannot apply replica state to a simulated arrow')
		const changed =
			!replicaInitialized ||
			state !== data.state ||
			kind !== data.kind ||
			source?.id !== data.source?.id
		state = data.state
		kind = data.kind
		perfect = data.perfect
		ownerTeam = data.ownerTeam
		source = data.source ? { ...data.source } : null
		_lv.copy(data.velocity)
		const rolling = state === 'flying' && kind === 'bowl'
		mesh.visible = !rolling
		ball.visible = rolling
		ball.scale.setScalar(tune.weapons.bowlRadius)
		pickup.visible = state === 'grounded'
		trail.material.color.set(rolling ? TRAIL.bowl : perfect ? TRAIL.perfect : TRAIL.arrow)
		trail.visible = state === 'flying' && tune.fx.trails
		if (changed) {
			if (state === 'flying') resetTrail(data.position.x, data.position.y, data.position.z)
			setReplicaPose(data.position, data.quaternion)
		}
		replicaInitialized = true
	}

	function setReplicaPose(position, quaternion) {
		if (!replica) throw new Error('Cannot set replica pose on a simulated arrow')
		mesh.position.copy(position)
		mesh.quaternion.copy(quaternion)
		ball.position.copy(position)
		ball.quaternion.copy(quaternion)
		pickup.position.set(position.x, 0.025, position.z)
		if (state === 'flying') pushTrail(position.x, position.y, position.z)
	}

	// Free the arrow's body + meshes. Module-level materials are shared across all
	// arrows, so dispose only the per-instance geometries (and this trail).
	function dispose() {
		if (disposed) return
		disposed = true
		destroyBody()
		scene.remove(mesh)
		scene.remove(ball)
		scene.remove(trail)
		scene.remove(pickup)
		pickup.geometry.dispose()
		pickupFill.geometry.dispose()
		mesh.traverse((o) => {
			if (o.geometry) o.geometry.dispose()
		})
		ball.geometry.dispose()
		trailGeom.dispose()
		trail.material.dispose()
	}

	return {
		id,
		mesh,
		ball,
		pickup,
		trail,
		get state() {
			return state
		},
		get kind() {
			return kind
		},
		get position() {
			if (state === 'flying' && body) return body.translation()
			return state === 'flying' && kind === 'bowl' ? ball.position : mesh.position
		},
		get ownerTeam() {
			return ownerTeam
		},
		get velocity() {
			return _lv
		},
		get colliderHandle() {
			return collider ? collider.handle : -1
		},
		hold,
		setHeldPose,
		loose,
		ground,
		snapshotImpact,
		snapshot,
		applyReplicaState,
		setReplicaPose,
		update,
		applyDamping,
		dispose,
	}
}

// Ideal fixed-angle muzzle speed for range `dist` from height H; low damping keeps real flight near this drag-free solve.
export function solveLaunch(dist, H = 1.6) {
	const g = -tune.physics.gravity // positive magnitude
	const th = (tune.arrow.launchAngle * Math.PI) / 180
	const denom = Math.cos(th) ** 2 * (H + dist * Math.tan(th))
	if (denom <= 1e-4) return tune.arrow.maxSpeed
	const v = Math.sqrt((g * dist * dist) / (2 * denom))
	return Math.max(8, Math.min(v, tune.arrow.maxSpeed))
}

// Share fixed-angle velocity components with the preview so its arc matches the solver.
export function launchVelocity(speed) {
	const th = (tune.arrow.launchAngle * Math.PI) / 180
	return { vx: Math.cos(th) * speed, vy: Math.sin(th) * speed }
}
