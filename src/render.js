import * as THREE from 'three'
import { tune } from './tune.js'
import { createStylePass } from './stylepass.js'

// Camera, framing and shake live here; materials live in stylepass.js. One rendering path — no direct-lit fallback.
export function createRenderer() {
	const canvas = document.querySelector('.app')
	const style = createStylePass(canvas)
	const renderer = style.renderer

	// No lights, no fog, no shadow map: the style pass derives shading from surface normals in one shader that also paints the sky.
	const scene = new THREE.Scene()

	// Fixed isometric-ish camera looking down the court.
	const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200)
	const camBase = new THREE.Vector3(0, 22, 26)
	camera.position.copy(camBase)
	camera.lookAt(0, 0, 0)
	const aimCamera = camera.clone() // never shaken: pointer rays stay gameplay-stable
	aimCamera.updateMatrixWorld(true)

	function resize() {
		const w = window.innerWidth
		const h = window.innerHeight
		style.setSize(w, h)
		camera.aspect = w / h
		camera.updateProjectionMatrix()
		aimCamera.aspect = camera.aspect
		aimCamera.updateProjectionMatrix()
	}
	window.addEventListener('resize', resize)
	resize()

	// --- Screenshake: a decaying energy that jitters the camera off its base. ---
	let shake = 0
	let settled = true // camera resting at camBase, no per-frame work needed
	const _o = new THREE.Vector3()
	function addShake(amount) {
		if (tune.fx.shake) {
			shake = Math.min(shake + amount, 1.5)
			settled = false
		}
	}

	// --- FOV kick: a critically damped spring on fov (base 50) that punches wide and settles in ~0.3 s. ---
	const baseFov = camera.fov
	const fovStiffness = 170
	const fovDamping = 2 * Math.sqrt(fovStiffness) // critical
	let fovOffset = 0
	let fovVelocity = 0
	function kickFov(amount) {
		fovOffset += amount * tune.camera.fovKick
		settled = false
	}
	// Return whether the spring is still moving; applies fov when it changed visibly.
	function stepFov(dt) {
		if (fovOffset === 0 && fovVelocity === 0) return false
		fovVelocity += (-fovStiffness * fovOffset - fovDamping * fovVelocity) * dt
		fovOffset += fovVelocity * dt
		if (Math.abs(fovOffset) < 0.005 && Math.abs(fovVelocity) < 0.05) {
			fovOffset = 0
			fovVelocity = 0
		}
		const fov = baseFov + fovOffset
		if (Math.abs(camera.fov - fov) > 0.01) {
			camera.fov = fov
			camera.updateProjectionMatrix()
		}
		return fovOffset !== 0
	}

	function updateCamera(dt) {
		if (!tune.fx.shake) shake = 0
		const fovActive = stepFov(dt)
		// Common case: no active shake — snap back to base once, then idle with no jitter or lookAt() recompute.
		if (shake <= 0) {
			if (!settled) {
				camera.position.copy(camBase)
				camera.lookAt(0, 0, 0)
				if (!fovActive && camera.fov !== baseFov) {
					camera.fov = baseFov
					camera.updateProjectionMatrix()
				}
				settled = !fovActive
			}
			return
		}
		shake *= Math.exp(-tune.camera.shakeDecay * dt)
		if (shake < 0.01) shake = 0
		const s = shake * tune.camera.shakeAmount
		_o.set((Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s)
		camera.position.copy(camBase).add(_o)
		camera.lookAt(0, 0, 0)
	}

	function render() {
		style.render(scene, camera)
	}

	function dispose() {
		window.removeEventListener('resize', resize)
		style.dispose()
	}

	return {
		renderer,
		scene,
		camera,
		aimCamera,
		addShake,
		kickFov,
		updateCamera,
		render,
		dispose,
		setPalette: style.setPalette,
	}
}
