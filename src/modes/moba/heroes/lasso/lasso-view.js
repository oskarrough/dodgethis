import * as THREE from 'three'
import { STEP } from '../../../../core/app.js'
import { tune } from '../../tune.js'
import { poseWindup, poseStrike } from '../../pose-curve.js'
export { extras } from './lasso-effects.js'

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
	throwPull: 1.05,
	throwReach: 2.1,
	tangleSweep: Math.PI / 2,
	orbitRadius: 1.4,
	orbitHeight: 0.5,
	flickReach: 0.65,
	snap: 0.065,
	recover: 0.24,
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
	// An enamel slash on each cheek makes the spool's rotation visible.
	for (const side of [-1, 1])
		part(
			new THREE.BoxGeometry(0.015, view.yoYoRadius * 0.25, view.yoYoRadius * 1.5),
			materials.cream,
			side * (view.yoYoDepth / 2 + 0.005),
			view.yoYoRadius * 0.25,
			0,
			yoYo,
		)
	const string = part(
		new THREE.CylinderGeometry(view.stringRadius, view.stringRadius, 1, view.segments),
		materials.ink,
	)
	const hand = new THREE.Vector3(view.handX, discY + view.handY, view.handZ)
	const span = new THREE.Vector3()
	const home = new THREE.Vector3(view.idleX, discY + view.idleY, view.idleZ)
	return {
		yoYo,
		string,
		hand,
		span,
		home,
		discY,
		costume,
		releases: {
			throwYoYo: { snap: view.snap, recover: view.recover },
			tangle: { snap: 0.05, recover: 0.2 },
			aroundTheWorld: { snap: 0.08, recover: 0.24 },
		},
	}
}

export function animate(
	unit,
	rig,
	{ pose, progress, releasing, releasePose, fire, settle, alpha, time, costume },
) {
	const { yoYo, string, hand, span, discY } = rig
	yoYo.position.set(view.idleX, discY + view.idleY, view.idleZ)
	yoYo.rotation.x = time * STEP * 12
	const action = pose ?? (releasing ? releasePose : null)
	const coil = pose ? poseWindup(progress) : releasing ? (1 - fire) * settle : 0
	const strike = releasing ? poseStrike(fire, settle) : 0
	if (action === 'throwYoYo') {
		// Pull the weight behind the shoulder, then send the whole crescent after it.
		yoYo.position.x -= coil * 0.45 + strike * 0.35
		yoYo.position.z += view.throwPull * coil - view.throwReach * strike
		yoYo.position.y += view.throwPull * coil + strike * 0.15
		costume.rotation.set(-0.22 * coil + 0.16 * strike, -0.65 * coil + 0.2 * strike, 0.16 * coil)
	} else if (action === 'tangle') {
		// Load on the hand side; mesh yaw mirrors this local angle into the release stroke.
		const angle = pose
			? view.tangleSweep * 0.7 * coil
			: view.tangleSweep / 2 - view.tangleSweep * fire
		const reach = pose
			? view.orbitRadius
			: view.orbitRadius + (tune.tangle.range - view.orbitRadius) * settle
		yoYo.position.set(Math.sin(angle) * reach, discY + view.orbitHeight, -Math.cos(angle) * reach)
		costume.rotation.y = 0.4 * coil - 0.25 * strike
		costume.rotation.z = 0.22 * coil - 0.16 * strike
	} else if (action === 'aroundTheWorld') {
		// A low coil becomes one complete orbit, then the string winds back onto the spool.
		const orbit = releasing ? 1 - settle : 0
		const angle = pose
			? Math.PI * coil
			: Math.PI - Math.PI * 2 * Math.min(1, fire * 0.45 + orbit * 0.55)
		const reach = pose
			? view.orbitRadius
			: view.orbitRadius + (tune.aroundTheWorld.radius - view.orbitRadius) * settle
		yoYo.position.set(
			Math.sin(angle) * reach,
			discY + view.orbitHeight + coil * 0.35,
			-Math.cos(angle) * reach,
		)
		costume.rotation.y = 0.85 * coil - 0.55 * strike
		costume.rotation.z = -0.22 * coil + 0.18 * strike
	} else if (unit?.attack) {
		const attack = unit.attack
		const winding = attack.phase === 'windup'
		const wind = winding ? poseWindup(1 - (attack.left - alpha) / Math.max(1, attack.total)) : 0
		const returnProgress = winding
			? 0
			: Math.max(
					0,
					Math.min(
						1,
						((time - attack.startedTick) * STEP) / Math.max(STEP, tune.yoYoFlick.backswing),
					),
				)
		// Damage lands at the start of backswing. The visible weight is already there, then reels in.
		const lash = winding ? 0 : (1 - returnProgress) ** 2
		yoYo.position.set(
			view.idleX - lash * view.idleX,
			discY + view.idleY + wind * 0.45,
			view.idleZ +
				view.flickReach * wind -
				((attack.distance ?? tune.yoYoFlick.range) + view.idleZ) * lash,
		)
		costume.rotation.y = -0.32 * wind + 0.12 * lash
		costume.rotation.x = -0.12 * wind + 0.18 * lash
	}
	if (releasing && ['tangle', 'aroundTheWorld'].includes(action))
		yoYo.position.lerp(rig.home, Math.max(0, 1 - settle * 3))
	span.copy(yoYo.position).sub(hand)
	string.position.copy(hand).add(yoYo.position).multiplyScalar(0.5)
	string.scale.y = span.length()
	string.quaternion.setFromUnitVectors(up, span.normalize())
}
