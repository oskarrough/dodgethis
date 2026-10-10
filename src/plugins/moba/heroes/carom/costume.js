import * as THREE from 'three'

// Carom's half-built costume: an extruded triangle with a racket.
export function dress({ torso, part, own, t, materials }) {
	const { ink, team: teamMaterial } = materials
	const shape = new THREE.Shape()
	for (let i = 0; i < 3; i++) {
		const angle = (i * Math.PI * 2) / 3
		const x = Math.sin(angle) * t.caromRadius,
			z = -Math.cos(angle) * t.caromRadius
		if (i === 0) shape.moveTo(x, z)
		else shape.lineTo(x, z)
	}
	shape.closePath()
	torso.geometry = own(
		new THREE.ExtrudeGeometry(shape, {
			depth: t.caromHeight,
			bevelEnabled: true,
			bevelThickness: t.corner / 2,
			bevelSize: t.corner / 2,
			bevelSegments: 3,
		})
			.rotateX(Math.PI / 2)
			.translate(0, t.caromHeight / 2, 0),
	)
	part(
		new THREE.TorusGeometry(t.racketRadius, t.racketTube, 8, t.segments).rotateX(Math.PI / 2),
		teamMaterial,
		t.racketX,
		t.racketY,
		0,
	)
	part(
		new THREE.CylinderGeometry(
			t.racketHandleRadius,
			t.racketHandleRadius,
			t.racketHandle,
			8,
		).rotateX(Math.PI / 2),
		ink,
		t.racketX,
		t.racketY,
		t.racketRadius + t.racketHandle / 2,
	)
	return {}
}
