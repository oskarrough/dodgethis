import * as THREE from 'three'
import { makeStyleMaterial } from '../../../core/stylepass.js'
import { tune } from './tune.js'

// Costume on the presentation replica only; the match mannequin remains untouched.
export function dressPortrait(body) {
	const t = tune.portrait
	body.mesh.name = 'front-fletcher'
	body.visual.getObjectByName('shoes').visible = false
	body.visual.children.find((part) => part.geometry?.type === 'ConeGeometry').visible = false
	const blue = makeStyleMaterial('teamA')
	const cream = makeStyleMaterial('cream')
	const ink = makeStyleMaterial('ink', { flat: true })
	const parts = []
	function add(geometry, material, position) {
		const mesh = new THREE.Mesh(geometry, material)
		mesh.position.set(...position)
		body.visual.add(mesh)
		parts.push(mesh)
		return mesh
	}
	add(new THREE.ConeGeometry(t.hoodRadius, t.hoodHeight, 8), blue, [0, t.hoodY, 0])
	const brim = add(new THREE.CylinderGeometry(t.hoodRadius, t.hoodRadius, t.brimHeight, 8), cream, [
		0,
		t.brimY,
		-t.brimForward,
	])
	brim.rotation.x = t.brimTilt
	const quiver = add(
		new THREE.CylinderGeometry(t.quiverRadius, t.quiverRadius, t.quiverHeight, 8),
		ink,
		[t.quiverX, t.quiverY, t.quiverZ],
	)
	quiver.rotation.z = t.quiverTilt
	for (let i = 0; i < t.arrows; i++) {
		const x = t.quiverX + (i - (t.arrows - 1) / 2) * t.arrowSpacing
		add(new THREE.CylinderGeometry(t.arrowRadius, t.arrowRadius, t.arrowHeight, 4), cream, [
			x,
			t.arrowY,
			t.quiverZ,
		])
		add(new THREE.ConeGeometry(t.fletchingRadius, t.fletchingHeight, 4), cream, [
			x,
			t.arrowY + t.arrowHeight / 2,
			t.quiverZ,
		])
	}
	const curve = new THREE.QuadraticBezierCurve3(
		new THREE.Vector3(-t.bowBend, -t.bowHeight / 2, 0),
		new THREE.Vector3(t.bowBend, 0, 0),
		new THREE.Vector3(-t.bowBend, t.bowHeight / 2, 0),
	)
	const bow = new THREE.Group()
	bow.position.set(t.bowX, t.bowY, -t.bowForward)
	bow.rotation.y = t.bowTurn
	body.visual.add(bow)
	bow.add(add(new THREE.TubeGeometry(curve, 16, t.bowRadius, 4, false), ink, [0, 0, 0]))
	bow.add(
		add(new THREE.CylinderGeometry(t.stringRadius, t.stringRadius, t.bowHeight, 4), cream, [
			-t.bowBend,
			0,
			0,
		]),
	)
	return () => {
		bow.removeFromParent()
		for (const part of parts) {
			part.removeFromParent()
			part.geometry.dispose()
		}
		for (const material of [blue, cream, ink]) material.dispose()
	}
}
