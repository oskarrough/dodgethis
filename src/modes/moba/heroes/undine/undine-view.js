import * as THREE from 'three'
import { tune } from '../../tune.js'

export function dress({ torso, part, detail, face, own, discY, materials }) {
	const v = tune.heroes.undine.view
	// Bake the pot's proportions into the geometry: hero-view grounds the torso and clones its geometry
	// for the ink border, and a mesh scale would leave that border as a full-size ink ball.
	const enamel = new THREE.SphereGeometry(1, 12, 8).scale(v.width, v.height, v.depth).toNonIndexed()
	enamel.computeVertexNormals()
	torso.geometry = own(enamel)
	face(0.9, discY + 1.29, -0.36)
	const chip = new THREE.BufferGeometry()
	chip.setAttribute(
		'position',
		new THREE.Float32BufferAttribute(
			[
				-0.43, 1.2, -0.25, -0.3, 1.18, -0.43, -0.18, 1.31, -0.29, 0.32, 1.22, 0.2, 0.45, 1.14, 0.24,
				0.5, 1.13, 0.06,
			],
			3,
		),
	)
	chip.computeVertexNormals()
	part(chip.translate(0, discY, 0), materials.cream)
	const hem = new THREE.CylinderGeometry(0.55, 0.43, 0.14, 12).translate(0, discY + 0.18, 0)
	const normals = hem.attributes.normal
	for (let i = 0; i < normals.count; i++) normals.setXYZ(i, 0, -1, 0)
	part(hem, materials.skin)
	part(
		new THREE.CylinderGeometry(v.neckRadius, v.neckRadius, v.neckHeight, 12),
		materials.cream,
		0,
		discY + v.neckY,
		0,
	)
	const spoutShape = new THREE.CylinderGeometry(v.spoutRadius, v.spoutRadius, v.spoutLength, 6)
	const lip = spoutShape.attributes.position
	for (let i = 0; i < lip.count; i++)
		if (lip.getY(i) > 0 && lip.getX(i) < v.spoutRadius * 0.5) lip.setY(i, lip.getY(i) - 0.12)
	spoutShape.computeVertexNormals()
	const spout = part(spoutShape, materials.cream, v.spoutX, discY + v.spoutY, 0)
	spout.rotation.z = -Math.PI / 3
	detail(
		[
			new THREE.CylinderGeometry(v.spoutRadius * 0.68, v.spoutRadius * 0.68, 0.016, 6).translate(
				0,
				v.spoutLength / 2 - 0.13,
				0,
			),
		],
		materials.ink,
		spout,
	)
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
	const v = tune.heroes.undine.view
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
