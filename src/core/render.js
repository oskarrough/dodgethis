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

	let warned = false
	function invalid(inputs) {
		const bad = Object.entries(inputs).find(([, value]) => !Number.isFinite(value))
		if (!bad) return false
		if (!warned) {
			console.warn(`Camera kept its last good view: ${bad[0]} is non-finite`, bad[1])
			warned = true
		}
		return true
	}
	function resize() {
		// Size the drawing buffer from the canvas's CSS box, not window.innerWidth/Height.
		// On mobile, the CSS box (100vh = the LARGE viewport) diverges from innerHeight (the
		// visible viewport) while the URL bar is shown, so a window-sized buffer is stretched
		// to fill the CSS box. clientWidth/Height is the real box, whatever sized it (vw/dvh/fullscreen).
		const w = canvas.clientWidth
		const h = canvas.clientHeight
		// Hidden or minimised windows must not replace a usable projection with w / 0.
		if (invalid({ 'viewport.width': w, 'viewport.height': h }) || w <= 0 || h <= 0) return
		style.setSize(w, h)
		camera.aspect = w / h
		camera.updateProjectionMatrix()
		aimCamera.aspect = camera.aspect
		aimCamera.updateProjectionMatrix()
	}
	window.addEventListener('resize', resize)
	// A dvh change (the URL bar retracting) resizes the CSS box without a window resize event;
	// observing the element keeps the drawing buffer locked to its box.
	const resizeObserver = new ResizeObserver(resize)
	resizeObserver.observe(canvas)
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
		if (
			invalid({
				'frame.eye.x': eye.x,
				'frame.eye.y': eye.y,
				'frame.eye.z': eye.z,
				'frame.target.x': target.x,
				'frame.target.y': target.y,
				'frame.target.z': target.z,
				'frame.fov': fov,
			})
		)
			return
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
		if (invalid({ 'kick.amount': amount, 'camera.fovKick': tune.camera.fovKick })) return
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

	// --- Nudge: the whole view shoved along a world direction, on a critically damped spring, so you feel which way a blow went. ---
	const nudgeOffset = new THREE.Vector3()
	const nudgeVelocity = new THREE.Vector3()
	const _target = new THREE.Vector3()
	function nudge(direction, amount) {
		const l = Math.hypot(direction.x, direction.z)
		if (!tune.output.shake || !(l > 1e-6) || !(amount > 0)) return
		nudgeVelocity.x += (direction.x / l) * amount * 14
		nudgeVelocity.z += (direction.z / l) * amount * 14
		settled = false
	}
	function stepNudge(dt) {
		if (nudgeOffset.lengthSq() === 0 && nudgeVelocity.lengthSq() === 0) return false
		const k = 260
		const c = 2 * Math.sqrt(k)
		nudgeVelocity.x += (-k * nudgeOffset.x - c * nudgeVelocity.x) * dt
		nudgeVelocity.z += (-k * nudgeOffset.z - c * nudgeVelocity.z) * dt
		nudgeOffset.addScaledVector(nudgeVelocity, dt)
		if (nudgeOffset.lengthSq() < 1e-6 && nudgeVelocity.lengthSq() < 1e-4) {
			nudgeOffset.setScalar(0)
			nudgeVelocity.setScalar(0)
		}
		return true
	}

	function updateCamera(dt) {
		if (framers.length) applyFrame(framers.at(-1)(dt))
		if (!tune.output.shake) shake = 0
		const fovActive = stepFov(dt)
		const nudging = stepNudge(Math.min(dt, 0.05))
		// Common case: no active shake — snap back to base once, then idle with no jitter or lookAt() recompute.
		if (shake <= 0) {
			if (!settled) {
				camera.position.copy(camBase).add(nudgeOffset)
				camera.lookAt(_target.copy(lookAt).add(nudgeOffset))
				if (!fovActive && camera.fov !== baseFov) {
					camera.fov = baseFov
					camera.updateProjectionMatrix()
				}
				settled = !fovActive && !nudging
			}
			return
		}
		shake *= Math.exp(-tune.camera.shakeDecay * dt)
		if (shake < 0.01) shake = 0
		const s = shake * tune.camera.shakeAmount
		_o.set((Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s)
		camera.position.copy(camBase).add(_o).add(nudgeOffset)
		camera.lookAt(_target.copy(lookAt).add(nudgeOffset))
	}

	function render() {
		style.render(scene, camera)
	}
	// The styled scene from another camera into a render target, left linear (portal.js `draw`).
	function renderStyled(target, from) {
		style.render(scene, from, target)
	}

	function dispose() {
		window.removeEventListener('resize', resize)
		resizeObserver.disconnect()
		style.dispose()
	}

	return {
		renderer,
		scene,
		camera,
		aimCamera,
		addShake,
		kickFov,
		nudge,
		impactFrame: style.impactFrame,
		updateCamera,
		render,
		renderStyled,
		frame,
		dispose,
		setPalette: style.setPalette,
		setStylePreset: style.setStylePreset,
	}
}
