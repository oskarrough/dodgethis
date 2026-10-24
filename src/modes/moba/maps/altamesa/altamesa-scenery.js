import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { makeStyleMaterial } from '../../../../core/stylepass.js'

// The crowded rim (pages/art/altamesa-targets, the ink frame): broken sandstone ruins on the
// cliff's ledges, dead trees leaning out over the drop and bleached bones, all outside the torn
// rim so nothing touches the court. Drawn through the ink pass like cover, so it gets the same
// outline and sun bands: sandstone in courtShade, lichen in court (moss), dead wood in ink.
export function scenery({ s, own, forward, outward, count, rand, rings, points }) {
	const r = s.rim
	if (!r) return
	const parts = { ruin: [], wood: [], bone: [], moss: [] }
	const roles = { ruin: 'courtShade', wood: 'ink', bone: 'cream', moss: 'court' }

	// A spot `out` metres past rim point i, `drop` metres down, following the cliff's flare.
	const ledge = (i, out, drop) => {
		let k = 1
		while (k < rings.length - 1 && rings[k].drop < drop) k++
		const p = points[k][i]
		return new THREE.Vector3(p.x + outward[i].x * out, s.groundY - drop, p.z + outward[i].z * out)
	}

	// A ruin: a stack of chipped sandstone blocks, the top course broken off.
	const ruin = (at, facing, size) => {
		// The ledge it stands on: a broad flat shelf jutting from the face.
		parts.ruin.push(
			new THREE.CylinderGeometry(size * 1.3, size * 0.9, size * 0.8, 6)
				.scale(1.2, 1, 0.9)
				.translate(0, -size * 0.4, -size * 0.3)
				.rotateY(-facing + Math.PI / 2)
				.translate(at.x, at.y, at.z),
		)
		const courses = 1 + Math.floor(rand() * r.ruinCourses)
		let y = 0
		for (let k = 0; k < courses; k++) {
			const w = size * (0.7 + rand() * 0.6),
				h = size * (0.45 + rand() * 0.3)
			const span = k === courses - 1 ? w * (0.4 + rand() * 0.6) : w
			parts.ruin.push(
				new THREE.BoxGeometry(span, h, size * 0.8)
					.rotateZ((rand() - 0.5) * 0.12 * k)
					.translate((rand() - 0.5) * size * 0.2, y + h / 2, 0)
					.rotateY(-facing + Math.PI / 2 + (rand() - 0.5) * 0.4)
					.translate(at.x, at.y, at.z),
			)
			y += h
		}
		// Lichen in clumps on the ruin's top and spilling down one side.
		for (let k = 0; k < 2 + Math.floor(rand() * 3); k++)
			parts.moss.push(
				new THREE.IcosahedronGeometry(size * (0.18 + rand() * 0.2), 0)
					.scale(1.3, 0.55, 1.1)
					.translate(
						at.x + (rand() - 0.5) * size,
						at.y + y * (0.5 + rand() * 0.5),
						at.z + (rand() - 0.5) * size,
					),
			)
		// A fallen block at its foot.
		if (rand() < 0.6)
			parts.ruin.push(
				new THREE.BoxGeometry(size * 0.6, size * 0.4, size * 0.5)
					.rotateY(rand() * Math.PI)
					.rotateZ(0.3 + rand() * 0.4)
					.translate(
						at.x + (rand() - 0.5) * size * 1.6,
						at.y + size * 0.15,
						at.z + (rand() - 0.5) * size * 1.6,
					),
			)
	}

	// A dead tree: a leaning trunk that forks twice, every limb thinner and longer than wide.
	const tree = (at, lean) => {
		const limb = (from, dir, length, radius, depth) => {
			const to = from.clone().addScaledVector(dir, length)
			const g = new THREE.CylinderGeometry(radius * 0.6, radius, length, 5)
			g.translate(0, length / 2, 0)
			g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir))
			g.translate(from.x, from.y, from.z)
			parts.wood.push(g)
			if (depth <= 0) return
			for (let b = 0; b < 2 + (rand() < 0.3 ? 1 : 0); b++) {
				const next = dir
					.clone()
					.add(new THREE.Vector3((rand() - 0.5) * 1.4, rand() * 0.5, (rand() - 0.5) * 1.4))
					.normalize()
				limb(to, next, length * (0.55 + rand() * 0.2), radius * 0.6, depth - 1)
			}
		}
		const up = new THREE.Vector3(lean.x * 0.7, 1, lean.z * 0.7).normalize()
		limb(at, up, r.treeHeight * (0.7 + rand() * 0.6), r.treeHeight * 0.06, 3)
	}

	// Bones: a spine of vertebrae with a few ribs arching over it, half sunk in a ledge.
	const bones = (at, facing) => {
		const length = 3 + rand() * 3
		const ux = Math.cos(facing),
			uz = Math.sin(facing)
		for (let k = 0; k < 8; k++) {
			const t = k / 7 - 0.5
			const p = new THREE.Vector3(at.x + ux * t * length, at.y + 0.15, at.z + uz * t * length)
			parts.bone.push(new THREE.SphereGeometry(0.18, 5, 4).translate(p.x, p.y, p.z))
			if (k > 1 && k < 7)
				for (const side of [-1, 1])
					parts.bone.push(
						new THREE.TorusGeometry(0.7 - Math.abs(t) * 0.6, 0.06, 4, 8, Math.PI * 0.8)
							.rotateY(facing + Math.PI / 2)
							.rotateZ(side * 0.25)
							.translate(p.x, p.y, p.z),
					)
		}
	}

	for (let n = 0; n < count * r.density; n++) {
		const i = n % count
		const roll = rand()
		const facing = Math.atan2(outward[i].z, outward[i].x)
		const size = r.ruinSize * (0.6 + rand() * 0.8)
		if (roll < r.ruins)
			ruin(ledge(i, size * 0.6 + rand() * r.reach, 0.6 + rand() * r.depth), facing, size)
		else if (roll < r.ruins + r.trees)
			tree(ledge(i, 0.2 + rand() * 0.8, 0.3 + rand() * 1.2), outward[i])
		else if (roll < r.ruins + r.trees + r.bones) {
			const at = ledge(i, 1.5 + rand() * r.reach, 1 + rand() * r.depth)
			ruin(at, facing, 1.4)
			bones(at, facing + Math.PI / 2)
		}
	}

	for (const [name, list] of Object.entries(parts)) {
		if (!list.length) continue
		const merged = own(mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g))))
		for (const g of list) g.dispose()
		merged.computeVertexNormals()
		const mesh = forward(
			new THREE.Mesh(merged, own(makeStyleMaterial(roles[name]))),
			`altamesa-rim-${name}`,
		)
		mesh.layers.set(0)
	}
}
