import * as THREE from 'three'
import { createStylePass } from '../src/core/stylepass.js'
import { createBody } from '../src/core/body.js'
import { dressHero } from '../src/plugins/moba/hero-view.js'
import { HEROES } from '../src/plugins/moba/heroes.js'
import { tune } from '../src/plugins/moba/tune.js'

const report = []
for (const id of Object.keys(HEROES)) {
	const scene = new THREE.Scene()
	const body = createBody(scene, null, null, { profile: tune.hero, replica: true })
	const undress = dressHero(body, id)
	body.face({ x: 0, z: -1 })
	scene.updateMatrixWorld(true)
	const bounds = new THREE.Box3()
	body.mesh.traverseVisible((object) => {
		if (!object.geometry) return
		object.geometry.computeBoundingBox()
		bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld))
	})
	const center = bounds.getCenter(new THREE.Vector3())
	const size = bounds.getSize(new THREE.Vector3())
	const span = Math.max(size.x, size.z)
	const half = span * 2
	const camera = new THREE.PerspectiveCamera(
		(2 * Math.atan(half / 20) * 180) / Math.PI,
		1,
		0.1,
		100,
	)
	camera.position.set(center.x, 20, center.z)
	camera.up.set(0, 0, -1)
	camera.lookAt(center.x, 0, center.z)
	camera.updateMatrixWorld(true)
	function projectedSpan() {
		const projected = new THREE.Box3()
		body.mesh.traverseVisible((object) => {
			const vertices = object.geometry?.attributes.position
			if (!vertices) return
			for (let i = 0; i < vertices.count; i++)
				projected.expandByPoint(
					new THREE.Vector3()
						.fromBufferAttribute(vertices, i)
						.applyMatrix4(object.matrixWorld)
						.project(camera),
				)
		})
		const size = projected.getSize(new THREE.Vector3())
		return Math.max(size.x, size.y) * 40
	}
	camera.fov =
		(2 * Math.atan((Math.tan((camera.fov * Math.PI) / 360) * projectedSpan()) / 20) * 180) / Math.PI
	camera.updateProjectionMatrix()
	for (const zoom of [false, true]) {
		const figure = document.createElement('figure')
		const canvas = document.createElement('canvas')
		if (zoom) canvas.className = 'zoom'
		const caption = document.createElement('figcaption')
		caption.textContent = `${id}${zoom ? ' ×4' : ' 20 px'}`
		figure.append(canvas, caption)
		document.querySelector('main').append(figure)
		const pass = createStylePass(canvas)
		pass.renderer.setPixelRatio(1)
		pass.setSize(80, 80)
		pass.setPalette({ page: 0xfffdf4 })
		pass.render(scene, camera)
		report.push({
			id,
			zoom,
			projectedPixels: projectedSpan(),
			glError: pass.renderer.getContext().getError(),
		})
	}
	undress()
	body.dispose()
}
window.silhouetteProof = report
