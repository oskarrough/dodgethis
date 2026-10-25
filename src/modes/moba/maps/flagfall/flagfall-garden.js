import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { glows, makeStyleMaterial } from '../../../../core/stylepass.js'

// The garden grows into the drop. All its vertices stay beyond the rim tangent;
// low near-side leaves cannot sit over a hero, while the far side makes a canopy.
export function nightGarden({ s, own, forward, outline, outward, count, rand }) {
	const g = s.garden
	const parts = { leaf: [], deep: [], petal: [], throat: [] }
	for (let slot = 0; slot < count * g.density; slot++) {
		if (rand() > g.chance) continue
		const i = Math.floor(slot / g.density),
			next = (i + 1) % count
		const t = (slot % g.density) / g.density
		const normal = new THREE.Vector3(outward[i].x, 0, outward[i].z)
		const rim = new THREE.Vector3(
			THREE.MathUtils.lerp(outline[i].x, outline[next].x, t),
			s.groundY,
			THREE.MathUtils.lerp(outline[i].z, outline[next].z, t),
		)
		const root = rim.clone().addScaledVector(normal, 0.3)
		root.y -= g.sink
		const north = normal.z < -0.5
		const high = north ? g.tall : g.low
		const facing = Math.atan2(normal.x, normal.z)
		const put = (geometry, role) => {
			if (geometry.index) {
				const indexed = geometry
				geometry = indexed.toNonIndexed()
				indexed.dispose()
			}
			geometry.deleteAttribute('uv')
			geometry.rotateY(facing).translate(root.x, root.y, root.z)
			const p = geometry.attributes.position
			for (let j = 0; j < p.count; j++) {
				const distance = (p.getX(j) - rim.x) * normal.x + (p.getZ(j) - rim.z) * normal.z
				if (distance < 0.12)
					p.setXYZ(
						j,
						p.getX(j) + normal.x * (0.12 - distance),
						p.getY(j),
						p.getZ(j) + normal.z * (0.12 - distance),
					)
			}
			parts[role].push(geometry)
		}
		for (let leaf = 0; leaf < g.leaves; leaf++) {
			const length = g.leaf[0] + rand() * (g.leaf[1] - g.leaf[0])
			const width = length * g.width
			const lift = high * (0.65 + rand() * 0.35)
			const base = [0, 0, 0],
				left = [-width * 0.5, lift * 0.3, length * 0.45]
			const ridge = [0, lift, length * 0.44],
				right = [width * 0.5, lift * 0.3, length * 0.45]
			const tip = [0, -g.sink * 0.5 + lift * 0.4, length]
			const geometry = new THREE.BufferGeometry()
			geometry.setAttribute(
				'position',
				new THREE.Float32BufferAttribute(
					[
						...base,
						...ridge,
						...left,
						...left,
						...ridge,
						...tip,
						...base,
						...right,
						...ridge,
						...ridge,
						...right,
						...tip,
					],
					3,
				),
			)
			geometry.computeVertexNormals()
			put(
				geometry.rotateY((leaf / (g.leaves - 1) - 0.5) * 2 + (rand() - 0.5) * 0.3),
				leaf % 3 ? 'deep' : 'leaf',
			)
		}
		for (let bell = 0; bell < g.bells; bell++) {
			const size = g.bell * (0.8 + rand() * 0.4)
			const x = (bell - (g.bells - 1) / 2) * 0.65
			const out = (g.leaf[1] + g.bell) * (0.85 + rand() * 0.15)
			const tip = new THREE.Vector3(x, high * 0.4, out)
			const bend = new THREE.Vector3(x * 0.3, high + size * 0.4, out * 0.5)
			put(
				new THREE.TubeGeometry(
					new THREE.CatmullRomCurve3([new THREE.Vector3(), bend, tip]),
					5,
					size * 0.055,
					4,
					false,
				),
				'deep',
			)
			const cup = new THREE.CylinderGeometry(size * 0.2, size, size * 1.35, 8, 2, true)
			const positions = cup.attributes.position
			for (let v = 0; v < positions.count; v++) {
				const y = positions.getY(v)
				if (y < 0) {
					const angle = Math.atan2(positions.getX(v), positions.getZ(v))
					positions.setY(v, y - Math.cos(angle * 4) * size * 0.18)
				}
			}
			cup.computeVertexNormals()
			// The hanging mouth turns toward the viewer and the drop, not into its own leaves.
			const mouth = new THREE.Vector3(0, 0.3, 1)
				.applyAxisAngle(new THREE.Vector3(0, 1, 0), -facing)
				.add(new THREE.Vector3(0, 0, 0.6))
				.normalize()
			const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), mouth)
			const centre = tip.clone().addScaledVector(mouth, size * 0.62)
			const throat = tip.clone().addScaledVector(mouth, size * 1.28)
			put(cup.applyQuaternion(turn).translate(centre.x, centre.y, centre.z), 'petal')
			put(
				new THREE.SphereGeometry(size * 0.48, 7, 5).translate(throat.x, throat.y, throat.z),
				'throat',
			)
			for (const sign of [-1, 1]) {
				const end = tip.clone().addScaledVector(mouth, size * 1.6)
				put(
					new THREE.CylinderGeometry(size * 0.065, size * 0.09, size * 0.65, 5)
						.rotateZ(sign * 0.28)
						.applyQuaternion(turn)
						.translate(end.x + sign * size * 0.18, end.y, end.z),
					'throat',
				)
			}
		}
	}
	for (const [role, list] of Object.entries(parts)) {
		if (!list.length) continue
		const geometry = own(mergeGeometries(list))
		for (const part of list) part.dispose()
		const material = own(
			role === 'throat'
				? new THREE.MeshBasicMaterial({ color: g.glow })
				: makeStyleMaterial(role === 'petal' ? 'bowl' : role === 'leaf' ? 'leaf' : 'court', {
						side: THREE.DoubleSide,
					}),
		)
		const mesh = forward(new THREE.Mesh(geometry, material), `flagfall-garden-${role}`)
		if (role === 'throat') {
			glows(mesh, g.bloom)
			own({ dispose: () => mesh.clear() })
		} else mesh.layers.set(0)
	}
}
