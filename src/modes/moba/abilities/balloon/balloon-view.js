import * as THREE from 'three'
import { makeStyleMaterial } from '../../../../core/stylepass.js'
import { tune } from '../../tune.js'
import { ticks } from '../../sim-kit.js'

export function extras(scene) {
	const group = new THREE.Group()
	scene.add(group)
	const owned = []
	const own = (o) => {
		owned.push(o)
		return o
	}
	const materials = {
		A: own(makeStyleMaterial('teamA', { flat: true })),
		B: own(makeStyleMaterial('teamB', { flat: true })),
		cream: own(makeStyleMaterial('cream', { flat: true })),
	}
	const ring = own(
		new THREE.RingGeometry(1 - tune.balloon.view.ringWidth, 1, 48).rotateX(-Math.PI / 2),
	)
	const ball = own(new THREE.SphereGeometry(1, 12, 8))
	const live = new Map()
	return {
		update({ summons, tick, alpha }) {
			const units = summons.filter((u) => u.key === 'balloon' && !u.dead)
			const ids = new Set(units.map((u) => u.id))
			for (const [id, rig] of live)
				if (!ids.has(id)) {
					group.remove(rig.root)
					live.delete(id)
				}
			for (const unit of units) {
				let rig = live.get(unit.id)
				if (!rig) {
					const root = new THREE.Group()
					const edge = new THREE.Mesh(ring, materials[unit.team])
					const orb = new THREE.Mesh(ball, materials.cream)
					const ripple = new THREE.Mesh(ring, materials[unit.team])
					root.add(edge, orb, ripple)
					group.add(root)
					rig = { root, edge, orb, ripple }
					live.set(unit.id, rig)
				}
				const stats = tune.balloon,
					v = stats.view
				const flight = unit.data.phase === 'flight'
				const { start, target, popAt } = unit.data
				const popFraction =
					popAt == null
						? 1
						: Math.max(0, Math.min(1, (popAt - unit.from) / Math.max(1, ticks(stats.flight))))
				const at = flight
					? {
							x: start.x + (target.x - start.x) * popFraction,
							z: start.z + (target.z - start.z) * popFraction,
						}
					: unit.body.position
				rig.edge.position.set(at.x, v.ground, at.z)
				rig.edge.scale.setScalar(stats.radius)
				rig.ripple.visible = !flight
				rig.ripple.position.set(at.x, v.ground + v.ringWidth, at.z)
				rig.ripple.scale.setScalar(stats.radius * v.rippleSize)
				rig.orb.visible = flight
				if (flight) {
					const fraction = Math.max(
						0,
						Math.min(1, (tick + alpha - unit.from) / Math.max(1, ticks(stats.flight))),
					)
					rig.orb.position.set(
						start.x + (target.x - start.x) * fraction,
						v.ground + v.height * 4 * fraction * (1 - fraction),
						start.z + (target.z - start.z) * fraction,
					)
					rig.orb.scale.setScalar(v.ballRadius)
				}
			}
		},
		dispose() {
			scene.remove(group)
			for (const o of owned) o.dispose()
			live.clear()
		},
	}
}
