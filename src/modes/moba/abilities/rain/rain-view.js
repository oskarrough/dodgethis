import * as THREE from 'three'
import { makeStyleMaterial } from '../../../../core/stylepass.js'
import { tune } from '../../tune.js'

// Own only the team boundary; shared Rain still draws shafts, fill and landing residue.
export const drawsBoundary = true
export function extras(scene) {
	const group = new THREE.Group()
	scene.add(group)
	const ring = new THREE.RingGeometry(1 - tune.rain.view.ringWidth, 1, 48).rotateX(-Math.PI / 2)
	const materials = {
		A: makeStyleMaterial('teamA', { flat: true }),
		B: makeStyleMaterial('teamB', { flat: true }),
	}
	const marks = new Map()
	const live = new Set()
	let last = -Infinity
	function clear() {
		for (const mark of marks.values()) group.remove(mark)
		marks.clear()
	}
	return {
		update({ zones = [], tick, alpha = 0 }) {
			const now = tick + alpha
			if (now < last) clear()
			last = now
			live.clear()
			for (const zone of zones) {
				if (zone.ability !== 'rain') continue
				live.add(zone.id)
				let mark = marks.get(zone.id)
				if (!mark) {
					mark = new THREE.Mesh(ring, materials[zone.team])
					group.add(mark)
					marks.set(zone.id, mark)
				}
				mark.position.set(zone.x, tune.map.printLayers.seams + tune.rain.view.ground, zone.z)
				mark.scale.setScalar(tune.rain.radius)
			}
			for (const [id, mark] of marks)
				if (!live.has(id)) {
					group.remove(mark)
					marks.delete(id)
				}
		},
		dispose() {
			clear()
			ring.dispose()
			for (const material of Object.values(materials)) material.dispose()
			scene.remove(group)
		},
	}
}
