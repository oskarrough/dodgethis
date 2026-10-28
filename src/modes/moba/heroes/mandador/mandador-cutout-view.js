import * as THREE from 'three'
import { STEP } from '../../../../core/app.js'
import { PALETTE } from '../../../../core/style.js'
import { makeStyleMaterial } from '../../../../core/stylepass.js'
import { tune } from '../../tune.js'
import { look } from '../../look.js'
import { createEffects } from '../../effects.js'
import { poseWindup, poseStrike } from '../../pose-curve.js'
import { sweepObstacles, mapExit } from '../../obstacles.js'
import { mandadorThrowOrigin } from './mandador-cutout.js'

const RELEASED = 0.6
const clamp01 = (x) => Math.max(0, Math.min(1, x))

// While the hero is down, the cutout stands outside the touchline and throws for it. The board leans back over the cast
// point and snaps forward on the throw, the lane it will fly along is marked in the owner's colour with a cream line
// filling toward the throw, and a hit that takes time off the respawn pulses where the throw leaves.
export function createMandadorCutouts(scene) {
	const group = new THREE.Group()
	group.name = 'mandador-cutouts'
	scene.add(group)
	const effects = createEffects(group)
	const t = look.silhouettes
	const v = tune.heroes.mandador.view
	const grey = makeStyleMaterial('scenery', { flat: true })
	const ink = makeStyleMaterial('ink', { flat: true })
	const cream = makeStyleMaterial('cream', { flat: true })
	const teams = {
		A: makeStyleMaterial('teamA', { flat: true }),
		B: makeStyleMaterial('teamB', { flat: true }),
	}
	const body = new THREE.BoxGeometry(t.mandadorWidth, t.mandadorHeight, t.mandadorDepth)
	const cone = new THREE.CylinderGeometry(
		t.megaphoneRadius,
		t.arrowRadius,
		t.megaphoneLength,
		t.segments,
	).rotateX(-Math.PI / 2)
	const line = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5)
	const bodies = new Map() // cutout id → { root, lane, fill, cast, releasedAt, dir }
	const respawns = new Map() // owner id → the respawn tick last seen
	let last = -Infinity

	function strip(mesh, from, to, width) {
		mesh.position.set(from.x, tune.map.markerLayers.aim, from.z)
		mesh.rotation.y = Math.atan2(to.x - from.x, to.z - from.z) + Math.PI
		mesh.scale.set(width, 1, Math.hypot(to.x - from.x, to.z - from.z))
	}
	function stand(c) {
		const root = new THREE.Group()
		const bar = new THREE.Mesh(body, grey)
		bar.position.y = t.mandadorHeight / 2
		root.add(bar)
		const megaphone = new THREE.Mesh(cone, ink)
		megaphone.position.set(0, t.mandadorHeight / 2, t.megaphoneZ)
		root.add(megaphone)
		const lane = new THREE.Mesh(line, teams[c.team] ?? teams.B)
		const fill = new THREE.Mesh(line, cream)
		lane.visible = fill.visible = false
		group.add(root, lane, fill)
		return { root, lane, fill, cast: null, releasedAt: null, dir: null }
	}
	function remove(id) {
		const b = bodies.get(id)
		group.remove(b.root, b.lane, b.fill)
		bodies.delete(id)
	}
	function clear() {
		for (const id of bodies.keys()) remove(id)
		respawns.clear()
		effects.reset()
	}

	return {
		update({ cutouts: live = [], units = [], bounds, obstacles = [], tick, alpha = 0 }) {
			const now = tick + alpha
			if (now < last) clear()
			effects.update(Number.isFinite(last) && now >= last ? (now - last) * STEP : 0)
			last = now
			const ids = new Set(live.map((c) => c.id))
			for (const id of bodies.keys()) if (!ids.has(id)) remove(id)
			for (const c of live) {
				const b = bodies.get(c.id) ?? bodies.set(c.id, stand(c)).get(c.id)
				const x = (c.prevX ?? c.x) + (c.x - (c.prevX ?? c.x)) * alpha
				const at = { ...c, x }
				const from = mandadorThrowOrigin(at, bounds, obstacles)
				const pose = v.pose.cutout
				b.root.position.set(x, 0, c.z)
				b.root.rotation.y = c.cast?.yaw ?? (c.flank < 0 ? Math.PI : 0)
				// The board pivots on its foot: coil over the cast point, snap into the throw, settle.
				let lean = 0
				if (c.cast) {
					const progress = 1 - (c.cast.left - alpha) / Math.max(1, c.cast.total)
					lean = pose.back * poseWindup(progress)
					b.cast = { progress, dir: c.cast.dir }
					b.releasedAt = null
				} else {
					if (b.cast && b.releasedAt == null && b.cast.progress >= RELEASED) {
						b.releasedAt = now
						b.dir = b.cast.dir
						const reach = {
							x: from.x + b.dir.x * v.passLine.length,
							z: from.z + b.dir.z * v.passLine.length,
						}
						effects.streak(
							{ x: from.x + b.dir.x * v.passLine.start, z: from.z + b.dir.z * v.passLine.start },
							reach,
							{
								color: PALETTE.cream,
								width: v.passLine.width,
								life: v.passLine.life,
								y: v.passLine.y,
							},
						)
					}
					b.cast = null
					if (b.releasedAt != null) {
						const seconds = (now - b.releasedAt) * STEP
						const fire = clamp01(seconds / Math.max(STEP, pose.snap))
						const settle = 1 - clamp01((seconds - pose.snap) / Math.max(STEP, pose.recover))
						lean = pose.back * (1 - fire) * settle - pose.forward * poseStrike(fire, settle)
						if (settle <= 0) b.releasedAt = null
					}
				}
				b.root.rotation.x = lean
				b.lane.visible = b.fill.visible = !!c.cast
				if (c.cast) {
					const end = {
						x: from.x + c.cast.dir.x * tune.outThrow.range,
						z: from.z + c.cast.dir.z * tune.outThrow.range,
					}
					const length =
						tune.outThrow.range *
						Math.min(
							sweepObstacles(from, end, tune.outThrow.radius, obstacles) ?? 1,
							mapExit(from, end, tune.outThrow.radius, bounds) ?? 1,
						)
					const to = { x: from.x + c.cast.dir.x * length, z: from.z + c.cast.dir.z * length }
					strip(b.lane, from, to, tune.outThrow.radius * 2)
					const progress = 1 - (c.cast.left - alpha) / Math.max(1, c.cast.total)
					strip(
						b.fill,
						from,
						{ x: from.x + (to.x - from.x) * progress, z: from.z + (to.z - from.z) * progress },
						tune.outThrow.radius,
					)
				}
				// A hit that shortens the respawn: the owner's timer jumps back, and the throw's spot answers.
				const owner = units.find((u) => u.id === c.owner)
				if (owner?.dead && Number.isFinite(owner.respawnTick)) {
					const before = respawns.get(owner.id)
					if (before != null && owner.respawnTick < before - 1)
						effects.spokes(from, {
							color: PALETTE.cream,
							ink: PALETTE.ink,
							count: v.refund.count,
							from: v.refund.from,
							to: v.refund.to,
							life: v.refund.life,
							turn: tick * 0.7,
						})
					respawns.set(owner.id, owner.respawnTick)
				}
			}
		},
		dispose() {
			clear()
			effects.dispose()
			scene.remove(group)
			for (const owned of [grey, ink, cream, teams.A, teams.B, body, cone, line]) owned.dispose()
		},
	}
}
