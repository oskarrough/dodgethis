import * as THREE from 'three'
export { cards } from './ibis-numbers.js'

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
	face(0.46, y(1.68), -0.18)
	// A short four-sided beak stays inside the existing bow-and-quiver envelope.
	part(new THREE.ConeGeometry(0.1, 0.2, 4).rotateX(-Math.PI / 2), cream, 0, y(1.51), -0.27)
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
	for (let i = 0; i < t.arrowCount; i++) {
		const offset = i - (t.arrowCount - 1) / 2
		const arrow = new THREE.Group()
		arrow.position.set(offset * t.arrowSpacing, t.arrowY, t.quiverZ)
		arrow.rotation.z = -offset * t.arrowFan
		arrow.rotation.x = t.arrowTilt
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
			const mesh = part(
				new THREE.PlaneGeometry(t.fletchingRadius * 2, t.fletchingHeight),
				fins,
				0,
				t.arrowHeight / 2,
				0,
				arrow,
			)
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
	return { border: false, bow, hand, bowString, drawArm }
}
