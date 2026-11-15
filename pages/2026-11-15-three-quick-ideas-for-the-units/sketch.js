// Sketches for the units round.
// Imported into a running match from the console to make this page's frames; nothing in src/ imports it.
import * as THREE from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { makeStyleMaterial, styleId } from '/src/core/stylepass.js'

// A copy of `geometry` swollen by `push` metres along smoothed normals, so hard edges don't split the hull.
function swollen(geometry, push) {
	const bare = new THREE.BufferGeometry()
	bare.setAttribute('position', geometry.attributes.position.clone())
	if (geometry.index) bare.setIndex(geometry.index.clone())
	const welded = mergeVertices(bare, 1e-3)
	welded.computeVertexNormals()
	const p = welded.attributes.position
	const n = welded.attributes.normal
	for (let i = 0; i < p.count; i++)
		p.setXYZ(
			i,
			p.getX(i) + n.getX(i) * push,
			p.getY(i) + n.getY(i) * push,
			p.getZ(i) + n.getZ(i) * push,
		)
	welded.computeVertexNormals()
	return welded
}

// Wrap every solid part under `root` in an ink hull, and a cream one beyond it that only shows outside the figure.
export function stickerEdge(root, { ink = 0.06, cream = 0.045, back = 0.1, thin = 0.13 } = {}) {
	const inkMaterial = makeStyleMaterial('ink', { flat: true, side: THREE.BackSide })
	const creamMaterial = makeStyleMaterial('cream', { flat: true, side: THREE.BackSide })
	const parts = []
	root.traverse((o) => {
		if (!o.isMesh || !o.visible || o.userData.hull) return
		if (!o.material?.uniforms?.uStyleId) return
		const g = o.geometry
		if (!g.attributes.position || g.attributes.position.count < 12 || o.frustumCulled === false)
			return
		g.computeBoundingBox()
		const size = g.boundingBox.getSize(new THREE.Vector3())
		if (Math.min(size.x, size.y, size.z) < thin) return
		for (let p = o.parent; p; p = p.parent) if (p.name === 'hero-brow') return
		parts.push(o)
	})
	const added = []
	for (const o of parts) {
		const scale = o.getWorldScale(new THREE.Vector3()).x || 1
		const a = new THREE.Mesh(swollen(o.geometry, ink / scale), inkMaterial)
		a.userData.hull = true
		o.add(a)
		added.push(a)
		if (cream > 0) {
			const b = new THREE.Mesh(swollen(o.geometry, (ink + cream) / scale), creamMaterial)
			b.userData.hull = true
			// Stand the cream hull well behind the figure, so it never prints between two of its own parts.
			b.onBeforeRender = (renderer, scene, camera) => {
				const away = new THREE.Vector3()
				camera.getWorldDirection(away)
				b.position.copy(o.worldToLocal(o.getWorldPosition(new THREE.Vector3()).addScaledVector(away, back)))
				b.updateMatrixWorld(true)
			}
			o.add(b)
			added.push(b)
		}
	}
	return () => added.forEach((m) => (m.removeFromParent(), m.geometry.dispose()))
}

// Stand a hero's costume on a pivot at its heel, so a blow can rock it like a statue instead of squashing it.
export function heel(body) {
	const costume = body.mesh.getObjectByName('moba-cast-pose')
	if (costume.parent.name === 'heel-lift') return costume.parent.parent
	const pivot = new THREE.Group()
	pivot.name = 'heel'
	// The game resets the costume's own height every frame, so the lift back up lives on a group between.
	const lift = new THREE.Group()
	lift.name = 'heel-lift'
	const drop = body.radius + body.halfHeight
	pivot.position.y = -drop
	lift.position.y = drop
	costume.parent.add(pivot)
	pivot.add(lift)
	lift.add(costume)
	return pivot
}

// One frame of the answer to a blow from the west: `lean` radians about the heel, `squash` for today's jelly, `flash` cream.
export function struck(body, { lean = 0, squash = 0, flash = false, shift = 0 } = {}) {
	const pivot = heel(body)
	// Rock on the edge of the base away from the blow, so the near side lifts off the disc.
	const edge = lean === 0 ? 0 : Math.sign(lean) * body.radius * 0.8
	pivot.rotation.z = -lean
	pivot.position.x = shift + edge
	pivot.children[0].position.x = -edge
	pivot.scale.set(1 + squash, 1 - squash * 0.5, 1 + squash)
	if (flash)
		pivot.traverse((o) => {
			const u = o.material?.uniforms
			if (!u?.uStyleId || o.userData.hull) return
			u.uStyleId.value = styleId('cream')
			u.uFlat.value = 1
		})
}

// Ink shards knocked off by a blow, flying east from (x, y, z).
export function chips(scene, x, y, z, count = 4) {
	const ink = makeStyleMaterial('ink', { flat: true })
	for (let i = 0; i < count; i++) {
		const chip = new THREE.Mesh(new THREE.TetrahedronGeometry(0.07 + (i % 2) * 0.04), ink)
		chip.position.set(x + 0.35 + i * 0.22, y + 0.25 + Math.sin(i * 2.1) * 0.3, z + Math.cos(i * 1.7) * 0.3)
		chip.rotation.set(i, i * 2, i * 3)
		scene.add(chip)
	}
}

