import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { PALETTE } from '../../core/style.js'
import { FORWARD_LAYER } from '../../core/stylepass.js'
import { tune } from './tune.js'

// Normalised artwork: open, ink-edged ring and a compact X. Only a short arc carries team colour.
function symbolGeometry(team) {
	const cross = new THREE.Shape()
	const points = [
		[-0.17, -0.22],
		[0, -0.05],
		[0.17, -0.22],
		[0.22, -0.17],
		[0.05, 0],
		[0.22, 0.17],
		[0.17, 0.22],
		[0, 0.05],
		[-0.17, 0.22],
		[-0.22, 0.17],
		[-0.05, 0],
		[-0.22, -0.17],
	]
	cross.moveTo(...points[0])
	for (const point of points.slice(1)) cross.lineTo(...point)
	cross.closePath()
	const arc = Math.PI / 3
	const parts = [
		[new THREE.RingGeometry(0.43, 0.46, 64), PALETTE.ink],
		[new THREE.RingGeometry(0.36, 0.39, 64), PALETTE.ink],
		[new THREE.RingGeometry(0.39, 0.43, 64, 1, arc, Math.PI * 2 - arc), PALETTE.cream],
		[new THREE.RingGeometry(0.39, 0.43, 12, 1, 0, arc), team],
		[new THREE.ShapeGeometry(cross), PALETTE.ink],
	].map(([geometry, colour]) => {
		const color = new THREE.Color(colour)
		const colors = new Float32Array(geometry.attributes.position.count * 3)
		for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i)
		geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
		return geometry
	})
	const geometry = mergeGeometries(parts).rotateX(-Math.PI / 2)
	for (const part of parts) part.dispose()
	return geometry
}

// Local presentation only; geometry is shared, but every pooled print owns its fade channel.
export function createStamps(scene) {
	const group = new THREE.Group()
	group.name = 'moba-stamps'
	scene.add(group)
	const geometries = { A: symbolGeometry(PALETTE.teamA), B: symbolGeometry(PALETTE.teamB) }
	const prints = Array.from({ length: Math.max(1, Math.floor(tune.out.max)) }, () => {
		const material = new THREE.MeshBasicMaterial({
			vertexColors: true,
			transparent: true,
			depthWrite: false,
			opacity: 0,
			// The forward depth copy is too coarse for this print height; pull the print forward.
			polygonOffset: true,
			polygonOffsetFactor: -2,
			polygonOffsetUnits: -8,
			// Blend colour, but only add coverage to the composition target's alpha.
			blending: THREE.CustomBlending,
			blendSrc: THREE.SrcAlphaFactor,
			blendDst: THREE.OneMinusSrcAlphaFactor,
			blendSrcAlpha: THREE.OneFactor,
			blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
		})
		const mesh = new THREE.Mesh(geometries.A, material)
		mesh.name = 'moba-stamp'
		mesh.layers.set(FORWARD_LAYER)
		mesh.renderOrder = -1 // under corpses and other forward effects
		mesh.visible = false
		group.add(mesh)
		return { mesh, material, age: 0, landed: true, onLand: null }
	})
	let next = 0
	let disposed = false

	// Legacy `text` options remain accepted, but never affect the symbol or allocate resources.
	// `tilt` is −1..1 of tune.out.tilt; `onLand` runs once when the print settles.
	function stamp(point, { team = 'A', tilt = 0, onLand = null } = {}) {
		if (disposed) return
		const p = prints[next]
		next = (next + 1) % prints.length
		p.mesh.geometry = geometries[team === 'A' ? 'A' : 'B']
		p.mesh.position.set(point.x, tune.out.stampY, point.z)
		p.mesh.rotation.y = (Math.max(-1, Math.min(1, tilt)) * tune.out.tilt * Math.PI) / 180
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
		if (disposed) return
		dt = Math.min(Math.max(dt, 0), 0.1)
		for (const p of prints) {
			if (!p.mesh.visible) continue
			p.age += dt
			if (!p.landed && p.age >= tune.out.slam) {
				p.landed = true
				const onLand = p.onLand
				p.onLand = null
				onLand?.(p.mesh.position)
			}
			pose(p)
			if (p.age >= tune.out.life) p.mesh.visible = false
		}
	}

	function reset() {
		next = 0
		for (const p of prints) {
			p.mesh.visible = false
			p.material.opacity = 0
			p.age = 0
			p.onLand = null
			p.landed = true
		}
	}

	function dispose() {
		if (disposed) return
		disposed = true
		reset()
		scene.remove(group)
		for (const geometry of Object.values(geometries)) geometry.dispose()
		for (const p of prints) p.material.dispose()
		group.clear()
	}

	return { stamp, update, reset, dispose }
}
