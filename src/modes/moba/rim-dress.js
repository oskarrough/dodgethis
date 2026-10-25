import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { makeStyleMaterial } from '../../core/stylepass.js'
import {
	carvedBlock,
	brokenColumn,
	ruinStair,
	brokenArch,
	bleachedBones,
	ruinStack,
	deadTree,
	lichenClump,
} from './carve.js'

// Any isle's scenery hook can dress its rim. The map supplies proportions, carving and
// role names; the isle supplies its seeded stream, outline and resource lifetime.
export function dressRim(
	{ s, own, forward, outward, count, rand, rings, points },
	r,
	carving,
	roles,
	name,
) {
	if (!r) return
	const parts = { ruin: [], wood: [], bone: [], moss: [] }
	for (let n = 0; n < count * r.density; n++) {
		const i = n % count
		const roll = rand()
		if (roll >= r.ruins + r.trees + r.bones) continue
		const size = r.ruinSize * (0.8 + rand() * 0.6)
		const drop = 0.8 + rand() * r.depth + Math.floor(n / count) * 3
		let k = 1
		while (k < rings.length - 1 && rings[k].drop < drop) k++
		const normal = outward[i]
		const facing = Math.atan2(normal.x, normal.z)
		const rim = points[0][i]
		const out = size * 0.65 + rand() * r.reach
		const at = new THREE.Vector3(
			points[k][i].x + normal.x * out,
			s.groundY - drop,
			points[k][i].z + normal.z * out,
		)
		const put = (geometry, role = 'ruin') => {
			geometry.rotateY(facing).translate(at.x, at.y, at.z)
			const p = geometry.attributes.position
			for (let j = 0; j < p.count; j++) {
				const distance = (p.getX(j) - rim.x) * normal.x + (p.getZ(j) - rim.z) * normal.z
				if (distance < 0.15)
					p.setXYZ(
						j,
						p.getX(j) + normal.x * (0.15 - distance),
						p.getY(j),
						p.getZ(j) + normal.z * (0.15 - distance),
					)
			}
			parts[role].push(geometry)
		}
		put(ruinStack(size, r.strata, rand))
		// Patches lie on the lip and turn down its outward face, never float above a shelf.
		put(
			lichenClump(size * 0.43, r.lichen, rand).translate(-size * 0.25, 0.015, size * 0.15),
			'moss',
		)
		put(
			lichenClump(size * 0.38, r.lichen, rand)
				.rotateX(1.1)
				.translate(size * 0.45, -size * 0.4, size * 0.24),
			'moss',
		)
		if (roll < r.ruins) {
			const kind = n % 4
			put(
				kind === 0
					? carvedBlock(size, carving)
							.rotateX(-0.65)
							.rotateZ(0.22)
							.translate(0, size * 0.55, 0)
					: kind === 1
						? brokenColumn(size, r.ruinCourses, carving)
						: kind === 2
							? ruinStair(size)
							: brokenArch(size, carving),
			)
		} else if (roll < r.ruins + r.trees) put(deadTree(r.treeHeight, r.tree, rand), 'wood')
		else put(bleachedBones(size), 'bone')
	}
	for (const [role, list] of Object.entries(parts)) {
		if (!list.length) continue
		const geometry = own(mergeGeometries(list))
		for (const part of list) part.dispose()
		const mesh = forward(
			new THREE.Mesh(geometry, own(makeStyleMaterial(roles[role]))),
			`${name}-${role}`,
		)
		mesh.layers.set(0)
	}
}
