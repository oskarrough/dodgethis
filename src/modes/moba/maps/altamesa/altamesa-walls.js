import * as THREE from 'three'
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js'
import { tune } from '../../tune.js'
import { flower } from './altamesa-stone.js'

// One sandstone draw and one moss draw for the whole map; print owns their disposal.
export function cover({ boxes, m, print, material }) {
	const c = tune.altamesa.walls
	const stone = []
	const moss = []
	let seed = 0
	const chance = () => {
		const n = Math.sin(++seed * 12.9898 + 4.1) * 43758.5453
		return n - Math.floor(n)
	}
	// Octagonal rings make broad, flat bevels. Unequal corner cuts take chips
	// out of the silhouette without rounding sandstone into cushions.
	const block = (width, height, depth) => {
		const bevel = Math.min(c.bevel, width / 4, height / 4, depth / 4)
		const cuts = Array.from({ length: 4 }, () => bevel + chance() * c.chip)
		const points = []
		for (const [y, inset] of [
			[-height / 2, bevel],
			[-height / 2 + bevel, 0],
			[height / 2 - bevel, 0],
			[height / 2, bevel],
		]) {
			const x = width / 2 - inset
			const z = depth / 2 - inset
			let corner = 0
			for (const [sx, sz] of [
				[1, 1],
				[-1, 1],
				[-1, -1],
				[1, -1],
			]) {
				const cut = Math.min(cuts[corner++], x / 2, z / 2)
				points.push(new THREE.Vector3(sx * (x - cut), y, sz * z))
				points.push(new THREE.Vector3(sx * x, y, sz * (z - cut)))
			}
		}
		return new ConvexGeometry(points)
	}
	for (const b of boxes) {
		const h = Math.min(b.kind === 'hedge' ? m.hedgeHeight : m.wallHeight, m.wallHeight)
		const top = h - c.mossHeight
		const foot = Math.min(c.footHeight, h / 6)
		const cap = Math.min(c.capHeight, h / 5)
		const faceHeight = top - foot - cap
		const width = b.halfX * 2
		const depth = b.halfZ * 2
		const nx = Math.max(1, Math.ceil(width / c.blockWidth))
		const nz = Math.max(1, Math.ceil(depth / c.blockWidth))
		const dx = width / nx
		const dz = depth / nz
		// Clamp after orienting: even a tuned petal or lichen tip cannot cross the collider.
		const put = (geometry, batch = stone) => {
			if (geometry.index) {
				const indexed = geometry
				geometry = indexed.toNonIndexed()
				indexed.dispose()
			}
			geometry.deleteAttribute('uv')
			const p = geometry.attributes.position
			for (let i = 0; i < p.count; i++)
				p.setXYZ(
					i,
					b.x + THREE.MathUtils.clamp(p.getX(i), -b.halfX, b.halfX),
					THREE.MathUtils.clamp(p.getY(i), 0, h),
					b.z + THREE.MathUtils.clamp(p.getZ(i), -b.halfZ, b.halfZ),
				)
			geometry.computeVertexNormals()
			batch.push(geometry)
		}
		for (let ix = 0; ix < nx; ix++) {
			for (let iz = 0; iz < nz; iz++) {
				const x = -b.halfX + (ix + 0.5) * dx
				const z = -b.halfZ + (iz + 0.5) * dz
				const left = ix === 0 ? c.faceInset : c.joint / 2
				const right = ix === nx - 1 ? c.faceInset : c.joint / 2
				const back = iz === 0 ? c.faceInset : c.joint / 2
				const front = iz === nz - 1 ? c.faceInset : c.joint / 2
				put(block(dx - c.joint, foot - c.joint, dz - c.joint).translate(x, foot / 2, z))
				put(
					block(dx - left - right, faceHeight - c.joint, dz - back - front).translate(
						x + (left - right) / 2,
						foot + faceHeight / 2,
						z + (back - front) / 2,
					),
				)
				put(block(dx - c.joint, cap / 2 - c.joint, dz - c.joint).translate(x, top - cap * 0.75, z))
				put(block(dx - c.capStep * 2, cap / 2, dz - c.capStep * 2).translate(x, top - cap / 4, z))
				if (chance() < c.mossChance) {
					const reach = Math.min(c.mossReach, dx / 2, dz / 2)
					for (let lobe = 0; lobe < c.mossLobes; lobe++) {
						const angle = (lobe * Math.PI * 2) / c.mossLobes
						const radius = reach * (0.5 + chance() / 2)
						put(
							new THREE.IcosahedronGeometry(1, 1)
								.scale(radius, c.mossHeight, radius)
								.translate(
									x + (Math.cos(angle) * reach) / 2,
									top,
									z + (Math.sin(angle) * reach) / 2,
								),
							moss,
						)
					}
					// Broad hanging lobes join the top patch; the flower below stays exposed.
					for (const [edge, alongX, sign] of [
						[iz === 0, true, -1],
						[iz === nz - 1, true, 1],
						[ix === 0, false, -1],
						[ix === nx - 1, false, 1],
					]) {
						if (!edge) continue
						const curtain = new THREE.IcosahedronGeometry(1, 1)
							.scale(reach, c.mossDrop, c.faceInset)
							.translate(
								alongX ? x : -z,
								top - c.mossDrop / 2,
								sign * ((alongX ? depth : width) / 2 - c.faceInset),
							)
						if (!alongX) curtain.rotateY(Math.PI / 2)
						put(curtain, moss)
					}
				}
			}
		}
		// The same square relief on all four faces, including the kiln block and wall ends.
		for (const [alongX, sign] of [
			[true, -1],
			[true, 1],
			[false, -1],
			[false, 1],
		]) {
			const count = alongX ? nx : nz
			const span = alongX ? dx : dz
			const length = alongX ? width : depth
			const face = (alongX ? depth : width) / 2 - c.faceInset
			const size = Math.min(faceHeight, span) - c.panelGap * 2
			const border = Math.min(c.panelBorder, size / 8)
			const radius = (size - border * 2) * c.flowerRadius
			for (let i = 0; i < count; i++) {
				const u = -length / 2 + (i + 0.5) * span
				const v = foot + faceHeight / 2
				const relief = (geometry) => {
					geometry.translate(u, v, face)
					if (sign < 0) geometry.rotateY(Math.PI)
					if (!alongX) geometry.rotateY(Math.PI / 2)
					put(geometry)
				}
				// A raised square rim leaves the flower's field recessed in the block.
				for (const side of [-1, 1]) {
					relief(
						block(size, border, c.relief).translate(0, (side * (size - border)) / 2, c.relief / 2),
					)
					relief(
						block(border, size - border * 2, c.relief).translate(
							(side * (size - border)) / 2,
							0,
							c.relief / 2,
						),
					)
				}
				relief(flower(radius, c.relief))
				relief(
					new THREE.CylinderGeometry(
						radius * c.flowerHeart,
						radius * c.flowerHeart * 2,
						c.relief,
						c.petals,
					)
						.rotateX(Math.PI / 2)
						.translate(0, 0, c.relief / 2),
				)
			}
		}
	}
	print(stone, material('courtShade'), 'altamesa-carved-sandstone')
	print(moss, material('court'), 'altamesa-wall-moss')
}
