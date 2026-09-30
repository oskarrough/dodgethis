import * as THREE from 'three'
import { createStylePass } from '../src/core/stylepass.js'
import { createBody } from '../src/core/body.js'
import { dressHero } from '../src/plugins/moba/hero-view.js'
import { HEROES } from '../src/plugins/moba/heroes.js'
import { tune } from '../src/plugins/moba/tune.js'

const camera = new THREE.PerspectiveCamera(tune.follow.fov, 1, 0.1, 100)
camera.position.set(0, tune.follow.height, tune.follow.back)
camera.lookAt(0, 0, 0)
camera.updateMatrixWorld(true)
const report = []
function projectedSpan(body) {
	const bounds = new THREE.Box3()
	body.mesh.traverseVisible((object) => {
		const vertices = object.geometry?.attributes.position
		if (!vertices) return
		for (let i = 0; i < vertices.count; i++)
			bounds.expandByPoint(
				new THREE.Vector3()
					.fromBufferAttribute(vertices, i)
					.applyMatrix4(object.matrixWorld)
					.project(camera),
			)
	})
	const size = bounds.getSize(new THREE.Vector3())
	return (Math.max(size.x, size.y) * tune.heroProof.canvas) / 2
}
for (const id of Object.keys(HEROES)) {
	const scene = new THREE.Scene()
	const body = createBody(scene, null, null, { profile: tune.hero, replica: true })
	const undress = dressHero(body, id)
	body.face({ x: 0, z: -1 })
	scene.updateMatrixWorld(true)
	// Calibrate ONCE using Fletcher, then leave eye, target and scale identical
	// for all four bodies. Pitch is exactly the lane's atan(height/back).
	if (id === 'fletcher') {
		camera.fov =
			(2 *
				Math.atan(
					(Math.tan((camera.fov * Math.PI) / 360) * projectedSpan(body)) / tune.heroProof.pixels,
				) *
				180) /
			Math.PI
		camera.updateProjectionMatrix()
	}
	for (const zoom of [false, true]) {
		const figure = document.createElement('figure'),
			canvas = document.createElement('canvas')
		if (zoom) canvas.className = 'zoom'
		const caption = document.createElement('figcaption')
		caption.textContent = `${id}${zoom ? ` ×${tune.heroProof.zoom}` : ' shared scale'}`
		figure.append(canvas, caption)
		document.querySelector('main').append(figure)
		const pass = createStylePass(canvas)
		pass.renderer.setPixelRatio(1)
		pass.setSize(tune.heroProof.canvas, tune.heroProof.canvas)
		pass.setPalette({ page: 0xfffdf4 })
		pass.render(scene, camera)
		report.push({
			id,
			zoom,
			projectedPixels: projectedSpan(body),
			referencePixels: tune.heroProof.pixels,
			pitch: (Math.atan2(tune.follow.height, tune.follow.back) * 180) / Math.PI,
			fov: camera.fov,
			glError: pass.renderer.getContext().getError(),
		})
	}
	undress()
	body.dispose()
}
window.silhouetteProof = report
