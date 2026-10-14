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
	const material = (role) => own(makeStyleMaterial(role, { flat: true }))
	const team = { A: material('teamA'), B: material('teamB') }
	const cream = material('cream'),
		ink = material('ink')
	const v = tune.sprinkler.view
	const stem = own(new THREE.CylinderGeometry(1, 1, 1, 12))
	const jet = own(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0))
	const ring = own(new THREE.RingGeometry(1 - v.ringWidth, 1, 48).rotateX(-Math.PI / 2))
	const bar = own(new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0, 0))
	const live = new Map()
	return {
		update({ summons, tick, alpha }) {
			const units = summons.filter((u) => u.key === 'sprinkler' && !u.dead)
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
					const body = new THREE.Mesh(stem, team[unit.team])
					const spray = new THREE.Mesh(jet, cream)
					const edge = new THREE.Mesh(ring, team[unit.team])
					const back = new THREE.Mesh(bar, ink),
						hp = new THREE.Mesh(bar, team[unit.team])
					root.add(body, spray, edge, back, hp)
					group.add(root)
					rig = { root, body, spray, edge, back, hp }
					live.set(unit.id, rig)
				}
				const stats = tune.sprinkler,
					view = stats.view
				const at = unit.body.position
				rig.root.position.set(at.x, 0, at.z)
				rig.body.position.y = view.height / 2
				rig.body.scale.set(stats.bodyRadius, view.height, stats.bodyRadius)
				rig.edge.position.y = view.ground
				rig.edge.scale.setScalar(stats.radius)
				rig.spray.position.y = view.ground + view.ringWidth
				rig.spray.scale.set(stats.radius, 1, view.nozzle)
				rig.spray.rotation.y =
					(-(tick + alpha - unit.from) / Math.max(1, ticks(stats.sweep))) * Math.PI * 2
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
			for (const o of owned) o.dispose()
			live.clear()
		},
	}
}
