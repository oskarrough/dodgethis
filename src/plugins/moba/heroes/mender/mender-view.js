import * as THREE from 'three'
import { look } from '../../look.js'

// Coach's bar and megaphone, without the touchline cutout.
export function dress({ torso, part, own, discY, t, materials }) {
	torso.geometry = own(new THREE.BoxGeometry(t.coachWidth, t.coachHeight, t.coachDepth))
	const cone = part(
		new THREE.CylinderGeometry(
			t.megaphoneRadius,
			t.arrowRadius,
			t.megaphoneLength,
			t.segments,
		).rotateX(-Math.PI / 2),
		materials.team,
		0,
		t.megaphoneY,
		t.megaphoneZ,
	)
	part(
		new THREE.CircleGeometry(t.megaphoneMouth, t.segments),
		materials.ink,
		0,
		t.megaphoneY,
		t.megaphoneZ - t.megaphoneLength / 2 - t.discBorder / 4,
	).rotation.y = Math.PI
	const hand = part(
		new THREE.SphereGeometry(t.fingerRadius, t.segments, 6),
		materials.cream,
		t.coachWidth / 2,
		discY + t.coachHeight * 0.6,
		0,
	)
	return { cone, hand }
}

export function animate(unit, rig, { pose, progress, costume }) {
	const t = look.silhouettes
	rig.hand.position.y = -t.coachHeight / 2 + t.coachHeight * 0.6
	rig.hand.position.z = 0
	rig.cone.rotation.x = 0
	if (pose === 'menderMend') {
		rig.hand.position.y += t.coachHeight * progress
		rig.cone.rotation.x = (-progress * Math.PI) / 8
	} else if (pose === 'menderWard') {
		rig.hand.position.z = -t.megaphoneLength
		costume.rotation.z = -Math.PI / 8
	} else if (pose === 'coachBasic') costume.rotation.x = (progress * Math.PI) / 12
}
