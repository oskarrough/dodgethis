import * as THREE from 'three'
import { PALETTE } from './style.js'
import { FORWARD_LAYER } from './stylepass.js'

// Animate retired meshes from out pose to comic exit: the juice kit's `retire` verb (juice.js).

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)
const easeInCubic = (t) => t * t * t
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t)
// Hold opacity until `start`, then fade to zero so deformation reads before the body dissolves.
const tailFade = (t, start = 0.6) => (t < start ? 1 : 1 - (t - start) / (1 - start))

const DARK = new THREE.Color(PALETTE.ink)
const CREAM = new THREE.Color(PALETTE.cream)

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

// Thrown off the court: sails `reach` metres along the shove with a `hop`, tumbling, lands at `water` (a height)
// after `time` seconds, then sinks and fades over `sink`.
const _turn = new THREE.Quaternion()
function overboardPose(mesh, seconds, ctx, { reach, hop, time, sink, water }) {
	const k = clamp01(seconds / Math.max(0.001, time))
	mesh.position.set(
		ctx.from.x + ctx.dir.x * reach * k,
		ctx.from.y + hop * 4 * k * (1 - k) + (water - ctx.from.y) * k * k,
		ctx.from.z + ctx.dir.z * reach * k,
	)
	const under = Math.max(0, seconds - time)
	mesh.position.y -= under * 2.5
	mesh.quaternion.copy(ctx.yaw).premultiply(_turn.setFromAxisAngle(ctx.spin, k * Math.PI * 0.9))
	fade(ctx, 1 - clamp01(under / Math.max(0.001, sink)))
}

// Tips over like a cardboard standee: pivots on its foot away from the hit, slaps flat with a small bounce,
// is pressed into the print and fades. Timings are seconds from `card` (fall, bounce, press, hold, fade); flat, rebound and tint are fractions.
function cardPose(mesh, seconds, ctx) {
	const c = ctx.card
	const fall = clamp01(seconds / c.fall)
	const bounce = clamp01((seconds - c.fall) / c.bounce)
	const press = clamp01((seconds - c.fall - c.bounce) / c.press)
	const angle = (Math.PI / 2) * (fall * fall - c.rebound * Math.sin(Math.PI * bounce))
	ctx.tip.quaternion.setFromAxisAngle(ctx.axis, angle)
	ctx.press.scale.y = 1 - (1 - c.flat) * easeOutCubic(press)
	fade(ctx, 1 - clamp01((seconds - c.fall - c.bounce - c.press - c.hold) / c.fade))
}

// Styles eligible for a normal (arrow) elimination. 'sink' is fall-only; 'card' is asked for by name.
const PICKABLE = ['melt', 'crumble', 'topple', 'implode', 'vortex', 'ascend']

// The unit owns the replacement corpse materials and disposes them on reset.
// `flash` is seconds of pure cream before the tint; `pace()` multiplies the length, read live.
export function startDeath(
	mesh,
	{
		fell = false,
		radius = 0.4,
		flash: hitFlash = 0.07,
		pace = () => 1,
		style = null,
		direction = null,
		card = null,
		overboard = null,
	} = {},
) {
	mesh.visible = true
	const name = fell
		? 'sink'
		: style === 'overboard' && overboard
			? 'overboard'
			: style === 'card' && card
				? 'card'
				: PICKABLE[(Math.random() * PICKABLE.length) | 0]
	const whole = fell || name === 'card' || name === 'overboard'
	const squash = whole ? 1 : 0.65
	const wide = whole ? 1 : 1.2
	mesh.scale.set(wide, squash, wide)
	mesh.position.y *= squash
	const baseY = mesh.position.y

	// Replace and release surface-data shaders for corpse color/opacity; the unit owns the new materials.
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
		material.color.lerp(DARK, name === 'card' ? card.tint : name === 'overboard' ? 0 : 0.85) // a card keeps its print colour
		o.material = material
		o.layers.set(FORWARD_LAYER)
		previous.dispose()
		mats.push({ mat: material, color0: material.color.clone() })
		material.color.copy(CREAM) // hit flash: the first frames print pure cream before the tint sets in
	})

	const ctx = { baseY, radius, mats, fell }
	if (name === 'card') {
		// press (unrotated, at the foot) → tip (rotates) → mesh, so pressing flattens straight down after the fall.
		const parent = mesh.parent
		ctx.press = new THREE.Group()
		ctx.tip = new THREE.Group()
		ctx.press.position.set(mesh.position.x, 0, mesh.position.z)
		parent?.add(ctx.press)
		ctx.press.add(ctx.tip)
		ctx.tip.attach(mesh)
		const length = Math.hypot(direction?.x ?? 0, direction?.z ?? 0)
		const [dx, dz] = length > 1e-6 ? [direction.x / length, direction.z / length] : [1, 0]
		ctx.axis = new THREE.Vector3(dz, 0, -dx) // up × direction: the top falls along the hit
		ctx.card = card
	}
	const total =
		name === 'card'
			? card.fall + card.bounce + card.press + card.hold + card.fade
			: name === 'overboard'
				? overboard.time + overboard.sink
				: 0
	if (name === 'overboard') {
		const length = Math.hypot(direction?.x ?? 0, direction?.z ?? 0) || 1
		ctx.from = mesh.position.clone()
		ctx.dir = { x: (direction?.x ?? 0) / length, z: (direction?.z ?? 1) / length }
		ctx.spin = new THREE.Vector3(ctx.dir.z, 0, -ctx.dir.x) // tumbles head first along the flight
		ctx.yaw = mesh.quaternion.clone()
	}

	let t = 0
	let done = false
	let flash = hitFlash

	function update(dt) {
		if (done) return
		if (name === 'overboard') {
			t += dt / Math.max(0.001, total * Math.max(0.1, pace()))
			overboardPose(mesh, clamp01(t) * total, ctx, overboard)
			tint(ctx, 0)
			flash -= dt
			if (flash > 0) for (const m of mats) m.mat.color.copy(CREAM)
			if (t >= 1) {
				done = true
				mesh.visible = false
			}
			return
		}
		if (name === 'card') {
			t += dt / Math.max(0.001, total * Math.max(0.1, pace()))
			cardPose(mesh, clamp01(t) * total, ctx)
			tint(ctx, 0) // back to the print colour once the hit flash ends
			flash -= dt
			if (flash > 0) for (const m of mats) m.mat.color.copy(CREAM)
			if (t >= 1) {
				done = true
				mesh.visible = false
				ctx.press.removeFromParent()
			}
			return
		}
		t += dt / (STYLES[name].dur * Math.max(0.1, pace()))
		const tc = clamp01(t)
		mesh.scale.set(1, 1, 1)
		STYLES[name].apply(mesh, tc, ctx)
		flash -= dt
		if (flash > 0) for (const m of mats) m.mat.color.copy(CREAM)
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
