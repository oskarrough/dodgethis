import * as THREE from 'three'
import { tune } from './debug.js'

// Death animations — the "you're out" flourish. The old code toppled a capsule
// in a single frame, which read as a glitch. Here an elimination instead picks a
// random *style* and plays it out smoothly over ~1.5–2s: the body melts, crumbles
// to ash, implodes, spirals into a vortex, or floats off. Slower + varied so a
// kill lands.
//
// A style is just a pure function apply(mesh, k, ctx) where k is eased-elsewhere
// raw progress 0..1, plus an optional particle spec. Adding a new way to die is
// adding one entry to STYLES — that's the whole extension point. Speed is global
// via tune.fx.deathTime (a multiplier on every style's duration).

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)
const easeInCubic = (t) => t * t * t
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t)
// Opacity that holds full until `start`, then ramps to 0 by the end — so a body
// keeps its shape while it deforms and only fades out as it finishes dissolving.
const tailFade = (t, start = 0.6) => (t < start ? 1 : 1 - (t - start) / (1 - start))

const DARK = new THREE.Color(0x2a2f3a)

// Drain every material on the unit toward a corpse-grey by k (0..1).
function tint(ctx, k) {
  k = clamp01(k)
  for (const m of ctx.mats) m.mat.color.copy(m.color0).lerp(DARK, k)
}
// Set opacity on every material (transparency was switched on at startDeath).
function fade(ctx, o) {
  o = clamp01(o)
  for (const m of ctx.mats) m.mat.opacity = o
}

// Each style: dur (seconds, before the tune.fx.deathTime multiplier), an optional
// particle puff spec, and apply(mesh, t, ctx) mutating the mesh for raw progress t.
const STYLES = {
  // Collapses into a spreading puddle and sinks into the floor.
  melt: {
    dur: 1.9,
    particle: { n: 16, color: 0x6fae7a, up: 0.6, spread: 0.5, grav: -4, size: 0.12 },
    apply(mesh, t, ctx) {
      const k = easeInCubic(t)
      mesh.scale.set(1 + k * 0.9, Math.max(0.06, 1 - k * 0.94), 1 + k * 0.9)
      mesh.position.y = ctx.baseY - (ctx.baseY - ctx.radius * 0.2) * k
      tint(ctx, k * 0.9)
      fade(ctx, tailFade(t, 0.55))
    },
  },
  // Shrinks to nothing while spinning, shedding a shower of ash.
  crumble: {
    dur: 1.5,
    particle: { n: 22, color: 0x7a8190, up: 1.4, spread: 0.9, grav: -7, size: 0.1 },
    apply(mesh, t, ctx) {
      const k = easeInCubic(t)
      const s = Math.max(0.001, 1 - k)
      mesh.scale.set(s, s, s)
      mesh.rotation.y = t * Math.PI * 4
      mesh.position.y = ctx.baseY - k * ctx.baseY * 0.5
      tint(ctx, k * 0.6)
      fade(ctx, 1 - easeInCubic(t))
    },
  },
  // The classic fall-over, but eased into a soft landing and then dissolved away.
  topple: {
    dur: 1.7,
    apply(mesh, t, ctx) {
      const fall = easeOutCubic(clamp01(t / 0.55))
      mesh.rotation.z = (Math.PI / 2) * fall
      mesh.position.y = ctx.baseY - (ctx.baseY - ctx.radius) * fall
      tint(ctx, fall * 0.8)
      fade(ctx, tailFade(t, 0.62))
    },
  },
  // Squeezed flat horizontally into a vertical sliver, then snuffed out.
  implode: {
    dur: 1.25,
    particle: { n: 14, color: 0xffd35d, up: 0.2, spread: 1.6, grav: -2, size: 0.09 },
    apply(mesh, t, ctx) {
      const kh = easeInCubic(clamp01(t / 0.7))
      const kv = easeInCubic(clamp01((t - 0.6) / 0.4))
      mesh.scale.set(Math.max(0.001, 1 - kh), Math.max(0.001, 1 - kv), Math.max(0.001, 1 - kh))
      mesh.rotation.y = t * Math.PI * 3
      tint(ctx, kh * 0.7)
      fade(ctx, 1 - kv)
    },
  },
  // Wrung into a twisting thread by an accelerating spin.
  vortex: {
    dur: 1.55,
    particle: { n: 18, color: 0x8aa0ff, up: 0.5, spread: 1.1, grav: -3, size: 0.1 },
    apply(mesh, t, ctx) {
      const k = easeInCubic(t)
      mesh.rotation.y = t * t * Math.PI * 11
      mesh.scale.set(Math.max(0.001, 1 - k), 1 + k * 0.8, Math.max(0.001, 1 - k))
      mesh.position.y = ctx.baseY - k * ctx.baseY * 0.4
      tint(ctx, k * 0.7)
      fade(ctx, tailFade(t, 0.55))
    },
  },
  // The soul floats up and out, shrinking as it goes.
  ascend: {
    dur: 1.9,
    particle: { n: 16, color: 0xbfe0ff, up: 1.8, spread: 0.4, grav: 1.5, size: 0.11 },
    apply(mesh, t, ctx) {
      const k = easeOutCubic(t)
      mesh.position.y = ctx.baseY + k * 3.2
      const s = 1 - k * 0.78
      mesh.scale.set(s, s, s)
      mesh.rotation.y = t * Math.PI * 2
      tint(ctx, k * 0.5)
      fade(ctx, tailFade(t, 0.35))
    },
  },
  // Reserved for falls into the void: keep plunging with a slow tumble + fade.
  sink: {
    dur: 1.6,
    apply(mesh, t, ctx) {
      mesh.position.y = ctx.baseY - t * 9
      mesh.rotation.z = t * Math.PI * 1.5
      mesh.rotation.x = t * Math.PI * 0.8
      tint(ctx, t * 0.6)
      fade(ctx, tailFade(t, 0.4))
    },
  },
}

