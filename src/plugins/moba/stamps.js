import * as THREE from 'three'
import { PALETTE } from '../../core/style.js'
import { FORWARD_LAYER } from '../../core/stylepass.js'
import { tune } from './tune.js'

// Rubber-stamp rulings printed flat on the lane ("OUT!"): slammed down from above, then left to fade, so the lane keeps a record.
// Local presentation only. Each print owns its material, so fading one never touches another.
export function createStamps(scene) {
	const group = new THREE.Group()
	group.name = 'moba-stamps'
	scene.add(group)
	const geometry = new THREE.PlaneGeometry(1, 0.5).rotateX(-Math.PI / 2)
	const textures = new Map() // `${text}|${team}` → CanvasTexture
	const stale = [] // drawn before the stamp font loaded; still in use, disposed with the view
	const font = `'Ranchers', 'Darumadrop One', system-ui, sans-serif`
	document.fonts?.load(`100px Ranchers`).then(
		() => {
			stale.push(...textures.values())
			textures.clear()
		},
		() => {},
	)

	const prints = Array.from({ length: tune.out.max }, () => {
		const material = new THREE.MeshBasicMaterial({
			transparent: true,
			depthWrite: false,
			opacity: 0,
			// The forward pass tests against a copied depth buffer too coarse for 4.5 cm; pull the print forward.
			polygonOffset: true,
			polygonOffsetFactor: -2,
			polygonOffsetUnits: -8,
			// The canvas composites over the page: blend colour, but only ever add coverage to alpha.
			blending: THREE.CustomBlending,
			blendSrc: THREE.SrcAlphaFactor,
			blendDst: THREE.OneMinusSrcAlphaFactor,
			blendSrcAlpha: THREE.OneFactor,
			blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
		})
		const mesh = new THREE.Mesh(geometry, material)
		mesh.name = 'moba-stamp'
		mesh.layers.set(FORWARD_LAYER)
		mesh.renderOrder = -1 // under corpses and other forward effects standing on it
		mesh.visible = false
		group.add(mesh)
		return { mesh, material, age: 0, landed: true, onLand: null }
	})
	let next = 0

	function texture(text, team) {
		const key = `${text}|${team}`
		let map = textures.get(key)
		if (map) return map
		const canvas = document.createElement('canvas')
		canvas.width = 512
		canvas.height = 256
		const g = canvas.getContext('2d')
		const colour = (value) => `#${value.toString(16).padStart(6, '0')}`
		const ink = colour(PALETTE.ink)
		const fill = colour(team === 'A' ? PALETTE.teamA : PALETTE.teamB)
		let size = 170
		g.font = `${size}px ${font}`
		const fit = 512 - 2 * 70
		size = Math.min(size, (size * fit) / Math.max(1, g.measureText(text).width))
		// Hard printed shadow in ink first, then the stamp in team colour on top.
		for (const [dx, colourOf] of [
			[8, ink],
			[0, fill],
		]) {
			g.save()
			g.translate(dx, dx)
			g.strokeStyle = colourOf
			g.fillStyle = colourOf
			g.lineWidth = 16
			g.beginPath()
			g.roundRect(18, 18, 512 - 44, 256 - 44, 34)
			g.stroke()
			g.lineWidth = 5
			g.beginPath()
			g.roundRect(42, 42, 512 - 92, 256 - 92, 18)
			g.stroke()
			g.font = `${size}px ${font}`
			g.textAlign = 'center'
			g.textBaseline = 'middle'
			g.fillText(text, 256 - 6, 128 - 4 + size * 0.06)
			g.restore()
		}
		// Rubber stamps never print solid: knock out a seeded scatter of specks.
		let seed = [...key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
		const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296
		g.globalCompositeOperation = 'destination-out'
		for (let i = 0; i < 160; i++) {
			g.beginPath()
			g.arc(random() * 512, random() * 256, 1 + random() * random() * 6, 0, Math.PI * 2)
			g.fill()
		}
		map = new THREE.CanvasTexture(canvas)
		map.anisotropy = 4
		map.colorSpace = THREE.SRGBColorSpace // the composition target is linear
		textures.set(key, map)
		return map
	}

	// `tilt` is −1..1 of tune.out.tilt; `onLand` runs once when the stamp hits the ground.
	function stamp(point, { text = 'OUT!', team = 'A', tilt = 0, onLand = null } = {}) {
		const p = prints[next]
		next = (next + 1) % prints.length
		p.material.map = texture(text, team)
		p.material.needsUpdate = true
		p.mesh.position.set(point.x, tune.out.stampY, point.z)
		p.mesh.rotation.y = (tilt * tune.out.tilt * Math.PI) / 180
		p.age = 0
		p.landed = false
		p.onLand = onLand
		p.mesh.visible = true
		pose(p)
	}

	function pose(p) {
		const { slam, slamScale, squish: give, width, opacity, life } = tune.out
		const k = Math.min(1, p.age / Math.max(1e-3, slam))
		const settle = Math.min(1, Math.max(0, (p.age - slam) / Math.max(1e-3, slam)))
		const squish = 1 - give * Math.sin(Math.PI * settle)
		p.mesh.scale.setScalar(width * (slamScale + (1 - slamScale) * k * k) * squish)
		const hold = life * tune.out.hold
		const fade = p.age <= hold ? 1 : Math.max(0, 1 - (p.age - hold) / Math.max(1e-3, life - hold))
		p.material.opacity = opacity * (0.55 + 0.45 * k) * fade
	}

	function update(dt) {
		dt = Math.min(Math.max(dt, 0), 0.1)
		for (const p of prints) {
			if (!p.mesh.visible) continue
			p.age += dt
			if (!p.landed && p.age >= tune.out.slam) {
				p.landed = true
				p.onLand?.(p.mesh.position)
				p.onLand = null
			}
			pose(p)
			if (p.age >= tune.out.life) p.mesh.visible = false
		}
	}

	function reset() {
		for (const p of prints) {
			p.mesh.visible = false
			p.onLand = null
			p.landed = true
		}
	}

	function dispose() {
		reset()
		scene.remove(group)
		geometry.dispose()
		for (const p of prints) p.material.dispose()
		for (const map of [...textures.values(), ...stale]) map.dispose()
	}

	return { stamp, update, reset, dispose }
}
