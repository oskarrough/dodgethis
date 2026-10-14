import * as THREE from 'three'
import { tune } from '../../tune.js'

export function dress({ torso, part, own, discY, materials }) {
	const v = tune.heroes.wata.view
	torso.geometry = own(new THREE.SphereGeometry(1, 16, 10))
	torso.scale.set(v.width, v.height, v.depth)
	part(
		new THREE.CylinderGeometry(v.neckRadius, v.neckRadius, v.neckHeight, 12),
		materials.cream,
		0,
		discY + v.neckY,
		0,
	)
	const spout = part(
		new THREE.CylinderGeometry(v.spoutRadius, v.spoutRadius, v.spoutLength, 10),
		materials.cream,
		v.spoutX,
		discY + v.spoutY,
		0,
	)
	spout.rotation.z = -Math.PI / 3
	part(
		new THREE.TorusGeometry(v.handleRadius, v.handleTube, 6, 16),
		materials.ink,
		v.handleX,
		discY + v.handleY,
		0,
	)
	return { spout, releases: { balloon: { snap: v.releaseSnap, recover: v.releaseRecover } } }
}
export function animate(
	unit,
	rig,
	{ costume, pose, progress, alpha, releasing, releasePose, fire, settle },
) {
	const v = tune.heroes.wata.view
	rig.spout.rotation.z = -Math.PI / 3
	if (releasing) {
		pose = releasePose
		progress = fire * settle
	}
	if (unit?.dashAbility === 'slide' || pose === 'slide') costume.rotation.x = v.slideTilt
	else if (pose === 'balloon') costume.rotation.x = -v.balloonTilt * progress
	else if (pose === 'sprinkler') costume.rotation.z = v.sprinklerTilt * progress
	else if (pose === 'waterFlick' || unit?.attack) {
		const attack = unit?.attack
		const reach =
			attack?.phase === 'windup' ? 1 - (attack.left - alpha) / Math.max(1, attack.total) : progress
		rig.spout.rotation.z -= v.flickTilt * Math.max(0, reach ?? 1)
	}
}
