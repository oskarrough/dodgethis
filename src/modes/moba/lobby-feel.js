import * as THREE from 'three'
import { tune } from './tune.js'

// Lobby feel: the cardboard flip on a hero swap, and props that squash when bumped and rock when hit.

const right = new THREE.Vector3()
const local = new THREE.Vector3()
const turn = new THREE.Quaternion()
const squeeze = new THREE.Matrix4()

// Scale by `s` along the horizontal unit axis (ux, uz) through the point (px, pz): a cutout seen edge-on.
function alongAxis(m, ux, uz, s, px = 0, pz = 0) {
	const k = s - 1
	const t = -k * (ux * px + uz * pz)
	// prettier-ignore
	return m.set(
		1 + k * ux * ux, 0, k * ux * uz, t * ux,
		0, 1, 0, 0,
		k * ux * uz, 0, 1 + k * uz * uz, t * uz,
		0, 0, 0, 1,
	)
}

// The body narrows across the camera, whatever way it faces; its foot disc, the shadow, keeps its own width.
function squashedRoot() {
	THREE.Object3D.prototype.updateMatrix.call(this)
	const { s, ux, uz } = this.userData.flip
	this.matrix.premultiply(alongAxis(squeeze, ux, uz, s, this.position.x, this.position.z))
}
function unsquashedDisc() {
	THREE.Object3D.prototype.updateMatrix.call(this)
	const { s, ux, uz, disc } = this.parent.userData.flip
	if (disc === 'hidden') return
	local.set(ux, 0, uz).applyQuaternion(turn.copy(this.parent.quaternion).invert())
	this.matrix.premultiply(alongAxis(squeeze, local.x, local.z, 1 / s))
}
function discs(mesh) {
	return mesh.children.filter((o) => o.name === 'foot-disc' || o.name === 'foot-ring')
}
function setFlip(mesh, flip) {
	mesh.userData.flip = flip
	mesh.updateMatrix = squashedRoot
	for (const d of discs(mesh)) {
		d.updateMatrix = unsquashedDisc
		d.visible = flip.disc !== 'hidden'
	}
}
function clearFlip(mesh) {
	delete mesh.userData.flip
	delete mesh.updateMatrix
	for (const d of discs(mesh)) {
		delete d.updateMatrix
		d.visible = true
	}
}

// On a swap the old body turns edge-on, then the new one comes round with a little overshoot. Its foot disc
// is down at full width from the first frame, so the shadow changes a beat before the body does. Swaps
// happen in the sim, which has already disposed the old body: its mesh comes back for the turn away.
export function createFlips() {
	const shown = new Map()
	const flips = new Map()
	const pending = new Map()
	const drop = (flip) => {
		if (!flip?.ghost) return
		flip.ghost.removeFromParent()
		flip.ghost.traverse((o) => {
			o.geometry?.dispose()
			o.material?.dispose()
		})
		flip.ghost = null
	}
	return {
		// `time` in seconds of lobby sim time: the swap fact's own tick, so a hidden tab skips the flip.
		start(id, time) {
			pending.set(id, time)
		},
		update(heroes, time, camera) {
			const f = tune.lobby.pick
			right.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize()
			for (const human of heroes) {
				const was = shown.get(human.id)
				if (was && was.heroId !== human.heroId) {
					drop(flips.get(human.id))
					const at = pending.get(human.id) ?? time
					pending.delete(human.id)
					const flip = { at, ghost: null }
					flips.set(human.id, flip)
					if (was.body !== human.body && time - at < f.flipTime * f.flipOut) {
						flip.ghost = was.body.mesh
						human.body.mesh.parent?.add(flip.ghost)
					}
				}
				shown.set(human.id, { body: human.body, heroId: human.heroId })
				const flip = flips.get(human.id)
				if (!flip) continue
				const mesh = human.body.mesh
				const k = (time - flip.at) / f.flipTime
				if (k >= 1 || k < 0) {
					drop(flip)
					clearFlip(mesh)
					flips.delete(human.id)
					continue
				}
				const axis = { ux: right.x, uz: right.z }
				if (k < f.flipOut) {
					const out = k / f.flipOut
					if (flip.ghost) {
						flip.ghost.position.copy(mesh.position)
						setFlip(flip.ghost, { ...axis, s: 1 - (1 - f.flipEdge) * out * out, disc: 'hidden' })
					}
					setFlip(mesh, { ...axis, s: f.flipEdge })
				} else {
					drop(flip)
					const j = (k - f.flipOut) / (1 - f.flipOut)
					const open = 1 - (1 - j) ** 3 + Math.sin(j * Math.PI) * f.flipOvershoot
					setFlip(mesh, { ...axis, s: f.flipEdge + (1 - f.flipEdge) * open })
				}
			}
		},
		// A body that rides on into the match must leave with its own matrix.
		dispose() {
			for (const [id, flip] of flips) {
				drop(flip)
				const mesh = shown.get(id)?.body.mesh
				if (mesh) clearFlip(mesh)
			}
		},
	}
}

