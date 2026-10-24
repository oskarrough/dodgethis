import * as THREE from 'three'
import { STEP } from '../../../../core/app.js'
import { makeStyleMaterial } from '../../../../core/stylepass.js'
import { tune } from '../../tune.js'

// Lob draws its own zone: skills-view leaves zones of an ability with `drawsZone` alone.
export const drawsZone = true

const GROUND = tune.map.printLayers.seams + 0.005

// The ball climbs out of Carambola's hand and drops on the mark while its shadow swells there.
// On landing the mark turns to hot ground for the field's life: a shock ring, a pulsing core, embers.
export function extras(scene) {
	const group = new THREE.Group()
	scene.add(group)
	const owned = []
	const own = (o) => {
		owned.push(o)
		return o
	}
	const material = (role) => own(makeStyleMaterial(role, { flat: true }))
	const ink = material('ink'),
		cream = material('cream'),
		gold = material('ammo'),
		hot = material('portalSpicy'),
		rim = material('terracotta')
	const v = tune.lob.view
	const disc = own(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2))
	const ring = own(new THREE.RingGeometry(1 - v.ringWidth, 1, 48).rotateX(-Math.PI / 2))
	const ball = own(new THREE.SphereGeometry(1, 14, 10))
	const ember = own(new THREE.BoxGeometry(1, 1, 1))
	const mesh = (geometry, mat) => {
		const m = new THREE.Mesh(geometry, mat)
		group.add(m)
		return m
	}
	const flights = new Map() // zone id → the ball in the air and its shadow
	const patches = new Map() // field id → hot ground, owned by the presented state
	let last = -Infinity

	function land(field) {
		const p = {
			x: field.x,
			z: field.z,
			start: field.from,
			radius: field.radius,
			shock: mesh(ring, cream),
			floor: mesh(disc, hot),
			core: mesh(disc, gold),
			edge: mesh(ring, rim),
			embers: Array.from({ length: v.embers }, () => mesh(ember, cream)),
		}
		p.floor.position.set(p.x, GROUND + 0.001, p.z)
		p.core.position.set(p.x, GROUND + 0.002, p.z)
		p.edge.position.set(p.x, GROUND + 0.003, p.z)
		p.shock.position.set(p.x, GROUND + 0.004, p.z)
		patches.set(field.id, p)
	}
	function clear() {
		for (const f of flights.values()) group.remove(f.ball, f.shadow, f.mark)
		flights.clear()
		for (const p of patches.values()) group.remove(p.shock, p.floor, p.core, p.edge, ...p.embers)
		patches.clear()
	}

	return {
		update({ zones = [], groundFields = [], units = [], tick, alpha = 0 }) {
			if (tick < last) clear() // a replay seek or a reset
			last = tick
			const live = zones.filter((z) => z.ability === 'lob')
			const ids = new Set(live.map((z) => z.id))
			for (const [id, f] of flights)
				if (!ids.has(id)) {
					flights.delete(id)
					group.remove(f.ball, f.shadow, f.mark)
				}
			const stats = tune.lob
			for (const z of live) {
				let f = flights.get(z.id)
				if (!f) {
					const owner = units.find((u) => u.id === z.owner)?.body.position
					f = {
						x: z.x,
						z: z.z,
						from: owner ? { x: owner.x, z: owner.z } : { x: z.x, z: z.z },
						ball: mesh(ball, gold),
						shadow: mesh(disc, ink),
						mark: mesh(ring, ink),
					}
					flights.set(z.id, f)
				}
				const progress = Math.max(0, Math.min(1, 1 - (z.left - alpha) / Math.max(1, z.total)))
				f.mark.position.set(f.x, GROUND + 0.003, f.z)
				f.mark.scale.setScalar(stats.radius)
				// The shadow tracks the falling ball: small while it's high, the whole mark at the bottom.
				f.shadow.position.set(f.x, GROUND + 0.002, f.z)
				f.shadow.scale.setScalar(stats.radius * (v.shadowFrom + (1 - v.shadowFrom) * progress ** 2))
				f.ball.scale.setScalar(v.ballRadius)
				if (progress < v.up) {
					const rise = progress / v.up
					f.ball.position.set(f.from.x, 1 + (v.height - 1) * (1 - (1 - rise) ** 2), f.from.z)
				} else {
					const fall = (progress - v.up) / (1 - v.up)
					f.ball.position.set(f.x, v.height * (1 - fall ** 2), f.z)
				}
			}
			const fields = groundFields.filter(
				(field) => field.ability === 'lob' && field.until > tick + alpha,
			)
			const fieldIds = new Set(fields.map((field) => field.id))
			for (const [id, p] of patches)
				if (!fieldIds.has(id)) {
					group.remove(p.shock, p.floor, p.core, p.edge, ...p.embers)
					patches.delete(id)
				}
			const time = (tick + alpha) * STEP
			for (const field of fields) {
				if (!patches.has(field.id)) land(field)
				const p = patches.get(field.id)
				const age = (tick + alpha - field.from) * STEP
				const life = (field.until - field.from) * STEP
				// Cools in the last fifth: the patch shrinks back to nothing.
				const cool = Math.min(1, (life - age) / (life * 0.2))
				const shock = Math.min(1, age / v.shockLife)
				p.shock.visible = shock < 1
				p.shock.scale.setScalar(p.radius * (1 + v.shockGrow * (1 - (1 - shock) ** 3)))
				p.floor.scale.setScalar(p.radius * cool)
				p.edge.scale.setScalar(p.radius * cool)
				p.core.scale.setScalar(p.radius * cool * (0.45 + 0.12 * Math.sin(time * v.pulse)))
				for (const [k, e] of p.embers.entries()) {
					const phase = (age / v.emberLife + k / v.embers) % 1
					const angle = k * 2.39996 + p.start
					const reach = p.radius * 0.8 * Math.sqrt((k + 0.5) / v.embers) * cool
					e.position.set(
						p.x + Math.cos(angle) * reach,
						GROUND + phase * v.emberRise,
						p.z + Math.sin(angle) * reach,
					)
					e.scale.setScalar(v.emberSize * (1 - phase) * cool)
				}
			}
		},
		dispose() {
			clear()
			scene.remove(group)
			for (const o of owned) o.dispose()
		},
	}
}
