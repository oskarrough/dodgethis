import * as THREE from 'three'
import { FORWARD_LAYER } from '../../core/stylepass.js'
import { PALETTE } from '../../core/style.js'
import { tune } from './tune.js'

// Each team's base zone (base.js) printed on the ground: a faint wash in the team colour from the base line
// to the map's end, and a firmer line along its edge. Only your own team's zone keeps you safe.
export function createBaseView(scene, layout) {
	const owned = []
	const group = new THREE.Group()
	group.name = 'moba-base-zones'
	const { halfX, halfZ } = layout.bounds
	for (const [team, base] of Object.entries(layout.bases ?? {})) {
		const sign = team === 'A' ? -1 : 1
		const depth = halfX - Math.abs(base.x)
		if (depth <= 0) continue
		const color = team === 'A' ? PALETTE.teamA : PALETTE.teamB
		const print = (opacity) => {
			const material = new THREE.MeshBasicMaterial({
				color,
				transparent: true,
				opacity,
				depthWrite: false,
				polygonOffset: true,
				polygonOffsetFactor: -1,
			})
			owned.push(material)
			return material
		}
		const wash = new THREE.PlaneGeometry(depth, halfZ * 2)
			.rotateX(-Math.PI / 2)
			.translate(base.x + (sign * depth) / 2, tune.base.printY, 0)
		const edge = new THREE.PlaneGeometry(tune.base.edge, halfZ * 2)
			.rotateX(-Math.PI / 2)
			.translate(base.x + (sign * tune.base.edge) / 2, tune.base.printY, 0)
		owned.push(wash, edge)
		for (const [geometry, opacity] of [
			[wash, tune.base.fill],
			[edge, tune.base.line],
		]) {
			const mesh = new THREE.Mesh(geometry, print(opacity))
			mesh.name = `moba-base-${team}`
			mesh.layers.set(FORWARD_LAYER)
			mesh.renderOrder = -3
			group.add(mesh)
		}
	}
	scene.add(group)
	return {
		dispose() {
			group.removeFromParent()
			for (const o of owned) o.dispose()
		},
	}
}
