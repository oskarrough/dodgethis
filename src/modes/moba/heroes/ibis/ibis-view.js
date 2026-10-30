import * as THREE from 'three'
export { cards } from './ibis-numbers.js'
export { animate } from './ibis-motion.js'
export { extras } from './ibis-marks.js'

// Ibis's costume: the capsule, quiver, arrows and the bow rig his poses read.
// Team accent: the foot disc and the fletchings; the bow stays ink.
export function dress({
	costume,
	torso,
	part,
	detail,
	face,
	discY,
	own,
	roots,
	t,
	look,
	materials,
}) {
	const { ink, cream, fins, skin } = materials
	const shell = new THREE.CapsuleGeometry(t.bodyRadius, t.bodyHalfHeight * 2, 4, 12).toNonIndexed()
	shell.computeVertexNormals()
	torso.geometry = own(shell)
	const y = (height) => discY + height
	// The hunter's pale neck and swept head sit over a slim, sea-teal coat.
	part(new THREE.CylinderGeometry(0.13, 0.21, 0.56, 5), cream, 0, y(1.32), -0.04)
	part(new THREE.IcosahedronGeometry(0.3, 0).scale(0.78, 0.62, 1.12), cream, 0, y(1.64), -0.12)
	face(0.36, y(1.69), -0.28)
	// A thin extruded profile gives the beak a hook, not a conical snout.
	const beak = new THREE.Shape()
	beak.moveTo(0, 0)
	beak.lineTo(0.42, -0.015)
	beak.lineTo(1.18, -0.07)
	beak.lineTo(1.52, -0.13)
	beak.lineTo(1.1, -0.16)
	beak.lineTo(0.04, -0.14)
	beak.closePath()
	part(
		new THREE.ExtrudeGeometry(beak, { depth: 0.11, bevelEnabled: false })
			.translate(0, 0, -0.055)
			.rotateY(Math.PI / 2),
		ink,
		0,
		y(1.58),
		-0.26,
	)
	// A V cut through the crown leaves two hard crest points without adding height.
	const crest = new THREE.Shape()
	crest.moveTo(-0.13, 1.52)
	crest.lineTo(-0.1, 1.76)
	crest.lineTo(0, 1.64)
	crest.lineTo(0.1, 1.76)
	crest.lineTo(0.13, 1.52)
	crest.closePath()
	part(
		new THREE.ExtrudeGeometry(crest, { depth: 0.07, bevelEnabled: false }).translate(
			0,
			discY,
			-0.035,
		),
		ink,
	)
	// Two ragged feather planes and a pale chipped hem, rather than surface noise.
	for (const side of [-1, 1]) {
		const wing = new THREE.Shape()
		wing.moveTo(side * 0.16, 1.12)
		wing.lineTo(side * 0.32, 0.99)
		wing.lineTo(side * 0.37, 0.4)
		wing.lineTo(side * 0.24, 0.51)
		wing.lineTo(side * 0.21, 0.35)
		wing.lineTo(side * 0.12, 0.6)
		wing.closePath()
		part(
			new THREE.ExtrudeGeometry(wing, { depth: 0.21, bevelEnabled: false }),
			cream,
			0,
			discY,
			-0.13,
		)
	}
	detail(
		[
			new THREE.BoxGeometry(0.035, 0.58, 0.025).rotateZ(-0.24).translate(0.06, y(0.72), -0.275),
			new THREE.BoxGeometry(0.14, 0.025, 0.025).translate(-0.08, y(0.42), -0.275),
		],
		ink,
	)
	const wear = new THREE.CylinderGeometry(t.bodyRadius, t.bodyRadius * 0.82, 0.16, 12).translate(
		0,
		y(0.19),
		0,
	)
	const normals = wear.attributes.normal
	for (let i = 0; i < normals.count; i++) normals.setXYZ(i, 0, -1, 0)
	part(wear, skin)
	part(
		new THREE.CylinderGeometry(t.quiverRadius, t.quiverRadius, t.quiverHeight, t.segments),
		ink,
		0,
		t.quiverY,
		t.quiverZ,
	)
	part(
		new THREE.CylinderGeometry(t.quiverRadius * 1.18, t.quiverRadius * 1.18, 0.075, 6),
		cream,
		0,
		t.quiverY + t.quiverHeight / 2 - 0.03,
		t.quiverZ,
	)
	for (let i = 0; i < t.arrowCount; i++) {
		const offset = i - (t.arrowCount - 1) / 2
		const arrow = new THREE.Group()
		arrow.position.set(
			offset * t.arrowSpacing * 1.35,
			t.arrowY + 0.25 + (offset === 0 ? 0.15 : 0),
			t.quiverZ + 0.35,
		)
		arrow.rotation.z = -offset * t.arrowFan * 1.3
		// Keep the tips behind the neck, but rake away from the camera-facing back.
		// The opposite rake projects all three shafts onto one horizontal line at 58 degrees.
		arrow.rotation.x = -t.arrowTilt
		costume.add(arrow)
		roots.push(arrow)
		part(
			new THREE.CylinderGeometry(t.arrowRadius, t.arrowRadius, t.arrowHeight, 4),
			cream,
			0,
			0,
			0,
			arrow,
		)
		for (let fin = 0; fin < t.finCount; fin++) {
			// Pointed, narrow vanes leave daylight between the three arrow tops.
			const feather = new THREE.Shape()
			const width = t.fletchingRadius * 0.65
			const height = t.fletchingHeight * 0.85
			feather.moveTo(0, height)
			feather.lineTo(width, height * 0.12)
			feather.lineTo(width * 0.65, -height * 0.6)
			feather.lineTo(0, -height * 0.35)
			feather.lineTo(-width * 0.65, -height * 0.6)
			feather.lineTo(-width, height * 0.12)
			feather.closePath()
			const mesh = part(new THREE.ShapeGeometry(feather), fins, 0, t.arrowHeight / 2, 0, arrow)
			mesh.rotation.y = (fin * Math.PI) / t.finCount
		}
	}
	const a = look.abilityView
	const bow = new THREE.Group()
	bow.name = 'moba-bow'
	costume.add(bow)
	roots.push(bow)
	const curve = new THREE.CatmullRomCurve3([
		new THREE.Vector3(0, -a.bowHeight / 2, 0),
		new THREE.Vector3(0, 0, -a.bowCurve),
		new THREE.Vector3(0, a.bowHeight / 2, 0),
	])
	part(new THREE.TubeGeometry(curve, a.bowSegments, a.bowRadius, 4, false), ink, 0, 0, 0, bow)
	const hand = part(new THREE.SphereGeometry(a.handRadius, 8, 6), cream)
	hand.name = 'moba-draw-hand'
	part(new THREE.SphereGeometry(a.handRadius, 8, 6), cream, 0, 0, -a.bowCurve, bow)
	const drawArm = part(new THREE.CylinderGeometry(a.armRadius, a.armRadius, 1, 4), skin)
	drawArm.name = 'moba-draw-arm'
	const stringGeometry = new THREE.BufferGeometry()
	stringGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(36), 3))
	const bowString = new THREE.Mesh(own(stringGeometry), cream)
	bowString.frustumCulled = false
	costume.add(bowString)
	roots.push(bowString)
	return {
		border: false,
		bow,
		hand,
		bowString,
		drawArm,
		restY: costume.position.y,
		quiverZ: t.quiverZ,
		arrowHeight: t.arrowHeight,
	}
}
