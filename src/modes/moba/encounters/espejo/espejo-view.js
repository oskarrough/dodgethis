import * as THREE from 'three'
import { makeStyleMaterial } from '../../../../core/stylepass.js'
import { tune } from '../../tune.js'
import { createMirror } from '../../mirror.js'

// Espejo's hall is a polished floor that mirrors the fight (mirror.js). On it, the mirror's face as a
// blue arc in front of Espejo, as wide as the cone that throws blows back, and an ink ring round it
// while it polishes.
export function view(scene, { renderer, renderStyled } = {}) {
	const g = () => tune.encounters.espejo
	const v = () => g().view
	const owned = []
	const root = new THREE.Group()
	scene.add(root)
	const material = (role) => {
		const m = makeStyleMaterial(role, { flat: true, side: THREE.DoubleSide })
		owned.push(m)
		return m
	}
	const cone = (g().cone * Math.PI) / 180
	// RingGeometry's angles run from +x toward −z once laid flat; the arc is centred on +z.
	const arcGeometry = new THREE.RingGeometry(
		v().reach - v().rim * 2,
		v().reach,
		v().segments,
		1,
		-Math.PI / 2 - cone / 2,
		cone,
	)
	const ringGeometry = new THREE.RingGeometry(v().reach - v().rim, v().reach, v().segments)
	owned.push(arcGeometry, ringGeometry)
	const pivot = new THREE.Group()
	root.add(pivot)
	const arc = new THREE.Mesh(arcGeometry, material('teamA'))
	arc.rotation.x = -Math.PI / 2
	pivot.add(arc)
	const ring = new THREE.Mesh(ringGeometry, material('ink'))
	ring.rotation.x = -Math.PI / 2
	root.add(ring)
	const y = () => tune.map.printLayers.seams + v().lift
	let floor = null
	let last = performance.now()
	return {
		update(sim, _blend, _local, _aim, camera) {
			const fight = sim.dungeon?.encounters?.find((e) => e.id === 'espejo')
			const now = performance.now()
			const dt = Math.min(0.1, (now - last) / 1000)
			last = now
			if (fight?.spot && !floor)
				floor = createMirror(scene, renderStyled, {
					...v().floor,
					x: fight.spot.x,
					z: fight.spot.z,
				})
			if (floor && camera && renderer) floor.update(dt, camera, renderer)
			root.visible = !!fight && !fight.killed && !fight.unit.dead && fight.state.phase === 'engaged'
			if (!root.visible) return
			const p = fight.unit.body.position
			const polishing = sim.tick < fight.state.polishUntil
			pivot.visible = !polishing
			ring.visible = polishing
			pivot.position.set(p.x, y(), p.z)
			pivot.rotation.y = fight.state.facing
			ring.position.set(p.x, y(), p.z)
		},
		dispose() {
			floor?.dispose()
			scene.remove(root)
			for (const o of owned) o.dispose()
		},
	}
}