// Fornax recast: a beehive kiln on a stepped plinth, bottom-heavy and leaning, with a lintel brow over two small
// eyes, a barred mouth, and a crest of pale kiln stilts down its back, which is everything it has fired.
export function fornax() {
	const root = new THREE.Group()
	const mats = {}
	const mat = (role, flat = false) =>
		(mats[role + flat] ??= makeStyleMaterial(role, { flat }))
	const part = (geometry, role, x = 0, y = 0, z = 0, flat = false) => {
		const g = geometry.index ? geometry.toNonIndexed() : geometry
		g.computeVertexNormals()
		const mesh = new THREE.Mesh(g, mat(role, flat))
		mesh.position.set(x, y, z)
		root.add(mesh)
		return mesh
	}
	const body = new THREE.Group()
	root.add(body)
	const on = (mesh) => (body.add(mesh), mesh)
	// The plinth it has sat on since the first firing: two worn steps, one corner gone.
	part(new THREE.CylinderGeometry(1.75, 1.95, 0.3, 8), 'sand', 0, 0.15)
	part(new THREE.CylinderGeometry(1.5, 1.7, 0.28, 8), 'driftwood', 0, 0.44)
	// The kiln: three courses narrowing to a broken chimney, wider at the bottom than a hero is tall, and
	// blacker the higher the soot has climbed.
	on(part(new THREE.CylinderGeometry(1.22, 1.5, 1.05, 8), 'terracotta', 0, 1.1))
	on(part(new THREE.CylinderGeometry(1.28, 1.28, 0.12, 8), 'hole', 0, 1.64, 0, true))
	on(part(new THREE.CylinderGeometry(0.82, 1.22, 0.9, 8), 'driftwood', 0, 2.12))
	on(part(new THREE.CylinderGeometry(0.6, 0.88, 0.16, 8), 'hole', 0, 2.62, 0, true))
	on(part(new THREE.CylinderGeometry(0.38, 0.58, 0.8, 6), 'hole', 0.06, 3.05, 0, true)).rotation.z = -0.12
	// The face sits on the slope of the upper course, where the match camera looks: a brow bar with one end
	// chipped lower than the other, and two small pale eyes set under it.
	const face = new THREE.Group()
	face.position.set(0, 2.16, 1.02)
	face.rotation.x = -0.42
	body.add(face)
	const browBar = part(new THREE.BoxGeometry(1.25, 0.13, 0.2), 'hole', 0, 0.3, 0.04, true)
	browBar.rotation.z = 0.06
	face.add(browBar)
	for (const side of [-1, 1])
		face.add(part(new THREE.BoxGeometry(0.27, 0.14, 0.12), 'cream', side * 0.33, 0.06, 0.1, true))
	// The door like a mouth: a porch lintel with a tusk at each corner, a dark arch, four ink bars for teeth,
	// and a hearth-lip it rests its chin on.
	on(part(new THREE.BoxGeometry(1.8, 0.2, 0.5), 'sand', 0, 1.62, 1.38))
	for (const side of [-1, 1]) {
		const tusk = on(part(new THREE.ConeGeometry(0.17, 0.75, 4), 'cream', side * 0.98, 1.36, 1.6))
		tusk.rotation.z = Math.PI + side * 0.25
	}
	on(part(new THREE.BoxGeometry(1.3, 0.95, 0.5), 'hole', 0, 1.05, 1.18, true))
	for (const x of [-0.45, -0.15, 0.15, 0.45])
		on(part(new THREE.BoxGeometry(0.11, 0.95, 0.12), 'ink', x, 1.05, 1.46, true))
	on(part(new THREE.BoxGeometry(1.8, 0.2, 0.8), 'sand', 0, 0.62, 1.3))
	// The crest: kiln stilts, bone-white from a thousand firings, standing in two rings round its shoulders
	// and raked outward like quills, tallest at the back.
	for (const [ring, y, count, tall] of [
		[0.78, 2.72, 7, 1.25],
		[1.26, 1.78, 9, 0.95],
	])
		for (let i = 0; i < count; i++) {
			const a = Math.PI * (0.62 + (0.76 * i) / (count - 1)) + Math.PI / 2 // an arc round the back and sides
			const mid = 1 - Math.abs(i - (count - 1) / 2) / ((count - 1) / 2)
			const h = tall * (0.62 + 0.38 * mid)
			const quill = new THREE.Group()
			quill.position.set(Math.cos(a) * ring, y, Math.sin(a) * ring)
			quill.rotation.y = -a + Math.PI / 2
			body.add(quill)
			const spine = part(new THREE.ConeGeometry(0.15, h, 4), 'cream', 0, h * 0.42, 0)
			quill.add(spine)
			quill.rotation.order = 'YXZ'
			quill.rotation.x = 0.5
		}
	// Old things lean. The plinth stays level; the kiln has settled four degrees off it.
	body.rotation.z = 0.07
	body.rotation.x = -0.03
	root.name = 'sketch-fornax'
	return root
}
