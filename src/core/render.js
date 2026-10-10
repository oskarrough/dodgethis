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

	let shake = 0
	let settled = true // camera resting at camBase, no per-frame work needed
	const _o = new THREE.Vector3()
	function addShake(amount) {
		if (tune.output.shake) {
			shake = Math.min(shake + amount, 1.5)
			settled = false
		}
	}

	// --- Framing: a mode may supply `frame(dt) → { eye, target, fov? }`. Both cameras follow it; only the view shakes and kicks. ---
	const DEFAULT_FOV = camera.fov
	const lookAt = new THREE.Vector3()
	const framers = []
	function frame(fn) {
		framers.push(fn)
		return () => {
			const i = framers.indexOf(fn)
			if (i < 0) return
			framers.splice(i, 1)
			if (!framers.length)
				applyFrame({ eye: DEFAULT_EYE, target: DEFAULT_TARGET, fov: DEFAULT_FOV })
		}
	}
	const DEFAULT_EYE = camBase.clone()
	const DEFAULT_TARGET = new THREE.Vector3()
	function applyFrame({ eye, target, fov = DEFAULT_FOV }) {
		camBase.copy(eye)
		lookAt.copy(target)
		aimCamera.position.copy(eye)
		aimCamera.lookAt(lookAt)
		if (aimCamera.fov !== fov) {
			aimCamera.fov = fov
			aimCamera.updateProjectionMatrix()
		}
		aimCamera.updateMatrixWorld(true)
		baseFov = fov
		settled = false
	}

	// --- FOV kick: a critically damped spring on fov (base 50) that punches wide and settles in ~0.3 s. ---
	let baseFov = camera.fov
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
		if (framers.length) applyFrame(framers.at(-1)(dt))
		if (!tune.output.shake) shake = 0
		const fovActive = stepFov(dt)
		// Common case: no active shake — snap back to base once, then idle with no jitter or lookAt() recompute.
		if (shake <= 0) {
			if (!settled) {
				camera.position.copy(camBase)
				camera.lookAt(lookAt)
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
		camera.lookAt(lookAt)
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
		frame,
		dispose,
		setPalette: style.setPalette,
		setStylePreset: style.setStylePreset,
	}
}
