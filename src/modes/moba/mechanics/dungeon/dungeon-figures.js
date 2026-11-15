import * as THREE from 'three'
import { makeStyleMaterial } from '../../../../core/stylepass.js'

// One sculpted body for the living Warden and its fallen remains. All parts are owned here;
// neither a collapse nor a cold kiln recolours a shared material.
export function wardenFigure(id) {
	const root = new THREE.Group()
	const owned = []
	const materials = new Map()
	// `flat` prints a part unshaded: soot, a dark doorway, an eye.
	function material(role, flat = false) {
		const key = flat ? `${role}-flat` : role
		if (!materials.has(key)) materials.set(key, makeStyleMaterial(role, { flat }))
		return materials.get(key)
	}
	function part(geometry, role, x = 0, y = 0, z = 0, parent = root, flat = false) {
		owned.push(geometry)
		const mesh = new THREE.Mesh(geometry, material(role, flat))
		mesh.position.set(x, y, z)
		parent.add(mesh)
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
		fornax()
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
	// Fornax: a beehive kiln on a worn plinth, leaning, blacker the higher the soot has climbed. Two small
	// eyes sit under a chipped brow on the slope the match camera sees, the door is a barred mouth with a
	// tusk at each corner, and the crest round its shoulders is every kiln stilt it has fired, bone-white.
	function fornax() {
		const kiln = new THREE.Group()
		root.add(kiln)
		const course = (top, bottom, height, role, y, flat = false, sides = 8) =>
			part(new THREE.CylinderGeometry(top, bottom, height, sides), role, 0, y, 0, kiln, flat)
		drum(1.55, 1.72, 0.3, 'sand')
		drum(1.42, 1.55, 0.28, 'driftwood', 0, 0.44)
		course(1.22, 1.42, 1.05, 'terracotta', 1.1)
		course(1.28, 1.28, 0.12, 'hole', 1.64, true)
		course(0.82, 1.22, 0.9, 'driftwood', 2.12)
		course(0.6, 0.88, 0.16, 'hole', 2.62, true)
		const chimney = course(0.38, 0.58, 0.8, 'hole', 3.05, true, 6)
		chimney.position.x = 0.06
		chimney.rotation.z = -0.12
		const face = new THREE.Group()
		face.position.set(0, 2.16, 1.02)
		face.rotation.x = -0.42
		kiln.add(face)
		part(new THREE.BoxGeometry(1.25, 0.13, 0.2), 'hole', 0, 0.3, 0.04, face, true).rotation.z = 0.06
		for (const side of [-1, 1])
			faces.push(
				part(new THREE.BoxGeometry(0.27, 0.14, 0.12), 'cream', side * 0.33, 0.06, 0.1, face),
			)
		part(new THREE.BoxGeometry(1.8, 0.2, 0.5), 'sand', 0, 1.62, 1.38, kiln)
		for (const side of [-1, 1])
			part(
				new THREE.ConeGeometry(0.17, 0.75, 4),
				'cream',
				side * 0.98,
				1.36,
				1.6,
				kiln,
			).rotation.z = Math.PI + side * 0.25
		part(new THREE.BoxGeometry(1.3, 0.95, 0.5), 'hole', 0, 1.05, 1.18, kiln, true)
		// The fire behind the bars, which goes out with the kiln.
		faces.push(part(new THREE.BoxGeometry(1.1, 0.5, 0.06), 'terracotta', 0, 0.9, 1.4, kiln))
		for (const x of [-0.45, -0.15, 0.15, 0.45])
			part(new THREE.BoxGeometry(0.11, 0.95, 0.12), 'ink', x, 1.05, 1.46, kiln)
		part(new THREE.BoxGeometry(1.8, 0.2, 0.8), 'sand', 0, 0.62, 1.3, kiln)
		// Two rings of stilts round the back and sides, raked outward like quills and tallest at the back.
		for (const [ring, y, count, tall] of [
			[0.78, 2.72, 7, 1.25],
			[1.26, 1.78, 9, 0.95],
		])
			for (let i = 0; i < count; i++) {
				const angle = Math.PI * (1.12 + (0.76 * i) / (count - 1))
				const middle = 1 - Math.abs(i - (count - 1) / 2) / ((count - 1) / 2)
				const height = tall * (0.62 + 0.38 * middle)
				const quill = new THREE.Group()
				quill.position.set(Math.cos(angle) * ring, y, Math.sin(angle) * ring)
				quill.rotation.order = 'YXZ'
				quill.rotation.set(0.5, -angle + Math.PI / 2, 0)
				kiln.add(quill)
				part(new THREE.ConeGeometry(0.15, height, 4), 'cream', 0, height * 0.42, 0, quill)
			}
		// Old things lean: the plinth stays level and the kiln has settled four degrees off it.
		kiln.rotation.set(-0.03, 0, 0.07)
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
