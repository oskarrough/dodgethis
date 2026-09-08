import * as THREE from 'three'
import { tune } from './tune.js'
import { PALETTE } from './style.js'
import { FORWARD_LAYER } from './stylepass.js'

// Immediate out pose, then a comic exit. feedback.js owns the timing and pooled
// particles; these curves only animate a mesh that gameplay has already retired.

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)
const easeInCubic = (t) => t * t * t
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t)
// Opacity that holds full until `start`, then ramps to 0 by the end — so a body
// keeps its shape while it deforms and only fades out as it finishes dissolving.
const tailFade = (t, start = 0.6) => (t < start ? 1 : 1 - (t - start) / (1 - start))

const DARK = new THREE.Color(PALETTE.ink)

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

// Each style: duration and a curve over raw progress 0..1.
const STYLES = {
	// Collapses into a spreading puddle and sinks into the floor.
	melt: {
		dur: 1.9,
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

// The unit owns the replacement corpse materials and disposes them on reset.
export function startDeath(mesh, { fell = false, radius = 0.4 } = {}) {
	mesh.visible = true
	const squash = fell ? 1 : 0.65
	mesh.scale.set(fell ? 1 : 1.2, squash, fell ? 1 : 1.2)
	mesh.position.y *= squash
	const baseY = mesh.position.y

	// Corpses replace their owned surface-data shaders with actual colors and
	// opacity. Release each old material; the unit owns its replacement.
	const mats = []
	mesh.traverse((o) => {
		if (!o.isMesh || !o.material) return
		const previous = o.material
		const material = new THREE.MeshBasicMaterial({
			color: previous.color ?? previous.userData.styleColor ?? PALETTE.cream,
			side: previous.side,
			transparent: true,
			depthWrite: false,
		})
		material.color.lerp(DARK, 0.85)
		o.material = material
		o.layers.set(FORWARD_LAYER)
		previous.dispose()
		mats.push({ mat: material, color0: material.color.clone() })
	})

	const name = fell ? 'sink' : PICKABLE[(Math.random() * PICKABLE.length) | 0]
	const style = STYLES[name]
	const ctx = { baseY, radius, mats, fell }

	let t = 0
	let done = false

	function update(dt) {
		if (done) return
		t += dt / (style.dur * Math.max(0.1, tune.fx.deathTime))
		const tc = clamp01(t)
		mesh.scale.set(1, 1, 1)
		style.apply(mesh, tc, ctx)
		if (!fell) {
			mesh.scale.x *= 1.2
			mesh.scale.y *= squash
			mesh.scale.z *= 1.2
		}
		if (t >= 1) {
			done = true
			mesh.visible = false
		}
	}

	return {
		update,
		get done() {
			return done
		},
		style: name,
	}
}
