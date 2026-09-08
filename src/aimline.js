import * as THREE from 'three'
import { PALETTE } from './style.js'

// The live aim guide. It used to be a hairline THREE.Line, which is one pixel
// wide whatever the driver feels like and all but vanished when a pale ammo
// yellow crossed the green court. So the guide is printed like everything else
// here: a dashed ribbon with real world width, laid over an ink ribbon a touch
// wider that acts as its outline.
//
// The path is always planar — the sampled points share one horizontal heading —
// so widening it is just an offset along the horizontal perpendicular of that
// heading. Seen from the game's high camera that reads as a flat painted band,
// on the floor and through the top of an arc alike.
const DASH_PERIOD = 3 // samples per dash cycle...
const DASH_ON = 2 // ...of which this many are drawn

export function createAimLine(scene, { samples = 32, width = 0.08, outline = 0.03 } = {}) {
	const left = new THREE.Vector3()

	function ribbon(color, halfWidth, renderOrder) {
		const positions = new Float32Array(samples * 2 * 3)
		const geom = new THREE.BufferGeometry()
		geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
		const index = []
		for (let i = 0; i < samples - 1; i++) {
			if (i % DASH_PERIOD >= DASH_ON) continue // the gap between dashes
			const a = i * 2
			index.push(a, a + 1, a + 3, a, a + 3, a + 2)
		}
		geom.setIndex(index)
		const mesh = new THREE.Mesh(
			geom,
			new THREE.MeshBasicMaterial({
				color,
				side: THREE.DoubleSide,
				transparent: true, // also what routes it into the forward pass
				depthWrite: false, // the two ribbons are coplanar: order decides, not z
			}),
		)
		mesh.frustumCulled = false
		mesh.renderOrder = renderOrder
		mesh.visible = false
		scene.add(mesh)
		return { mesh, positions, halfWidth }
	}

	// Ink first, fill on top of it — the outline is simply a wider ribbon.
	const parts = [ribbon(PALETTE.ink, width / 2 + outline, 0), ribbon(PALETTE.ammo, width / 2, 1)]

	return {
		// `path` is `samples` xyz points; `dir` is their shared horizontal heading.
		update(path, dir, color) {
			left.set(-dir.z, 0, dir.x)
			for (const part of parts) {
				const { positions, halfWidth } = part
				for (let i = 0; i < samples; i++) {
					const x = path[i * 3]
					const y = path[i * 3 + 1]
					const z = path[i * 3 + 2]
					positions[i * 6] = x - left.x * halfWidth
					positions[i * 6 + 1] = y
					positions[i * 6 + 2] = z - left.z * halfWidth
					positions[i * 6 + 3] = x + left.x * halfWidth
					positions[i * 6 + 4] = y
					positions[i * 6 + 5] = z + left.z * halfWidth
				}
				part.mesh.geometry.attributes.position.needsUpdate = true
				part.mesh.visible = true
			}
			parts[1].mesh.material.color.set(color)
		},

		hide() {
			for (const part of parts) part.mesh.visible = false
		},

		dispose() {
			for (const part of parts) {
				scene.remove(part.mesh)
				part.mesh.geometry.dispose()
				part.mesh.material.dispose()
			}
		},
	}
}
