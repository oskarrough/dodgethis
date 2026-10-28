import * as THREE from 'three'
import { makeStyleMaterial } from '../../../../core/stylepass.js'
import { STEP } from '../../../../core/app.js'
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
	const material = (role) => own(makeStyleMaterial(role, { flat: true }))
	const team = { A: material('teamA'), B: material('teamB') }
	const cream = material('cream'),
		ink = material('ink'),
		enamel = material('seaTeal')
	const v = tune.sprinkler.view
	const stem = own(new THREE.CylinderGeometry(1, 1, 1, 8))
	const jet = own(new THREE.BufferGeometry())
	jet.setAttribute('position', new THREE.Float32BufferAttribute(9, 3))
	jet.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3))
	jet.setIndex([0, 2, 1])
	const ring = own(new THREE.RingGeometry(1 - v.ringWidth, 1, 48).rotateX(-Math.PI / 2))
	const bar = own(new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0, 0))
	const live = new Map()
	let last = -Infinity,
		lastPeriod = 0
	return {
		update({ summons = [], tick, alpha = 0 }) {
			const now = tick + alpha
			if (now < last) {
				group.clear()
				live.clear()
			}
			last = now
			const stats = tune.sprinkler,
				view = stats.view
			const period = Math.max(1, ticks(stats.sweep))
			// The sim sweeps this angular wedge each tick, including the target's body radius.
			// The blade itself reaches exactly radius; the perimeter is never animated inward.
			if (period !== lastPeriod) {
				const width = (Math.PI * 2) / period
				const vertices = jet.attributes.position
				vertices.setXYZ(0, 0, 0, 0)
				vertices.setXYZ(1, Math.cos(width), 0, -Math.sin(width))
				vertices.setXYZ(2, Math.cos(width), 0, Math.sin(width))
				vertices.needsUpdate = true
				jet.computeBoundingSphere()
				lastPeriod = period
			}
			const units = summons.filter((u) => u.key === 'sprinkler' && !u.dead && u.until > now)
			const ids = new Set(units.map((u) => u.id))
			for (const [id, rig] of live)
				if (!ids.has(id)) {
					group.remove(rig.root)
					live.delete(id)
				}
			for (const unit of units) {
				let rig = live.get(unit.id)
				if (!rig) {
					const root = new THREE.Group(),
						head = new THREE.Group()
					const body = new THREE.Mesh(stem, enamel),
						rim = new THREE.Mesh(stem, ink)
					const cap = new THREE.Mesh(stem, team[unit.team])
					const nozzle = new THREE.Mesh(bar, cream)
					const blade = new THREE.Group()
					const border = new THREE.Mesh(jet, ink),
						spray = new THREE.Mesh(jet, cream)
					blade.add(border, spray)
					const edge = new THREE.Mesh(ring, team[unit.team])
					const back = new THREE.Mesh(bar, ink),
						hp = new THREE.Mesh(bar, team[unit.team])
					head.add(body, rim, cap, nozzle)
					root.add(head, blade, edge, back, hp)
					group.add(root)
					rig = { root, head, body, rim, cap, nozzle, blade, spray, edge, back, hp }
					live.set(unit.id, rig)
				}
				const at = unit.body.position
				const elapsed = now - unit.from
				const phase = (elapsed % period) / period
				const age = elapsed * STEP
				const plant = Math.min(1, age / Math.max(STEP, view.plantTime))
				const bounce = Math.sin(plant * Math.PI) * (1 - plant)
				const pulse = Math.max(0, 1 - (phase * period * STEP) / Math.max(STEP, view.pulseTime))
				const height = view.height * (1 - bounce) + view.pulseHeight * pulse
				rig.root.position.set(at.x, 0, at.z)
				rig.head.rotation.y = -phase * Math.PI * 2
				rig.body.position.y = height / 2
				rig.body.scale.set(stats.bodyRadius, height, stats.bodyRadius)
				rig.rim.position.y = view.ground
				rig.rim.scale.set(stats.bodyRadius * 1.2, view.nozzle, stats.bodyRadius * 1.2)
				rig.cap.position.y = height
				rig.cap.scale.set(stats.bodyRadius, view.nozzle, stats.bodyRadius)
				rig.nozzle.position.y = height
				rig.nozzle.scale.set(stats.bodyRadius * 1.5, view.nozzle, view.nozzle)
				rig.edge.position.y = view.ground
				rig.edge.scale.setScalar(stats.radius)
				rig.blade.position.y = view.ground + view.layerGap
				rig.blade.rotation.y = -phase * Math.PI * 2
				rig.blade.scale.setScalar(stats.radius)
				rig.spray.position.y = view.layerGap / Math.max(0.01, stats.radius)
				rig.spray.scale.set(0.98, 1, 0.72)
				for (const mesh of [rig.back, rig.hp]) {
					mesh.position.set(-view.barWidth / 2, view.barHeight, 0)
					mesh.scale.set(view.barWidth, view.barDepth, view.barDepth)
				}
				rig.hp.position.z = view.barDepth
				rig.hp.scale.x *= Math.max(0, unit.hp / unit.maxHp)
			}
		},
		dispose() {
			scene.remove(group)
			group.clear()
			for (const o of owned) o.dispose()
			live.clear()
		},
	}
}
