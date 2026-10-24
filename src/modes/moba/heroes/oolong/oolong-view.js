import * as THREE from 'three'
import { tune } from '../../tune.js'

export function dress({ torso, part, own, discY, materials }) {
	const v = tune.heroes.oolong.view
	torso.geometry = own(new THREE.CylinderGeometry(v.width, v.width, v.height, 6))
	// Team accent: a sash round the middle, proud of the ink border.
	part(
		new THREE.CylinderGeometry(v.width + v.sashProud, v.width + v.sashProud, v.sashHeight, 6),
		materials.team,
		0,
		discY + v.sashY,
		0,
	)
	const jug = part(
		new THREE.CylinderGeometry(v.jugRadius, v.jugRadius, v.jugHeight, 6),
		materials.cream,
		0,
		discY + v.jugY,
		v.jugZ,
	)
	// The neck rides on the jug so it tips with it.
	part(
		new THREE.CylinderGeometry(v.neckRadius, v.neckRadius, v.neckHeight, 6),
		materials.ink,
		0,
		v.neckY - v.jugY,
		0,
		jug,
	)
	const palm = part(
		new THREE.SphereGeometry(v.palmRadius, 6, 4),
		materials.cream,
		v.palmX,
		discY + v.palmY,
		v.palmZ,
	)
	return { jug, palm, jugY: discY + v.jugY, swig: 0, last: null }
}
export function animate(unit, rig, { costume, pose, progress, time, alpha }) {
	const v = tune.heroes.oolong.view
	// Ease the drink in and out instead of snapping between poses.
	const drinking = unit?.channel?.ability === 'swig'
	const step = rig.last === null ? 0 : Math.max(0, time - rig.last)
	rig.last = time
	rig.swig += ((drinking ? 1 : 0) - rig.swig) * Math.min(1, step / v.swigEase)
	const s = rig.swig * rig.swig * (3 - 2 * rig.swig)
	rig.jug.rotation.x = v.drinkTilt * s
	rig.jug.position.y = rig.jugY + v.drinkLift * s
	rig.palm.position.z = v.palmZ
	if (drinking || s > 0.01) costume.rotation.x = -v.drinkLean * s
	else if (pose === 'flyingKick' || unit?.dashAbility === 'flyingKick')
		costume.rotation.x = -v.kickLean * (pose ? progress : 1)
	else if (unit?.stance?.ability === 'stagger') costume.rotation.z = Math.sin(time) * v.staggerLean
	else if (unit?.attack)
		rig.palm.position.z -=
			v.strikeReach *
			(unit.attack.phase === 'windup'
				? Math.max(0, 1 - (unit.attack.left - alpha) / Math.max(1, unit.attack.total))
				: 1)
}
