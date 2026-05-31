import * as THREE from 'three'
import { tune } from './debug.js'
import { TRAIL } from './weapons.js'

// The arrow state machine — the spine of the whole game (see plan.md):
//   held → flying → grounded → held
//
// Only a *flying* arrow has a Rapier rigid body. Held arrows ride the player's
// hand (pure transform), grounded arrows are static markers you can grab. The
// body is created on loose() and destroyed on land()/hold(), so the physics
// world only ever simulates arrows actually in the air.

const FORWARD = new THREE.Vector3(0, 0, 1)
const GROUND_Y = 0.045

let _id = 0

const shaftMat = new THREE.MeshStandardMaterial({ color: 0xcaa15a, roughness: 0.7 })
const tipMat = new THREE.MeshStandardMaterial({ color: 0xdfe6f0, metalness: 0.4, roughness: 0.4 })
const fletchMat = new THREE.MeshStandardMaterial({ color: 0xff5d5d, roughness: 0.8 })
// The bowl's chunky ball (a unit sphere, scaled to bowlRadius when loosed).
const bowlMat = new THREE.MeshStandardMaterial({ color: TRAIL.bowl, roughness: 0.5, metalness: 0.2 })

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

export function createArrow(scene, world, RAPIER, { position = [0, GROUND_Y, 0] } = {}) {
  const id = _id++
  const mesh = buildMesh()
  scene.add(mesh)

  // A separate ball mesh shown only while this projectile is flying as a bowl.
  // Kept hidden the rest of the time; the arrow `mesh` hides while it's up.
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
    new THREE.LineBasicMaterial({ color: 0xffd35d, transparent: true, opacity: 0.55 }),
  )
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
  const _lv = new THREE.Vector3() // last known velocity (for AI threat detection)

  function placeGrounded(x, z, heading = 0) {
    state = 'grounded'
    kind = 'arrow'
    ball.visible = false
    mesh.visible = true
    mesh.rotation.set(0, heading, 0)
    mesh.position.set(x, GROUND_Y, z)
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
    destroyBody()
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

  // Loose it: spawn a dynamic body at the hand, fire it along dir + launch angle.
  // `speed` is the muzzle speed in m/s (main solves this so the arrow lands on
  // the reticle); falls back to the tunable when not supplied. `opts.kind`
  // selects the weapon ('arrow' default, or 'bowl'); `opts.perfect` flags a
  // perfectly-timed charge release (hotter trail).
  function loose(fromPos, dir, team = null, speed = tune.arrow.impulse, opts = {}) {
    state = 'flying'
    ownerTeam = team
    kind = opts.kind === 'bowl' ? 'bowl' : 'arrow'
    perfect = !!opts.perfect
    if (kind === 'bowl') { looseBowl(fromPos, dir, speed); return }

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
    // Ball collider: arrow flies like a point-mass, mesh shows the pointing.
    // COLLISION_EVENTS so the main loop hears arrow-vs-unit contacts.
    collider = world.createCollider(
      RAPIER.ColliderDesc.ball(0.06).setDensity(2).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    )

    const a = (tune.arrow.launchAngle * Math.PI) / 180
    const horiz = Math.cos(a) * speed
    const vy = Math.sin(a) * speed
    body.setLinvel({ x: dir.x * horiz, y: vy, z: dir.z * horiz }, true)
  }

  // Bowl: a big heavy ball spawned at ground level in front of the hand, fired
  // flat so it rolls. Slower than an arrow but a much wider hit. Settles into a
  // grabbable arrow once it loses momentum (see update()).
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
      RAPIER.ColliderDesc.ball(r).setDensity(tune.weapons.bowlDensity).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    )
    body.setLinvel({ x: dir.x * speed, y: 0, z: dir.z * speed }, true)
    // Spin it about the axis perpendicular to travel so it visibly rolls.
    body.setAngvel({ x: dir.z * speed / r, y: 0, z: -dir.x * speed / r }, true)
  }

  function land(x, z, heading) {
    destroyBody()
    _lv.set(0, 0, 0)
    trail.visible = false
    placeGrounded(x, z, heading)
  }

  // Called on a hit: drop the arrow where it currently is so it stays grabbable.
  function ground() {
    const p = mesh.position
    land(p.x, p.z, mesh.rotation.y)
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
        land(t.x, t.z, Math.atan2(lv.x, lv.z))
      }
      return
    }

    if (t.y <= GROUND_Y + 0.02 && lv.y <= 0.5) {
      // Touched down — freeze it lying along its travel heading.
      land(t.x, t.z, Math.atan2(lv.x, lv.z))
      return
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

  // Free the arrow's body + meshes. Module-level materials are shared across all
  // arrows, so dispose only the per-instance geometries (and this trail).
  function dispose() {
    destroyBody()
    scene.remove(mesh)
    scene.remove(ball)
    scene.remove(trail)
    mesh.traverse((o) => { if (o.geometry) o.geometry.dispose() })
    ball.geometry.dispose()
    trailGeom.dispose()
    trail.material.dispose()
  }

  return {
    id,
    mesh,
    get state() { return state },
    get kind() { return kind },
    get position() { return mesh.position },
    get ownerTeam() { return ownerTeam },
    get velocity() { return _lv },
    get colliderHandle() { return collider ? collider.handle : -1 },
    hold,
    setHeldPose,
    loose,
    ground,
    update,
    applyDamping,
    dispose,
  }
}

// Ballistic solve: at the fixed launch angle, what muzzle speed lands an arrow on
// a target `dist` meters away (fired from height H)? Shared by the human's aim
// (main.js, so the reticle means something) and the AI (round.js, leading shots).
// No drag term; linearDamping is kept low so real flight stays near this ideal.
export function solveLaunch(dist, H = 1.6) {
  const g = -tune.physics.gravity // positive magnitude
  const th = (tune.arrow.launchAngle * Math.PI) / 180
  const denom = Math.cos(th) ** 2 * (H + dist * Math.tan(th))
  if (denom <= 1e-4) return tune.arrow.maxSpeed
  const v = Math.sqrt((g * dist * dist) / (2 * denom))
  return Math.max(8, Math.min(v, tune.arrow.maxSpeed))
}

// Decompose a muzzle speed into horizontal/vertical components at the fixed
// launch angle. Shared by the aim preview (main.js) so the drawn arc matches the
// angle the solver assumes.
export function launchVelocity(speed) {
  const th = (tune.arrow.launchAngle * Math.PI) / 180
  return { vx: Math.cos(th) * speed, vy: Math.sin(th) * speed }
}
