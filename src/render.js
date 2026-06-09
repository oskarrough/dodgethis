import * as THREE from 'three'
import { tune } from './tune.js'

export function createRenderer() {
	const canvas = document.getElementById('app')
	const renderer = new THREE.WebGLRenderer({
		canvas,
		antialias: true,
		powerPreference: 'high-performance',
	})
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
	renderer.shadowMap.enabled = true

	const scene = new THREE.Scene()
	scene.background = new THREE.Color(0x0b0e14)
	scene.fog = new THREE.Fog(0x0b0e14, 30, 70)

	// Fixed isometric-ish camera looking down the court.
	const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200)
	const camBase = new THREE.Vector3(0, 22, 26)
	camera.position.copy(camBase)
	camera.lookAt(0, 0, 0)

	const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x202830, 0.8)
	scene.add(hemi)
	const sun = new THREE.DirectionalLight(0xffffff, 1.4)
	sun.position.set(10, 24, 12)
	sun.castShadow = true
	// Tighten the shadow frustum to the court's footprint (the old ±COURT.depth box
	// was ~4× too large, so most of the map covered empty space). A 15-unit half-
	// extent clears the 11×24 court's projected diagonal with margin; pairing that
	// with a 1024² map gives the same on-court sharpness as the old 2048² box while
	// rendering a quarter of the shadow texels each frame.
	const SHADOW_EXTENT = 15
	sun.shadow.camera.left = -SHADOW_EXTENT
	sun.shadow.camera.right = SHADOW_EXTENT
	sun.shadow.camera.top = SHADOW_EXTENT
	sun.shadow.camera.bottom = -SHADOW_EXTENT
	sun.shadow.camera.near = 1
	sun.shadow.camera.far = 70
	sun.shadow.mapSize.set(1024, 1024)
	scene.add(sun)

	function resize() {
		const w = window.innerWidth
		const h = window.innerHeight
		renderer.setSize(w, h, false)
		camera.aspect = w / h
		camera.updateProjectionMatrix()
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
	function updateCamera(dt) {
		// Common case: no active shake. Snap back to base once, then idle — no random
		// jitter or lookAt() matrix recompute on the (vast majority of) still frames.
		if (shake <= 0) {
			if (!settled) {
				camera.position.copy(camBase)
				camera.lookAt(0, 0, 0)
				settled = true
			}
			return
		}
		shake = Math.max(0, shake - dt * 2.5)
		const s = shake * shake * 0.7
		_o.set((Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s)
		camera.position.copy(camBase).add(_o)
		camera.lookAt(0, 0, 0)
	}

	return { renderer, scene, camera, addShake, updateCamera }
}
