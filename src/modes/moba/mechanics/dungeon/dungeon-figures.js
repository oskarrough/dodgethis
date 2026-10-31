import * as THREE from 'three'
import { makeStyleMaterial } from '../../../../core/stylepass.js'

// One sculpted body for the living Warden and its fallen remains. All parts are owned here;
// neither a collapse nor a cold kiln recolours a shared material.
export function wardenFigure(id) {
	const root = new THREE.Group()
	const owned = []
	const materials = new Map()
	function material(role) {
		if (!materials.has(role)) materials.set(role, makeStyleMaterial(role))
		return materials.get(role)
	}
	function part(geometry, role, x = 0, y = 0, z = 0) {
		owned.push(geometry)
		const mesh = new THREE.Mesh(geometry, material(role))
		mesh.position.set(x, y, z)
		root.add(mesh)
		return mesh
	}
	const box = (x, y, z, role, px = 0, py = y / 2, pz = 0) =>
		part(new THREE.BoxGeometry(x, y, z), role, px, py, pz)
	const drum = (top, bottom, height, role, x = 0, y = height / 2, z = 0) =>
		part(new THREE.CylinderGeometry(top, bottom, height, 8), role, x, y, z)
	const faces = []
	if (id === 'manos') {
		box(2.1, 1.7, 0.65, 'terracotta', 0, 1.3)
		for (let i = 0; i < 4; i++)
			box(0.42, 1.6 - Math.abs(i - 1.5) * 0.3, 0.6, 'terracotta', (i - 1.5) * 0.53, 2.5)
		box(0.6, 1.25, 0.65, 'terracotta', -1.2, 1.1).rotation.z = -0.65
		box(1.1, 0.12, 0.06, 'ink', 0, 1.4, 0.36)
	} else if (id === 'barquero') {
		box(3.6, 0.45, 1.7, 'scenery')
		for (const x of [-1.8, 1.8]) box(0.45, 0.8, 1.7, 'sand', x, 0.6).rotation.z = -x * 0.18
		drum(0.28, 0.7, 1.8, 'enamelViolet', 0, 1.35)
		drum(0.55, 0.55, 0.2, 'sand', 0, 2.3)
		box(0.12, 3.8, 0.12, 'driftwood', 1.15, 2).rotation.z = -0.2
	} else if (id === 'carillon') {
		drum(0.65, 1.3, 2.2, 'driftwood', 0, 1.65)
		drum(1.5, 1.5, 0.3, 'sand', 0, 0.7)
		drum(0.25, 0.25, 0.5, 'ink', 0, 0.4)
		part(new THREE.TorusGeometry(0.32, 0.12, 4, 8), 'sand', 0, 3)
		faces.push(box(0.13, 1.5, 0.05, 'ink', 0.5, 1.8, 0.9))
	} else if (id === 'fornax') {
		box(2.3, 2.4, 1.9, 'terracotta')
		drum(0.55, 0.7, 0.9, 'driftwood', 0, 2.75)
		box(1.7, 1.4, 0.08, 'ink', 0, 1, 1)
		faces.push(box(1.35, 0.75, 0.09, 'sand', 0, 0.85, 1.06))
		for (const x of [-0.5, 0, 0.5]) box(0.12, 1.3, 0.12, 'ink', x, 1, 1.15)
	} else if (id === 'espejo') {
		box(2.1, 3.2, 0.45, 'enamelViolet')
		faces.push(box(1.65, 2.7, 0.08, 'cream', 0, 1.7, 0.27))
		box(0.09, 2.6, 0.1, 'scenery', 0.15, 1.7, 0.34).rotation.z = -0.3
		box(2.6, 0.35, 1.1, 'scenery')
	} else if (id === 'gnomon') {
		drum(1.1, 1.35, 0.45, 'sand')
		const needle = new THREE.ConeGeometry(0.8, 3.8, 3)
		part(needle, 'enamelViolet', 0, 2.2).rotation.y = Math.PI / 2
		box(0.12, 2.8, 0.15, 'cream', 0, 1.9, 0.45).rotation.z = -0.1
	} else {
		const thin = id === 'botijo'
		for (let i = 0; i < 3; i++)
			part(
				new THREE.CylinderGeometry(
					thin ? 0.5 : 0.9,
					thin ? 0.75 : 1.3,
					thin ? 2.3 : 1.7,
					4,
					1,
					false,
					(i * Math.PI * 2) / 3,
					(Math.PI * 2) / 3 - 0.04,
				),
				'terracotta',
				0,
				thin ? 1.15 : 0.85,
			)
		drum(thin ? 0.4 : 0.85, thin ? 0.4 : 0.85, 0.24, 'sand', 0, thin ? 2.4 : 1.85)
		drum(thin ? 0.27 : 0.65, thin ? 0.27 : 0.65, 0.04, 'ink', 0, thin ? 2.54 : 1.99)
		if (thin) {
			part(new THREE.CylinderGeometry(0.18, 0.3, 1, 6), 'sand', 0.75, 1.8).rotation.z = -0.8
			part(new THREE.TorusGeometry(0.46, 0.15, 4, 8), 'terracotta', -0.65, 1.8)
		}
	}
	const pieces = root.children.map((mesh) => ({ mesh, at: mesh.position.clone() }))
	root.name = `warden-figure-${id}`
	return {
		root,
		breakApart(progress) {
			if (!['tinaja', 'botijo', 'espejo'].includes(id)) return
			pieces.forEach(({ mesh, at }, i) => {
				mesh.position.copy(at)
				mesh.position.x += Math.cos(i * 2.4) * progress * 0.65
				mesh.position.z += Math.sin(i * 2.4) * progress * 0.45
			})
		},
		cold() {
			for (const face of faces) face.material = material('ink')
		},
		dispose() {
			root.removeFromParent()
			for (const geometry of owned) geometry.dispose()
			for (const mat of materials.values()) mat.dispose()
		},
	}
}
