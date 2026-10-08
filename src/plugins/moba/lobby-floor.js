import * as THREE from 'three'
import { FORWARD_LAYER } from '../../core/stylepass.js'
import { tune } from './tune.js'

// The plaza's ground sheet: a tiling paper texture laid over the void's cream floor in the
// forward pass, so the deferred style pass keeps its ink and the props still stand on it.
const SIZE = 512

const line = (g, color, width, x0, y0, x1, y1) => {
	g.strokeStyle = color
	g.lineWidth = width
	g.beginPath()
	g.moveTo(x0, y0)
	g.lineTo(x1, y1)
	g.stroke()
}

function grid(g, { base, minor, major, minorWidth, majorWidth, cells = 5 }) {
	g.fillStyle = base
	g.fillRect(0, 0, SIZE, SIZE)
	const step = SIZE / cells
	for (let i = 0; i < cells; i++) {
		const p = i * step + (i ? 0 : majorWidth / 2)
		const [color, width] = i ? [minor, minorWidth] : [major, majorWidth]
		line(g, color, width, p, 0, p, SIZE)
		line(g, color, width, 0, p, SIZE, p)
	}
}

export function createLobbyFloor(scene, renderer) {
	const canvas = document.createElement('canvas')
	canvas.width = canvas.height = SIZE
	grid(canvas.getContext('2d'), {
		base: '#fbf8ec',
		minor: '#c9dcea',
		major: '#8fb4d2',
		minorWidth: 2,
		majorWidth: 4,
	})
	const texture = new THREE.CanvasTexture(canvas)
	texture.colorSpace = THREE.SRGBColorSpace
	texture.wrapS = texture.wrapT = THREE.RepeatWrapping
	texture.anisotropy = renderer?.capabilities.getMaxAnisotropy() ?? 1
	const size = tune.lobby.floor.size
	texture.repeat.set(size / 2.5, size / 2.5)
	const geometry = new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2)
	const material = new THREE.MeshBasicMaterial({
		map: texture,
		depthWrite: false,
		// The forward pass tests against a copied depth buffer; pull the sheet onto the floor.
		polygonOffset: true,
		polygonOffsetFactor: -2,
		polygonOffsetUnits: -8,
	})
	const mesh = new THREE.Mesh(geometry, material)
	mesh.name = 'lobby-floor'
	mesh.position.y = tune.map.printLayers.plaza
	mesh.layers.set(FORWARD_LAYER)
	mesh.renderOrder = -2 // under stamps and every other forward effect
	scene.add(mesh)
	return {
		dispose() {
			mesh.removeFromParent()
			geometry.dispose()
			material.dispose()
			texture.dispose()
		},
	}
}