// A damped spring per prop: `squash` flattens it (scale), `tilt` rocks it about world X and Z.
function spring() {
	return { squash: 0, squashV: 0, x: 0, xV: 0, z: 0, zV: 0 }
}
function settle(s, dt) {
	const { stiffness: k, damping: c } = tune.lobby.jolt
	for (const [p, v] of [
		['squash', 'squashV'],
		['x', 'xV'],
		['z', 'zV'],
	]) {
		s[v] += (-k * s[p] - c * s[v]) * dt
		s[p] += s[v] * dt
	}
}
function pose(object, s, scale = 1) {
	object.rotation.order = 'ZXY'
	object.rotation.x = s.x
	object.rotation.z = s.z
	object.scale.set(scale * (1 + s.squash / 2), scale * (1 - s.squash), scale * (1 + s.squash / 2))
}
// Rock away from a shot travelling (dx, dz): the top leans the way it was going.
function rock(s, dx, dz, kick) {
	const n = Math.hypot(dx, dz) || 1
	s.xV += (dz / n) * kick
	s.zV -= (dx / n) * kick
}

// Props on the saucer: the weather bowl and the bot holograms on their plates. A hero walking into one
// squashes it, a shot passing through or stopping on it rocks it, and each settles with a small overshoot.
export function createJolts({ bowl, props }) {
	const j = () => tune.lobby.jolt
	const b = tune.lobby.bowl
	const target = (fields) => ({
		spring: spring(),
		touching: new Set(),
		knocked: new Set(),
		...fields,
	})
	const targets = [target({ x: b.x, z: b.z, radius: b.radius, object: () => bowl.group })]
	for (const p of props.seatProps)
		for (const h of p.holograms)
			targets.push(
				target({
					radius: h.body.radius,
					object: () => (h.body.mesh.visible ? h.body.mesh : null),
					// Holograms walk onto their plates: read where they are now.
					get x() {
						return p.seat.x + h.body.mesh.position.x
					},
					get z() {
						return p.seat.z + h.body.mesh.position.z
					},
				}),
			)
	// Without a direction (a bank off the bowl's wall), the prop leans away from where it was struck.
	function knock(point, dx, dz, id) {
		for (const t of targets) {
			if (!t.object() || t.knocked.has(id)) continue
			if (Math.hypot(point.x - t.x, point.z - t.z) > t.radius + j().reach) continue
			t.knocked.add(id)
			if (t.knocked.size > 32) t.knocked.delete(t.knocked.values().next().value)
			rock(t.spring, dx ?? t.x - point.x, dz ?? t.z - point.z, j().hit)
			t.spring.squashV += j().hit * j().hitSquash
		}
	}
	let last = null
	return {
		// A shot stopped or banked by the bowl's wall says so as a fact; holograms let shots through, so
		// they're caught in flight by `update`. Each shot rocks a prop once.
		fact(fact) {
			if (!['blocked', 'expired', 'cushion'].includes(fact.type) || !fact.point) return
			knock(fact.point, fact.direction?.x, fact.direction?.z, fact.projectile)
		},
		update(time, heroes, shots) {
			const dt = Math.min(1 / 30, Math.max(0, time - (last ?? time)))
			last = time
			for (const shot of shots) knock(shot, shot.dx, shot.dz, shot.id)
			for (const t of targets) {
				const object = t.object()
				if (!object) continue
				for (const human of heroes) {
					const p = human.body.position
					const gap = Math.hypot(p.x - t.x, p.z - t.z) - t.radius - human.body.radius
					if (gap >= j().contact) {
						t.touching.delete(human.id)
						continue
					}
					if (t.touching.has(human.id)) continue
					t.touching.add(human.id)
					const v = human.body.velocity
					const speed = Math.hypot(v.x, v.z)
					if (speed <= j().minSpeed) continue
					t.spring.squashV += Math.min(1, speed / j().fullSpeed) * j().bump
					rock(t.spring, t.x - p.x, t.z - p.z, j().bump * j().bumpRock)
				}
				settle(t.spring, dt)
				pose(object, t.spring)
			}
		},
	}
}
