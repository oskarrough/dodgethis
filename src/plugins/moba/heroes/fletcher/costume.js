import * as THREE from 'three'

// Fletcher's costume: the capsule, quiver, arrows and the bow rig his poses read.
export function dress({ costume, torso, part, own, roots, t, look, materials }) {
	const { ink, cream, fins, team: teamMaterial } = materials
	torso.geometry = own(new THREE.CapsuleGeometry(t.bodyRadius, t.bodyHalfHeight * 2, 8, t.segments))
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
	const drawArm = part(new THREE.CylinderGeometry(a.armRadius, a.armRadius, 1, 4), teamMaterial)
	drawArm.name = 'moba-draw-arm'
	const stringGeometry = new THREE.BufferGeometry()
	stringGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(36), 3))
	const bowString = new THREE.Mesh(own(stringGeometry), fins)
	bowString.frustumCulled = false
	costume.add(bowString)
	roots.push(bowString)
	return { border: false, bow, hand, bowString, drawArm }
}
