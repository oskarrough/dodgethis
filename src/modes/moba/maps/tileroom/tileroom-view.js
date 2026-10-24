import * as THREE from 'three'
import { FORWARD_LAYER } from '../../../../core/stylepass.js'
import { tune } from '../../tune.js'
import { createMatchTerrain } from '../../match-terrain.js'
import { createFloorPrint } from '../../floor-print.js'

// The tile room's ground: Overthrow's isle, with floor swatches printed over its court, each
// one a different floor from floor-print.js beside a wall and a pillar.
export function ground(scope) {
	const { layout, terrain, m, group, chalkLayout, owned, isleScenery } = scope
	const s = tune.tileroom
	const casts = { hedge: m.hedgeHeight, wall: m.wallHeight, pillar: m.pillarHeight + m.capHeight }
	const unterrain = createMatchTerrain(group, layout, terrain, chalkLayout, {
		scenery: isleScenery,
		casts,
	})
	const own = (resource) => {
		owned.push(resource)
		return resource
	}
	const floors = createFloorPrint({ layout, terrain, casts, look: s, own })
	const drops = []
	for (const w of s.swatches) {
		const { mesh, tile } = floors.sheet(w, s.swatchHalfX, s.swatchHalfZ)
		group.add(mesh)
		if (w.drop) drops.push(tile)
		const tag = label(w.name, s.label.height, own)
		if (tag) {
			tag.position.set(w.x, terrain.groundY + 0.008, w.z - s.swatchHalfZ - s.label.z)
			group.add(tag)
		}
	}
	// The swatch marked `drop` takes any image dropped onto the game, so a tile fresh from the
	// image model is judged in seconds.
	const over = (event) => event.preventDefault()
	const drop = (event) => {
		const file = [...(event.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'))
		if (!file || !drops.length) return
		event.preventDefault()
		const url = URL.createObjectURL(file)
		for (const tile of drops) tile.load(url, () => URL.revokeObjectURL(url))
	}
	if (typeof window !== 'undefined') {
		window.addEventListener('dragover', over)
		window.addEventListener('drop', drop)
	}
	const dispose = () => {
		if (typeof window !== 'undefined') {
			window.removeEventListener('dragover', over)
			window.removeEventListener('drop', drop)
		}
		floors.dispose()
		unterrain?.()
	}
	dispose.update = (dt) => {
		floors.update(dt)
		unterrain?.update?.(dt)
	}
	return dispose
}

// The swatch's name, inked on the floor in front of it. A lab, so words are allowed here.
function label(text, height, own) {
	if (typeof document === 'undefined') return null
	const canvas = document.createElement('canvas')
	canvas.width = 1024
	canvas.height = 128
	const ctx = canvas.getContext('2d')
	ctx.font = '800 84px Sniglet, Josefin Sans, sans-serif'
	ctx.fillStyle = '#26445f'
	ctx.textAlign = 'center'
	ctx.textBaseline = 'middle'
	ctx.fillText(text, 512, 68)
	const texture = own(new THREE.CanvasTexture(canvas))
	texture.colorSpace = THREE.SRGBColorSpace
	const material = own(
		new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
	)
	const mesh = new THREE.Mesh(
		own(new THREE.PlaneGeometry(height * 8, height).rotateX(-Math.PI / 2)),
		material,
	)
	mesh.layers.set(FORWARD_LAYER)
	mesh.renderOrder = -3.2
	return mesh
}
