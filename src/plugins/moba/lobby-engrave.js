import * as THREE from 'three'
import { PALETTE } from '../../core/style.js'
import { FORWARD_LAYER } from '../../core/stylepass.js'
import { tune } from './tune.js'

const INK = new THREE.Color(PALETTE.ink).getStyle()

// Words cut into the saucer's glaze like the grooves: an ink lip, a tan bed, a shadow under the lit
// top-left lip. One flat line per word, stacked down the left lip beside the hero strip, each
// starting `inset` inside the lip where its row meets it, so the words follow the saucer's curve.
export function engraveSaucer(parent) {
	const e = tune.lobby.strip.engrave,
		g = tune.lobby.flow.groove,
		floor = tune.lobby.floor
	const family =
		getComputedStyle(document.documentElement).getPropertyValue('--ui-font') || 'sans-serif'
	const px = 96,
		font = `${px}px ${family}`
	const shadow = new THREE.Color(g.bed).lerp(new THREE.Color(PALETTE.ink), g.shadow).getStyle()
	const owned = []
	let gone = false
	document.fonts.load(font).then(() => {
		if (gone) return
		e.lines.forEach((word, i) => {
			const canvas = carve(word.toUpperCase(), font, px, e.lip / e.size, shadow)
			const height = e.size * (canvas.height / px)
			const width = height * (canvas.width / canvas.height)
			const z = e.z + i * e.step
			const lip = -floor.halfX * Math.sqrt(Math.max(0, 1 - (z / floor.halfZ) ** 2))
			const map = new THREE.CanvasTexture(canvas)
			map.colorSpace = THREE.SRGBColorSpace
			const material = new THREE.MeshBasicMaterial({
				map,
				transparent: true,
				depthWrite: false,
				polygonOffset: true,
				polygonOffsetFactor: -2,
				polygonOffsetUnits: -8,
			})
			const geometry = new THREE.PlaneGeometry(width, height).rotateX(-Math.PI / 2)
			const mesh = new THREE.Mesh(geometry, material)
			mesh.position.set(lip + e.inset + width / 2, tune.map.printLayers.lobby, z)
			mesh.layers.set(FORWARD_LAYER)
			mesh.renderOrder = -1.75
			parent.add(mesh)
			owned.push(map, material, geometry)
		})
	})
	return {
		dispose() {
			gone = true
			for (const item of owned) item.dispose()
		},
	}
}

// The word on a transparent canvas: ink lip round the letters, then the bed, darkened along its
// top-left edges where the lip shades it.
function carve(text, font, px, lipShare, shadow) {
	const lip = Math.max(2, px * lipShare)
	const measure = document.createElement('canvas').getContext('2d')
	measure.font = font
	const pad = Math.ceil(lip * 2)
	const canvas = document.createElement('canvas')
	canvas.width = Math.ceil(measure.measureText(text).width) + pad * 2
	canvas.height = Math.ceil(px * 1.25) + pad * 2
	const write = (g, color, dx = 0, dy = 0) => {
		g.font = font
		g.textBaseline = 'middle'
		g.fillStyle = color
		g.fillText(text, pad + dx, canvas.height / 2 + dy)
	}
	const g = canvas.getContext('2d')
	g.font = font
	g.textBaseline = 'middle'
	g.lineJoin = 'round'
	g.lineWidth = lip * 2
	g.strokeStyle = INK
	g.strokeText(text, pad, canvas.height / 2)
	const bed = document.createElement('canvas')
	bed.width = canvas.width
	bed.height = canvas.height
	const b = bed.getContext('2d')
	write(b, shadow)
	b.globalCompositeOperation = 'source-atop'
	write(b, tune.lobby.flow.groove.bed, lip * 0.8, lip * 0.8)
	g.drawImage(bed, 0, 0)
	return canvas
}
