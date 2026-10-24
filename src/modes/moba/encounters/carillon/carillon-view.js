import * as THREE from 'three'
import { makeStyleMaterial } from '../../../../core/stylepass.js'
import { tune } from '../../tune.js'

// A red ring where the toll will land while it is warned, and round Carillon the bell's rim, ink
// while the bronze is shut and blue while it lies cracked. Plain shapes; the look is Oskar's to give.
export function view(scene) {
	const g = () => tune.encounters.carillon
	const v = () => g().view
	const owned = []
	const root = new THREE.Group()
	scene.add(root)
	const material = (role) => {
		const m = makeStyleMaterial(role, { flat: true, side: THREE.DoubleSide })
		owned.push(m)
		return m
	}
	const y = () => tune.map.printLayers.seams + v().lift
	const ring = (r, mat) => {
		const geometry = new THREE.RingGeometry(r - v().rim, r, v().segments)
		owned.push(geometry)
		const m = new THREE.Mesh(geometry, mat)
		m.rotation.x = -Math.PI / 2
		root.add(m)
		return m
	}
	const toll = ring(g().toll.radius, material('teamB'))
	const shut = ring(v().bell, material('ink'))
	const cracked = ring(v().bell, material('teamA'))
	return {
		update(sim) {
			const fight = sim.dungeon?.encounters?.find((e) => e.id === 'carillon')
			root.visible = !!fight && !fight.killed && !fight.unit.dead
			if (!root.visible) return
			const { state, unit } = fight
			toll.visible = !!state.toll
			if (state.toll) toll.position.set(state.toll.x, y(), state.toll.z)
			const open = sim.tick < state.openUntil
			shut.visible = !open
			cracked.visible = open
			for (const m of [shut, cracked])
				m.position.set(unit.body.position.x, y(), unit.body.position.z)
		},
		dispose() {
			scene.remove(root)
			for (const o of owned) o.dispose()
		},
	}
}
