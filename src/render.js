import * as THREE from 'three'
import { COURT } from './court.js'
import { tune } from './debug.js'

export function createRenderer() {
	const canvas = document.getElementById('app')
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
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
	sun.shadow.camera.left = -COURT.depth
	sun.shadow.camera.right = COURT.depth
	sun.shadow.camera.top = COURT.depth
	sun.shadow.camera.bottom = -COURT.depth
	sun.shadow.mapSize.set(2048, 2048)
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
	const _o = new THREE.Vector3()
	function addShake(amount) {
		if (tune.fx.shake) shake = Math.min(shake + amount, 1.5)
	}
	function updateCamera(dt) {
		shake = Math.max(0, shake - dt * 2.5)
		const s = shake * shake * 0.7
		_o.set((Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s)
		camera.position.copy(camBase).add(_o)
		camera.lookAt(0, 0, 0)
	}

	return { renderer, scene, camera, addShake, updateCamera }
}