// Styles eligible for a normal (arrow) elimination. 'sink' is fall-only.
const PICKABLE = ['melt', 'crumble', 'topple', 'implode', 'vortex', 'ascend']

// A little burst of points that scatter from the death spot, arc under gravity,
// settle on the floor, and fade with the animation. Pure visual, no physics.
function makePuff(scene, pos, spec) {
  const n = spec.n
  const positions = new Float32Array(n * 3)
  const vel = new Array(n)
  for (let i = 0; i < n; i++) {
    positions[i * 3] = pos.x
    positions[i * 3 + 1] = pos.y + Math.random() * 0.9
    positions[i * 3 + 2] = pos.z
    const ang = Math.random() * Math.PI * 2
    const r = Math.random() * spec.spread
    vel[i] = { x: Math.cos(ang) * r, y: spec.up * (0.5 + Math.random()), z: Math.sin(ang) * r }
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const mat = new THREE.PointsMaterial({
    color: spec.color, size: spec.size, transparent: true, opacity: 0.9, depthWrite: false,
  })
  const points = new THREE.Points(geom, mat)
  points.frustumCulled = false
  scene.add(points)

  function update(dt, t) {
    for (let i = 0; i < n; i++) {
      const v = vel[i]
      v.y += spec.grav * dt
      positions[i * 3] += v.x * dt
      positions[i * 3 + 1] += v.y * dt
      positions[i * 3 + 2] += v.z * dt
      if (positions[i * 3 + 1] < 0.02) { positions[i * 3 + 1] = 0.02; v.y = 0; v.x *= 0.7; v.z *= 0.7 }
    }
    geom.attributes.position.needsUpdate = true
    mat.opacity = 0.9 * (1 - t)
  }
  function dispose() {
    scene.remove(points)
    geom.dispose()
    mat.dispose()
  }
  return { update, dispose }
}

// Begin a death animation on a unit's mesh. Returns { update(dt), dispose(), done,
// style } — the round ticks update each frame; player.dispose() calls dispose().
export function startDeath(scene, mesh, { fell = false, radius = 0.4 } = {}) {
  const baseY = mesh.position.y

  // Snapshot every material (capsule + nose) and switch on transparency so the
  // fade can work; remember the base colors so the tint can lerp from them.
  const mats = []
  mesh.traverse((o) => {
    if (o.isMesh && o.material) {
      o.material.transparent = true
      mats.push({ mat: o.material, color0: o.material.color.clone() })
    }
  })

  const name = fell ? 'sink' : PICKABLE[(Math.random() * PICKABLE.length) | 0]
  const style = STYLES[name]
  const ctx = { baseY, radius, mats, fell }
  const puff = style.particle ? makePuff(scene, mesh.position, style.particle) : null

  let t = 0
  let done = false

  function update(dt) {
    if (done) return
    t += dt / (style.dur * Math.max(0.1, tune.fx.deathTime))
    const tc = clamp01(t)
    style.apply(mesh, tc, ctx)
    if (puff) puff.update(dt, tc)
    if (t >= 1) done = true
  }

  function dispose() {
    if (puff) puff.dispose()
  }

  return { update, dispose, get done() { return done }, style: name }
}
