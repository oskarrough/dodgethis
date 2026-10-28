import * as THREE from 'three'
import { STEP } from '../../../../core/app.js'
import { PALETTE } from '../../../../core/style.js'
import { FORWARD_LAYER, makeStyleMaterial } from '../../../../core/stylepass.js'
import { glowMaterial } from '../../effects.js'
import { tune } from '../../tune.js'

// Lob draws its own zone: skills-view leaves zones of an ability with `drawsZone` alone.
export const drawsZone = true
const GROUND = tune.map.printLayers.seams + 0.005

// The whole throw follows one continuous arc. The fixed team rim is the danger;
// the moving shadow is only a clock. Burn ground keeps that rim until its last tick.
export function extras(scene) {
	const group = new THREE.Group()
	scene.add(group)
	const owned = []
	const own = (resource) => {
		owned.push(resource)
		return resource
	}
	const flat = (role) => own(makeStyleMaterial(role, { flat: true }))
	const cream = flat('cream')
	const teams = { A: flat('teamA'), B: flat('teamB') }
	const v = tune.lob.view
	const disc = own(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2))
	const ring = own(new THREE.RingGeometry(1 - v.ringWidth, 1, 48).rotateX(-Math.PI / 2))
	const ball = own(new THREE.SphereGeometry(1, 12, 8))
	const seam = own(new THREE.TorusGeometry(1.01, 0.08, 4, 16))
	const live = new Map()
	let last = -Infinity
	const mesh = (rig, geometry, material) => {
		const object = new THREE.Mesh(geometry, material)
		rig.root.add(object)
		return object
	}
	function wash(rig, geometry, color, opacity) {
		const material = glowMaterial(color, opacity)
		rig.materials.push(material)
		const object = mesh(rig, geometry, material)
		object.layers.set(FORWARD_LAYER)
		return object
	}
	function remove(id, rig) {
		group.remove(rig.root)
		for (const m of rig.materials) m.dispose()
		live.delete(id)
	}
	return {
		update({ zones = [], groundFields = [], units = [], tick, alpha = 0 }) {
			const now = tick + alpha
			if (now < last) for (const [id, rig] of live) remove(id, rig)
			last = now
			const entries = [
				...zones.filter((z) => z.ability === 'lob').map((z) => ({ ...z, flight: true })),
				...groundFields
					.filter((f) => f.ability === 'lob' && f.until > now)
					.map((f) => ({ ...f, id: `field-${f.id}` })),
			]
			const ids = new Set(entries.map((e) => e.id))
			for (const [id, rig] of live) if (!ids.has(id)) remove(id, rig)
			for (const e of entries) {
				let rig = live.get(e.id)
				if (!rig) {
					rig = { root: new THREE.Group(), materials: [] }
					group.add(rig.root)
					rig.edge = mesh(rig, ring, teams[e.team])
					rig.edge.position.set(e.x, GROUND + 0.006, e.z)
					if (e.flight) {
						const owner = units.find((u) => u.id === e.owner)?.body.position
						rig.start = owner ? { x: owner.x, z: owner.z } : { x: e.x, z: e.z }
						rig.ball = mesh(rig, ball, cream)
						rig.seam = new THREE.Mesh(seam, teams[e.team])
						rig.ball.add(rig.seam)
						rig.shadow = wash(rig, disc, PALETTE.ink, 0.16)
						rig.shadow.position.set(e.x, GROUND + 0.002, e.z)
					} else {
						rig.floor = wash(rig, disc, PALETTE.terracotta, 0.14)
						rig.core = wash(rig, ring, PALETTE.ink, 0.28)
						rig.shock = wash(rig, ring, PALETTE.cream, 0.8)
						for (const [i, m] of [rig.floor, rig.core, rig.shock].entries())
							m.position.set(e.x, GROUND + 0.001 + i * 0.001, e.z)
					}
					live.set(e.id, rig)
				}
				const radius = e.flight ? tune.lob.radius : e.radius
				rig.edge.scale.setScalar(radius)
				if (e.flight) {
					const p = Math.max(0, Math.min(1, 1 - (e.left - alpha) / Math.max(1, e.total)))
					const up = Math.max(STEP, Math.min(1 - STEP, v.up))
					const rise = Math.min(1, p / up)
					const fall = Math.max(0, (p - up) / (1 - up))
					const height =
						p < up
							? 1 + (v.height - 1) * (1 - (1 - rise) ** 2)
							: v.ballRadius + (v.height - v.ballRadius) * (1 - fall ** 3)
					// Horizontal travel finishes over the mark just before the heavy descent.
					const across = 1 - (1 - p) ** 2
					rig.ball.position.set(
						rig.start.x + (e.x - rig.start.x) * across,
						height,
						rig.start.z + (e.z - rig.start.z) * across,
					)
					const stretch = 1 + 0.55 * fall ** 3
					rig.ball.scale.set(
						v.ballRadius / Math.sqrt(stretch),
						v.ballRadius * stretch,
						v.ballRadius / Math.sqrt(stretch),
					)
					rig.ball.rotation.z = p * Math.PI * 2
					rig.shadow.scale.setScalar(radius * (v.shadowFrom + (1 - v.shadowFrom) * fall ** 3))
				} else {
					const age = Math.max(0, (now - e.from) * STEP)
					const cool = Math.min(
						1,
						Math.max(0, (e.until - now) / Math.max(1, (e.until - e.from) * 0.2)),
					)
					rig.floor.scale.setScalar(radius)
					rig.floor.material.opacity = 0.14 * cool
					rig.core.scale.setScalar(radius * (0.55 + 0.04 * Math.sin(age * v.pulse)))
					rig.core.material.opacity = 0.28 * cool
					const shock = Math.min(1, age / Math.max(STEP, v.shockLife))
					rig.shock.visible = shock < 1
					rig.shock.scale.setScalar(radius * (0.65 + 0.35 * shock))
					rig.shock.material.opacity = 0.8 * (1 - shock)
				}
			}
		},
		dispose() {
			for (const [id, rig] of live) remove(id, rig)
			scene.remove(group)
			for (const resource of owned) resource.dispose()
		},
	}
}
