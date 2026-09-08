import * as THREE from 'three'
import { makeStyleMaterial } from './stylepass.js'
import { onCourt } from './arena.js'

// Pooled printed discs restore height cues without shadow-map cost or per-round allocation.

const POOL = 512
const LIFT = 0.014 // above the court line, below the ammo marker

export function createShadows(scene) {
	const geometry = new THREE.CircleGeometry(1, 18)
	const material = makeStyleMaterial('courtShade', { flat: true })
	const discs = new THREE.InstancedMesh(geometry, material, POOL)
	discs.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
	discs.frustumCulled = false // bounds change with the live roster
	discs.count = 0
	discs.visible = false
	scene.add(discs)
	const pose = new THREE.Object3D()
	pose.rotation.x = -Math.PI / 2

	let used = 0
	function cast(x, y, z, radius) {
		if (used >= POOL || !onCourt(x, z)) return // nothing to fall on out over the void
		// Shrink with height so high shots still read when caster and shadow overlap.
		const shrink = 1 - Math.min(Math.max(y, 0) / 8, 1) * 0.35
		pose.position.set(x, LIFT, z)
		pose.scale.setScalar(Math.max(0.05, radius * shrink))
		pose.updateMatrix()
		discs.setMatrixAt(used++, pose.matrix)
	}

	// Called once per frame with the live round (or null in an empty scene).
	function update(round) {
		used = 0
		if (round) {
			for (const unit of round.units) {
				if (!unit.alive) continue
				const p = unit.position
				cast(p.x, p.y - 1, p.z, 0.46)
			}
			for (const arrow of round.arrows) {
				if (arrow.state !== 'flying') continue
				const p = arrow.position
				cast(p.x, p.y, p.z, arrow.kind === 'bowl' ? 0.5 : 0.2)
			}
		}
		discs.count = used
		discs.visible = used > 0
		if (used) discs.instanceMatrix.needsUpdate = true
	}

	function dispose() {
		scene.remove(discs)
		discs.dispose()
		geometry.dispose()
		material.dispose()
	}

	return { update, dispose }
}
