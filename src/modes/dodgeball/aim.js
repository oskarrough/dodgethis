import * as THREE from 'three'
import { makeStyleMaterial, FORWARD_LAYER } from '../../core/stylepass.js'
import { PALETTE } from '../../core/style.js'
import { clampArrowLanding, projectArrowFlight } from './arrow.js'
import { TRAIL } from './weapons.js'
import { createAimLine } from './aimline.js'

const PREVIEW_N = 32

// The human's aim preview: flight arc or ground line, the touchdown dot, and the hollow cursor ring. `canvas` hides its cursor while the ring stands in.
export function createAimPreview(scene, canvas) {
	// Back the landing reticle's ammo yellow with ink so it reads against the similarly valued green court.
	const aimMarker = new THREE.Mesh(
		new THREE.RingGeometry(0.26, 0.38, 24),
		new THREE.MeshBasicMaterial({ color: PALETTE.ammo, transparent: true, depthWrite: false }),
	)
	aimMarker.layers.set(FORWARD_LAYER)
	aimMarker.rotation.x = -Math.PI / 2
	aimMarker.visible = false
	const markerInk = new THREE.Mesh(
		new THREE.RingGeometry(0.22, 0.42, 24),
		makeStyleMaterial('ink', { flat: true }),
	)
	markerInk.position.z = -0.01 // the parent's local -z is world down once rotated
	aimMarker.add(markerInk)
	scene.add(aimMarker)

	// The hollow cursor is the requested target; the solid dot is actual touchdown.
	const targetMarker = aimMarker.clone(true)
	targetMarker.material = aimMarker.material.clone()
	scene.add(targetMarker)
	aimMarker.geometry = new THREE.CircleGeometry(0.14, 24)
	markerInk.geometry = new THREE.CircleGeometry(0.2, 24)

	const previewPos = new Float32Array(PREVIEW_N * 3)
	const previewDistance = new Float32Array(PREVIEW_N)
	const previewHeight = new Float32Array(PREVIEW_N)
	const preview = createAimLine(scene, { samples: PREVIEW_N })

	function hide() {
		canvas.style.cursor = ''
		preview.hide()
		aimMarker.visible = false
		targetMarker.visible = false
	}

	// Share damped flight and the projectile's court clamp so preview endpoint, marker and grounded ammo agree.
	function arc(hand, dir, speed, color) {
		const distance = projectArrowFlight(speed, hand.y, previewDistance, previewHeight)
		if (distance === null) {
			hide()
			return
		}
		for (let i = 0; i < PREVIEW_N; i++) {
			previewPos[i * 3] = hand.x + dir.x * previewDistance[i]
			previewPos[i * 3 + 1] = previewHeight[i]
			previewPos[i * 3 + 2] = hand.z + dir.z * previewDistance[i]
		}
		const landing = clampArrowLanding(hand.x + dir.x * distance, hand.z + dir.z * distance)
		previewPos[(PREVIEW_N - 1) * 3] = landing.x
		previewPos[(PREVIEW_N - 1) * 3 + 1] = 0.03
		previewPos[(PREVIEW_N - 1) * 3 + 2] = landing.z
		preview.update(previewPos, dir, color)
		aimMarker.position.set(landing.x, 0.03, landing.z)
		aimMarker.visible = true
	}

	// Bowls stop through live physics, so their flat range guide deliberately has no landing marker.
	function ground(hand, dir) {
		const len = 7
		for (let i = 0; i < PREVIEW_N; i++) {
			const t = i / (PREVIEW_N - 1)
			previewPos[i * 3] = hand.x + dir.x * len * t
			previewPos[i * 3 + 1] = 0.05
			previewPos[i * 3 + 2] = hand.z + dir.z * len * t
		}
		preview.update(previewPos, dir, TRAIL.bowl)
		aimMarker.visible = false
	}

	// The cursor ring lights up when the arc actually lands on it.
	function target(point, perfect) {
		targetMarker.position.set(point.x, 0.04, point.z)
		targetMarker.visible = true
		// Canvas only: HUD buttons and overlays retain their normal pointers.
		canvas.style.cursor = 'none'
		const onTarget =
			aimMarker.visible &&
			Math.hypot(aimMarker.position.x - point.x, aimMarker.position.z - point.z) < 0.3
		targetMarker.material.color.set(
			onTarget ? (perfect ? TRAIL.perfect : PALETTE.ammo) : PALETTE.cream,
		)
	}

	function untarget() {
		targetMarker.visible = false
		canvas.style.cursor = ''
	}

	return { hide, arc, ground, target, untarget }
}
