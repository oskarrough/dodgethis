import * as THREE from 'three'
import { createStylePass } from '../src/core/stylepass.js'
import { initPhysics } from '../src/core/physics.js'
import { buildCourt } from '../src/plugins/dodgeball/court.js'
import { createPlayer } from '../src/plugins/dodgeball/unit.js'

const output = document.querySelector('#proof')
try {
	const pass = createStylePass(document.querySelector('canvas'))
	pass.setSize(256, 256)
	const scene = new THREE.Scene()
	const { RAPIER, world } = await initPhysics()
	buildCourt(scene, world, RAPIER)
	const hero = createPlayer(scene, world, RAPIER, { position: [0, 1, 5], isHuman: true })
	const enemy = createPlayer(scene, world, RAPIER, {
		position: [2, 1, -5],
		team: 'B',
		color: 0xff5d5d,
	})
	const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
	camera.position.set(0, 22, 26)
	camera.lookAt(0, 0, 0)
	const gl = pass.renderer.getContext()
	function pixels() {
		const bytes = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4)
		gl.readPixels(
			0,
			0,
			gl.drawingBufferWidth,
			gl.drawingBufferHeight,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			bytes,
		)
		return bytes
	}
	pass.render(scene, camera)
	const before = pixels()
	const restore = pass.setStylePreset({ line: 0.5, hatch: 1, alpha: true })
	pass.render(scene, camera)
	const front = pixels()
	restore()
	pass.render(scene, camera)
	const after = pixels()
	let changedBytes = 0
	let presetChangedBytes = 0
	for (let i = 0; i < before.length; i++) {
		if (before[i] !== after[i]) changedBytes++
		if (before[i] !== front[i]) presetChangedBytes++
	}
	window.stylePresetProof = {
		changedBytes,
		presetChangedBytes,
		frontCornerAlpha: front[3],
		defaultCornerAlpha: before[3],
		bytes: before.length,
		glError: gl.getError(),
	}
	hero.dispose()
	enemy.dispose()
	scene.traverse((object) => {
		object.geometry?.dispose()
		object.material?.dispose()
	})
	world.free()
	pass.dispose()
	output.textContent = JSON.stringify(window.stylePresetProof)
} catch (error) {
	window.stylePresetProof = { error: String(error) }
	output.textContent = String(error)
}
output.dataset.done = 'true'
