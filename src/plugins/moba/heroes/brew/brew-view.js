import * as THREE from 'three'
import { tune } from '../../tune.js'

export function dress({ torso, part, own, discY, materials }) {
	const v = tune.heroes.brew.view
	torso.geometry = own(new THREE.CylinderGeometry(v.width, v.width, v.height, 6))
	const jug = part(
		new THREE.CylinderGeometry(v.jugRadius, v.jugRadius, v.jugHeight, 6),
		materials.cream,
		0,
		discY + v.jugY,
		v.jugZ,
	)
	part(
		new THREE.CylinderGeometry(v.neckRadius, v.neckRadius, v.neckHeight, 6),
		materials.ink,
		0,
		discY + v.neckY,
		v.jugZ,
	)
	const palm = part(
		new THREE.SphereGeometry(v.palmRadius, 6, 4),
		materials.team,
		v.palmX,
		discY + v.palmY,
		v.palmZ,
	)
	return { jug, palm }
}
export function animate(unit, rig, { costume, pose, progress, time, alpha }) {
	const v = tune.heroes.brew.view
	rig.jug.rotation.x = 0
	rig.palm.position.z = v.palmZ
	if (unit?.channel?.ability === 'swig') {
		costume.rotation.x = -v.staggerLean
		rig.jug.rotation.x = v.drinkTilt
	} else if (pose === 'flyingKick' || unit?.dashAbility === 'flyingKick')
		costume.rotation.x = -v.kickLean * (pose ? progress : 1)
	else if (unit?.stance?.ability === 'stagger') costume.rotation.z = Math.sin(time) * v.staggerLean
	else if (unit?.attack)
		rig.palm.position.z -=
			v.strikeReach *
			(unit.attack.phase === 'windup'
				? Math.max(0, 1 - (unit.attack.left - alpha) / Math.max(1, unit.attack.total))
				: 1)
}
