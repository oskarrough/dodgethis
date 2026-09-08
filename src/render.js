import * as THREE from 'three'
import { tune } from './tune.js'

export function createRenderer() {
	const canvas = document.querySelector('.app')
	const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
	const renderer = new THREE.WebGLRenderer({
		canvas,
		antialias: true,
		powerPreference: 'high-performance',
	})
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
	renderer.shadowMap.enabled = true

	const bg =
		getComputedStyle(document.documentElement).getPropertyValue('--page-bg').trim() || '#8fd7ff'
	renderer.setClearColor(bg)

	const scene = new THREE.Scene()
	scene.background = new THREE.Color(bg)
	scene.fog = new THREE.Fog(bg, 45, 90)

	// Fixed isometric-ish camera looking down the court.
	const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200)
	const camBase = new THREE.Vector3(0, 22, 26)
	camera.position.copy(camBase)
	camera.lookAt(0, 0, 0)
	const aimCamera = camera.clone() // never shaken: pointer rays stay gameplay-stable
	aimCamera.updateMatrixWorld(true)

	const hemi = new THREE.HemisphereLight(0xffffff, 0x8bd67a, 1.05)
	scene.add(hemi)
	const sun = new THREE.DirectionalLight(0xfff0b8, 1.7)
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
		if (reduceMotion.matches) {
			shake = 0
			return
		}
		if (tune.fx.shake) {
			shake = Math.min(shake + amount, 1.5)
			settled = false
		}
	}
	function updateCamera(dt) {
		if (reduceMotion.matches || !tune.fx.shake) shake = 0
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

	return { renderer, scene, camera, aimCamera, addShake, updateCamera }
}
