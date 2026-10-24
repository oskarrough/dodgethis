import * as THREE from 'three'
import { makeStyleMaterial } from '../../../../core/stylepass.js'

// Carambola's build, in metres and radians. Forward is -z; heights are above the foot disc.
const view = {
	bodyRadius: 0.58,
	bodyHeight: 0.72,
	bandRadius: 0.62,
	bandHeight: 0.2,
	bandY: 0.42,
	headRadius: 0.4,
	headSquash: 0.82,
	headY: 0.98,
	headZ: -0.04,
	browWidth: 0.24,
	browTilt: 0.32,
	browY: 1.06,
	browZ: -0.3,
	eyeRadius: 0.04,
	eyeX: 0.11,
	eyeY: 0.98,
	eyeZ: -0.34,
	beakRadius: 0.1,
	beakLength: 0.26,
	beakY: 0.88,
	beakZ: -0.44,
	earRadius: 0.1,
	earHeight: 0.22,
	earX: 0.2,
	earY: 1.28,
	clawX: 0.18,
	clawZ: -0.42,
	paddleRadius: 0.36,
	paddleDepth: 0.06,
	notchRadius: 0.09,
	notchAngle: Math.PI / 4,
	paddleX: 0.92,
	paddleY: 0.82,
	paddleZ: -0.32,
	paddleTilt: 0.35,
	handleLength: 0.34,
	handleRadius: 0.05,
	wrapLength: 0.1,
	netRadius: 0.13,
	netLength: 0.78,
	netY: 0.78,
	netZ: 0.36,
	strapWidth: 0.07,
	strapInset: 0.12,
}

// A rounded triangular prism, point forward, centred on the origin.
function prism(radius, height, bevel) {
	const shape = new THREE.Shape()
	for (let i = 0; i < 3; i++) {
		const angle = (i * Math.PI * 2) / 3
		const x = Math.sin(angle) * radius,
			z = -Math.cos(angle) * radius
		if (i === 0) shape.moveTo(x, z)
		else shape.lineTo(x, z)
	}
	shape.closePath()
	return new THREE.ExtrudeGeometry(shape, {
		depth: height,
		bevelEnabled: bevel > 0,
		bevelThickness: bevel,
		bevelSize: bevel,
		bevelSegments: 2,
	})
		.rotateX(Math.PI / 2)
		.translate(0, height / 2, 0)
}

// The blade: a disc with a bite out of its rim, lying flat.
function blade() {
	const { paddleRadius: r, notchRadius: n, notchAngle: a } = view
	const gap = n / r
	const shape = new THREE.Shape()
	shape.absarc(0, 0, r, a + gap, a + Math.PI * 2 - gap, false)
	shape.absarc(Math.cos(a) * r, Math.sin(a) * r, n, a - Math.PI / 2, a - (Math.PI * 3) / 2, true)
	return new THREE.ExtrudeGeometry(shape, { depth: view.paddleDepth, bevelEnabled: false })
		.translate(0, 0, -view.paddleDepth / 2)
		.rotateX(-Math.PI / 2)
}

// Carambola: a stocky stone-beaked bruiser in a cream tunic with a team band, his wooden paddle open at his side.
export function dress({ costume, torso, discY, part, own, roots, t, materials }) {
	const { ink, cream, team } = materials
	const stone = makeStyleMaterial('scenery', { flat: true })
	const wood = makeStyleMaterial('driftwood')
	const beak = makeStyleMaterial('sand', { flat: true })
	const y = (h) => discY + h
	torso.material = cream
	torso.geometry = own(prism(view.bodyRadius, view.bodyHeight, t.corner / 2))
	part(prism(view.bandRadius, view.bandHeight, 0), team, 0, y(view.bandY), 0)
	for (const side of [-1, 1])
		part(
			new THREE.ConeGeometry(t.fingerRadius * 0.6, 0.22, 3).rotateX(-Math.PI / 2),
			ink,
			side * view.clawX,
			y(0.06),
			view.clawZ,
		)

	// Head: a faceted stone lump with a heavy brow, small eyes, a beak and two chipped ears.
	part(
		new THREE.IcosahedronGeometry(view.headRadius, 0).scale(1, view.headSquash, 1),
		stone,
		0,
		y(view.headY),
		view.headZ,
	)
	for (const side of [-1, 1]) {
		const brow = part(
			new THREE.BoxGeometry(view.browWidth, 0.1, 0.14),
			ink,
			side * view.browWidth * 0.48,
			y(view.browY),
			view.browZ,
		)
		brow.rotation.z = -side * view.browTilt
		part(
			new THREE.SphereGeometry(view.eyeRadius, 8, 6),
			cream,
			side * view.eyeX,
			y(view.eyeY),
			view.eyeZ,
		)
		part(
			new THREE.ConeGeometry(view.earRadius, view.earHeight, 4),
			stone,
			side * view.earX,
			y(view.earY),
			view.headZ + 0.04,
		).rotation.z = -side * 0.35
	}
	part(
		new THREE.ConeGeometry(view.beakRadius, view.beakLength, 4).rotateX(-Math.PI / 2),
		beak,
		0,
		y(view.beakY),
		view.beakZ,
	)

	// The paddle, open and out front, its worn handle running back to the fist.
	const paddle = new THREE.Group()
	paddle.position.set(view.paddleX, y(view.paddleY), view.paddleZ)
	paddle.rotation.set(view.paddleTilt, 0, -view.paddleTilt)
	costume.add(paddle)
	roots.push(paddle)
	part(blade(), wood, 0, 0, 0, paddle)
	part(
		new THREE.RingGeometry(view.paddleRadius - t.discBorder, view.paddleRadius, t.segments)
			.rotateX(-Math.PI / 2)
			.translate(0, view.paddleDepth / 2 + 0.002, 0),
		ink,
		0,
		0,
		0,
		paddle,
	)
	const back = view.notchAngle + Math.PI
	const reach = view.paddleRadius + view.handleLength / 2
	const handle = new THREE.Group()
	handle.position.set(Math.cos(back) * reach, 0, -Math.sin(back) * reach)
	handle.rotation.y = back
	paddle.add(handle)
	part(
		new THREE.CylinderGeometry(view.handleRadius, view.handleRadius, view.handleLength, 6).rotateZ(
			Math.PI / 2,
		),
		wood,
		0,
		0,
		0,
		handle,
	)
	part(
		new THREE.CylinderGeometry(
			view.handleRadius * 1.25,
			view.handleRadius * 1.25,
			view.wrapLength,
			6,
		).rotateZ(Math.PI / 2),
		ink,
		view.handleLength / 2 - view.wrapLength / 2,
		0,
		0,
		handle,
	)
	part(
		new THREE.SphereGeometry(t.fingerRadius * 0.8, 8, 6),
		ink,
		view.handleLength / 2 + 0.05,
		0,
		0,
		handle,
	)

	// The rolled net slung across his back, strapped at both ends.
	part(
		new THREE.CylinderGeometry(view.netRadius, view.netRadius, view.netLength, 8).rotateZ(
			Math.PI / 2,
		),
		cream,
		0,
		y(view.netY),
		view.netZ,
	)
	for (const side of [-1, 1])
		part(
			new THREE.CylinderGeometry(
				view.netRadius * 1.15,
				view.netRadius * 1.15,
				view.strapWidth,
				8,
			).rotateZ(Math.PI / 2),
			wood,
			side * (view.netLength / 2 - view.strapInset),
			y(view.netY),
			view.netZ,
		)
	return {}
}
