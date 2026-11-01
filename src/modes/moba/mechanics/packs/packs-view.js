import * as THREE from 'three'
import { makeStyleMaterial } from '../../../../core/stylepass.js'
import { chippedBlock } from '../../carve.js'

// Altamesa's guards are the Wardens' servants, fired from the same clay and cut from the same
// stone as their masters (concept: pages/art/mesa-guards/). Each kind has its own shape from
// above: the melee guard a round jar with a potsherd shield, the ranged guard a hooded standing
// stone with a forked staff, the brute a lintel across its shoulders, a T. No team colour.
// Sizes in metres from the guard's feet; the body faces -z.
const guard = {
	melee: { jar: 0.36, neck: 0.2, height: 0.98, shard: [0.62, 0.66], shardTilt: 0.55 },
	ranged: { stone: 0.3, height: 1.5, staff: 1.85, fork: 0.28, ball: 0.19 },
	brute: { belly: 0.56, lintel: [1.9, 0.38, 0.56], lift: 1.62, fist: 0.3 },
	chip: { bevel: 0.05, chip: 0.08 },
}

// Hide the plain lane figure and give `build` a kit to sculpt a new one inside the same body, so
// collision, poses, hit flash and death all carry on as before. Materials are this body's own:
// a hit flashes one guard, not the pack.
export function dressFigure(body, seed, build) {
	if (!body?.visual) return
	const half = body.halfHeight
	const hidden = body.visual.children.map((part) => [part, part.visible])
	for (const [part] of hidden) part.visible = false
	const figure = new THREE.Group()
	figure.position.y = -half
	body.visual.add(figure)
	const owned = []
	const materials = new Map()
	const material = (role) => {
		if (!materials.has(role)) {
			const m = makeStyleMaterial(role)
			materials.set(role, m)
			owned.push(m)
		}
		return materials.get(role)
	}
	let a = seed >>> 0 || 1
	const rand = () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = Math.imul(a ^ (a >>> 15), a | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
	const part = (geometry, role, x = 0, y = 0, z = 0, parent = figure) => {
		const g = geometry.index ? geometry.toNonIndexed() : geometry
		if (g !== geometry) geometry.dispose()
		g.computeVertexNormals()
		owned.push(g)
		const mesh = new THREE.Mesh(g, material(role))
		mesh.position.set(x, y, z)
		mesh.castShadow = true
		parent.add(mesh)
		return mesh
	}
	const kit = {
		part,
		rand,
		group(x = 0, y = 0, z = 0, parent = figure) {
			const g = new THREE.Group()
			g.position.set(x, y, z)
			parent.add(g)
			return g
		},
		box: (w, h, d, role, x, y, z, parent) =>
			part(new THREE.BoxGeometry(w, h, d), role, x, y, z, parent),
		block: (w, h, d, role, x, y, z, parent) =>
			part(chippedBlock(w, h, d, guard.chip, rand), role, x, y, z, parent),
		// A turned pot or stone from its foot up, through [radius, height] points.
		lathe: (points, sides, role, x, y, z, parent) =>
			part(
				new THREE.LatheGeometry(
					points.map(([r, h]) => new THREE.Vector2(r, h)),
					sides,
				),
				role,
				x,
				y,
				z,
				parent,
			),
		// Small cream eyes under an ink brow, set into a face at `z` (negative is the front).
		eyes(y, z, apart, parent) {
			kit.box(apart * 2.6, 0.07, 0.05, 'ink', 0, y + 0.06, z, parent)
			for (const s of [-1, 1]) kit.box(0.06, 0.05, 0.04, 'cream', s * apart, y, z - 0.01, parent)
		},
	}
	build(kit)
	const dispose = body.dispose
	body.dispose = () => {
		figure.removeFromParent()
		for (const o of owned) o.dispose()
		dispose()
	}
}

export function dress(body, kind) {
	if (kind === 'melee') dressFigure(body, 11, jar)
	else if (kind === 'ranged') dressFigure(body, 23, slinger)
	else if (kind === 'brute') dressFigure(body, 37, bearer)
}

// A squat terracotta jar with a chipped crown of a rim and a dark mouth, behind a potsherd.
function jar({ lathe, part, box, eyes, group, rand }) {
	const g = guard.melee
	const r = g.jar
	lathe(
		[
			[0, 0.06],
			[r * 0.55, 0.06],
			[r * 0.95, 0.24],
			[r, 0.48],
			[r * 0.82, 0.72],
			[g.neck, 0.84],
			[g.neck + 0.04, g.height],
			[g.neck - 0.03, g.height],
			[0, g.height - 0.08],
		],
		8,
		'terracotta',
	)
	// The mouth, dark from above, and the chipped teeth of the rim around it.
	part(new THREE.CircleGeometry(g.neck - 0.02, 8).rotateX(-Math.PI / 2), 'ink', 0, g.height - 0.01)
	for (let i = 0; i < 6; i++) {
		if (i === 2) continue // the bite out of the crown
		const angle = (i / 6) * Math.PI * 2 + 0.3
		const tall = 0.08 + rand() * 0.1
		const tooth = box(0.1, tall, 0.06, 'terracotta')
		tooth.position.set(Math.sin(angle) * g.neck, g.height + tall / 2, Math.cos(angle) * g.neck)
		tooth.rotation.y = angle
	}
	part(new THREE.CylinderGeometry(g.neck + 0.03, g.neck + 0.05, 0.1, 8, 1, true), 'ink', 0, 0.84)
	eyes(0.84, -(g.neck + 0.05), 0.07)
	for (const s of [-1, 1]) box(0.14, 0.12, 0.18, 'terracotta', s * 0.15, 0.06, 0)
	// The potsherd, curved like the pot it broke from, tipped back so its face shows to the sky.
	const [w, h] = g.shard
	const shard = group(0.04, 0.48, -r - 0.08)
	shard.rotation.set(g.shardTilt, 0.12, 0.08)
	const curve = new THREE.CylinderGeometry(w, w, h, 7, 1, true, Math.PI - 0.62, 1.24)
	const p = curve.getAttribute('position')
	for (let i = 0; i < p.count; i++) {
		// Chip the top edge into a jagged break.
		if (p.getY(i) > 0) p.setY(i, p.getY(i) - ((i * 37) % 5) * 0.035)
	}
	const face = part(curve, 'terracotta', 0, 0, w - 0.02, shard)
	face.material.side = THREE.DoubleSide
	part(
		new THREE.CylinderGeometry(w + 0.03, w + 0.03, h + 0.04, 7, 1, true, Math.PI - 0.66, 1.32),
		'ink',
		0,
		-0.01,
		w + 0.02,
		shard,
	).material.side = THREE.DoubleSide
}

// A slim standing stone, hooded and scarved in Barquero's violet, with a forked driftwood staff.
function slinger({ lathe, part, box, eyes, group }) {
	const g = guard.ranged
	const r = g.stone
	lathe(
		[
			[0, 0],
			[r * 1.05, 0],
			[r, 0.62],
			[r * 0.92, 0.98],
			[r * 0.45, g.height - 0.12],
			[0, g.height],
		],
		5,
		'scenery',
	)
	// The hood's dark opening, the eyes in it, and the scarf wound under it.
	box(0.24, 0.2, 0.08, 'ink', 0, 0.96, -r * 0.86).rotation.x = 0.12
	eyes(0.94, -r * 0.94, 0.05)
	part(new THREE.CylinderGeometry(r * 1.15, r * 1.3, 0.3, 6), 'enamelViolet', 0, 0.8)
	const tail = box(0.14, 0.42, 0.05, 'enamelViolet', 0.1, 0.56, -r * 1.12)
	tail.rotation.z = 0.15
	// The staff off the right shoulder: a long shaft, a fork, and a stone in the fork.
	const staff = group(r + 0.18, 0, -0.06)
	staff.rotation.z = -0.3
	part(new THREE.CylinderGeometry(0.06, 0.07, g.staff, 5), 'driftwood', 0, g.staff / 2, 0, staff)
	for (const s of [-1, 1]) {
		const prong = part(
			new THREE.CylinderGeometry(0.045, 0.055, g.fork, 4),
			'driftwood',
			s * 0.07,
			g.staff + g.fork / 2 - 0.04,
			0,
			staff,
		)
		prong.rotation.z = -s * 0.5
	}
	part(new THREE.DodecahedronGeometry(g.ball), 'sand', 0, g.staff + g.fork * 0.6, 0, staff)
}

// A round clay body under a great chipped stone lintel, its head sunk beneath, fists like boulders.
function bearer({ block, part, box, eyes, group }) {
	const g = guard.brute
	part(new THREE.DodecahedronGeometry(g.belly).scale(1, 0.95, 0.9), 'terracotta', 0, 0.72)
	for (const s of [-1, 1]) {
		box(0.26, 0.3, 0.3, 'terracotta', s * 0.26, 0.14, 0)
		// Arms up to the lintel's ends, and the fists that hold it.
		const arm = block(0.24, 0.62, 0.26, 'terracotta', s * 0.62, 1.1, 0)
		arm.rotation.z = s * 0.2
		block(g.fist * 1.2, g.fist, g.fist * 1.1, 'terracotta', s * 0.7, 0.72, -0.06)
	}
	const head = group(0, 1.28, -0.18)
	block(0.36, 0.3, 0.32, 'terracotta', 0, 0, 0, head)
	eyes(0, -0.17, 0.07, head)
	const [w, h, d] = g.lintel
	const lintel = block(w, h, d, 'scenery', 0, g.lift, 0)
	lintel.rotation.y = 0.04
	// One crack across its face, so it reads as old stone and not a plank.
	box(0.05, h * 0.8, 0.04, 'ink', -0.38, g.lift, -d / 2 - 0.01).rotation.z = 0.35
}
