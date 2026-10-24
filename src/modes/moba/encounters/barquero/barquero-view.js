import * as THREE from 'three'
import { makeStyleMaterial } from '../../../../core/stylepass.js'
import { tune } from '../../tune.js'

// Tara as a clay pot in an ink ring that turns blue while it rolls, the road as a line of ink
// dots, and Barquero's landing as a blue ring at the road's end. Plain shapes; the look is
// Oskar's to give.
export function view(scene) {
	const g = () => tune.encounters.barquero
	const v = () => g().view
	const owned = []
	const root = new THREE.Group()
	scene.add(root)
	const material = (role) => {
		const m = makeStyleMaterial(role, { flat: true, side: THREE.DoubleSide })
		owned.push(m)
		return m
	}
	const ink = material('ink')
	const cool = material('teamA')
	const clay = material('teamB')
	const mesh = (geometry, mat) => {
		owned.push(geometry)
		const m = new THREE.Mesh(geometry, mat)
		root.add(m)
		return m
	}
	const y = () => tune.map.printLayers.seams + v().lift
	const flat = (m) => {
		m.rotation.x = -Math.PI / 2
		m.position.y = y()
		return m
	}
	const ringGeometry = (r) => new THREE.RingGeometry(r - v().rim, r, v().segments)
	const ring = flat(mesh(ringGeometry(g().ring), ink))
	const rolling = flat(mesh(ringGeometry(g().ring), cool))
	const pot = mesh(
		new THREE.CylinderGeometry(v().idol * 0.7, v().idol, v().idolHeight, v().segments),
		clay,
	)
	let built = null
	function build(fight) {
		const points = fight.road()
		const dot = new THREE.CircleGeometry(v().road, 12)
		owned.push(dot)
		for (let i = 1; i < points.length; i++) {
			const a = points[i - 1],
				b = points[i]
			const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z))
			for (let k = 0; k < n; k++) {
				const m = flat(new THREE.Mesh(dot, ink))
				m.position.x = a.x + ((b.x - a.x) * k) / n
				m.position.z = a.z + ((b.z - a.z) * k) / n
				root.add(m)
			}
		}
		const end = points.at(-1)
		const landing = flat(mesh(ringGeometry(v().landing), cool))
		landing.position.x = end.x
		landing.position.z = end.z
		return true
	}
	return {
		update(sim) {
			const fight = sim.dungeon?.encounters?.find((e) => e.id === 'barquero')
			root.visible = !!fight && !fight.killed
			if (!root.visible) return
			built ??= build(fight)
			const on = sim.tick < fight.state.rollsUntil
			ring.visible = !on
			rolling.visible = on
			for (const m of [ring, rolling]) m.position.set(fight.idol.x, y(), fight.idol.z)
			pot.position.set(fight.idol.x, v().idolHeight / 2, fight.idol.z)
		},
		dispose() {
			scene.remove(root)
			for (const o of owned) o.dispose()
		},
	}
}
