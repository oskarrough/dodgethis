import * as THREE from 'three'
import { flower } from './altamesa-stone.js'

export function pillars({ pillars, m, print, material }) {
	const stone = []
	for (const p of pillars) {
		const h = m.pillarHeight + m.capHeight
		const put = (g) => {
			if (g.index) {
				const indexed = g
				g = indexed.toNonIndexed()
				indexed.dispose()
			}
			g.deleteAttribute('uv')
			// Ornament, cap and base all fit the existing cylinder, including its height.
			const position = g.attributes.position
			for (let i = 0; i < position.count; i++) {
				const x = position.getX(i),
					z = position.getZ(i)
				const shrink = Math.min(1, p.r / (Math.hypot(x, z) || 1))
				position.setXYZ(
					i,
					p.x + x * shrink,
					THREE.MathUtils.clamp(position.getY(i), 0, h),
					p.z + z * shrink,
				)
			}
			g.computeVertexNormals()
			stone.push(g)
		}
		for (const [bottom, top, radius] of [
			[0, 0.14, 0.98],
			[0.15, 0.3, 0.88],
			[0.31, 0.73, 0.78],
			[0.74, 0.83, 0.88],
			[0.84, 0.94, 1],
			[0.94, 1, 0.88],
		]) {
			put(
				new THREE.CylinderGeometry(p.r * radius * 0.97, p.r * radius, h * (top - bottom), 8)
					.rotateY(Math.PI / 8)
					.translate(0, (h * (bottom + top)) / 2, 0),
			)
		}
		for (let side = 0; side < 8; side++) {
			const angle = (side * Math.PI) / 4
			put(
				flower(Math.min(p.r * 0.27, h * 0.18), p.r * 0.08)
					.translate(0, h * 0.52, p.r * 0.725)
					.rotateY(angle),
			)
		}
	}
	print(stone, material('courtShade'), 'altamesa-carved-pillars')
}
