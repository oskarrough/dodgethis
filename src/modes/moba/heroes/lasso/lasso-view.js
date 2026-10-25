import * as THREE from 'three'

// Worn hide around an open crescent, a suspended weight and its dark string.
const view = {
	radius: 0.75,
	innerRadius: 0.58,
	innerOffset: 0.35,
	height: 0.85,
	yoYoRadius: 0.24,
	yoYoDepth: 0.16,
	stringRadius: 0.025,
	handX: 0.55,
	handY: 0.75,
	handZ: -0.15,
	idleX: 0.95,
	idleY: 0.35,
	idleZ: -0.4,
	throwPull: 0.7,
	throwReach: 1.5,
	tangleSweep: Math.PI / 2,
	orbitRadius: 1.4,
	orbitHeight: 0.5,
	flickReach: 0.65,
	snap: 0.1,
	recover: 0.3,
	segments: 24,
}
const up = new THREE.Vector3(0, 1, 0)

export function dress({ torso, costume, discY, own, part, detail, face, materials }) {
	const shape = new THREE.Shape()
	shape.absarc(0, 0, view.radius, Math.PI / 3, (Math.PI * 5) / 3, false)
	shape.absarc(view.innerOffset, 0, view.innerRadius, -Math.PI / 2, (-Math.PI * 3) / 2, true)
	shape.closePath()
	torso.geometry = own(
		new THREE.ExtrudeGeometry(shape, { depth: view.height, bevelEnabled: false }).rotateX(
			Math.PI / 2,
		),
	)
	const rim = torso.geometry.attributes.position
	for (let i = 0; i < rim.count; i++)
		if (rim.getY(i) > -0.01 && rim.getX(i) > 0 && rim.getZ(i) < -0.43) rim.setY(i, -0.13)
	torso.geometry.computeVertexNormals()
	const brow = face(0.34, discY + 0.78, -0.59)
	brow.position.x = 0.24
	// A hooked blade sits in the existing crescent tip, leaving the gap open.
	const hook = new THREE.Shape()
	hook.moveTo(0.16, 0.52)
	hook.lineTo(0.38, 0.64)
	hook.lineTo(0.47, 0.43)
	hook.lineTo(0.32, 0.49)
	hook.closePath()
	part(
		new THREE.ExtrudeGeometry(hook, { depth: 0.08, bevelEnabled: false })
			.rotateX(Math.PI / 2)
			.translate(0, discY + view.height, 0),
		materials.cream,
	)
	const hem = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false })
		.rotateX(Math.PI / 2)
		.translate(0, discY + 0.13, 0)
	const normals = hem.attributes.normal
	for (let i = 0; i < normals.count; i++) normals.setXYZ(i, 0, -1, 0)
	part(hem, materials.skin)
	detail(
		[
			new THREE.BoxGeometry(0.025, 0.012, 0.18)
				.rotateY(-0.35)
				.translate(-0.57, discY + view.height + 0.004, 0.1),
			new THREE.BoxGeometry(0.025, 0.012, 0.14)
				.rotateY(0.65)
				.translate(-0.15, discY + view.height + 0.004, 0.62),
		],
		materials.ink,
	)
	const yoYo = part(
		new THREE.CylinderGeometry(
			view.yoYoRadius,
			view.yoYoRadius,
			view.yoYoDepth,
			view.segments,
		).rotateZ(Math.PI / 2),
		materials.team,
	)
	const string = part(
		new THREE.CylinderGeometry(view.stringRadius, view.stringRadius, 1, view.segments),
		materials.ink,
	)
	const hand = new THREE.Vector3(view.handX, discY + view.handY, view.handZ)
	const span = new THREE.Vector3()
	return {
		yoYo,
		string,
		hand,
		span,
		discY,
		costume,
		releases: {
			throwYoYo: { snap: view.snap, recover: view.recover },
			tangle: { snap: view.snap, recover: view.recover },
			aroundTheWorld: { snap: view.snap, recover: view.recover },
		},
	}
}

export function animate(
	unit,
	rig,
	{ pose, progress, releasing, releasePose, fire, settle, alpha, costume },
) {
	const { yoYo, string, hand, span, discY } = rig
	yoYo.position.set(view.idleX, discY + view.idleY, view.idleZ)
	const action = pose ?? (releasing ? releasePose : null)
	if (action === 'throwYoYo') {
		yoYo.position.z += view.throwPull * progress - view.throwReach * fire * settle
		yoYo.position.y += view.throwPull * progress
		costume.rotation.y = (-progress * view.tangleSweep) / 4
	} else if (action === 'tangle') {
		const angle = (progress - 0.5 + fire * settle) * view.tangleSweep
		yoYo.position.set(
			Math.sin(angle) * view.orbitRadius,
			discY + view.orbitHeight,
			-Math.cos(angle) * view.orbitRadius,
		)
	} else if (action === 'aroundTheWorld') {
		const angle = (progress + fire * settle) * Math.PI * 2
		yoYo.position.set(
			Math.sin(angle) * view.orbitRadius,
			discY + view.orbitHeight,
			Math.cos(angle) * view.orbitRadius,
		)
		costume.rotation.y = progress * Math.PI
	} else if (unit?.attack) {
		const attack = unit.attack
		const reach =
			attack.phase === 'windup'
				? 1 - (attack.left - alpha) / Math.max(1, attack.total)
				: (attack.left - alpha) / Math.max(1, attack.total ?? attack.left)
		yoYo.position.z -= view.flickReach * Math.sin((Math.max(0, Math.min(1, reach)) * Math.PI) / 2)
	}
	span.copy(yoYo.position).sub(hand)
	string.position.copy(hand).add(yoYo.position).multiplyScalar(0.5)
	string.scale.y = span.length()
	string.quaternion.setFromUnitVectors(up, span.normalize())
}
