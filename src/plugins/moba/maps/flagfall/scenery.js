import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { glowTexture } from '../../isle.js'

// Flagfall by night: a big moon low in the void, a garden at the rim, specks in the dark.
// isle.js calls it with its own helpers; every mesh goes through `forward`, so the isle disposes it.
export function scenery(isle) {
	const { s, own, forward, shared, stone, outline, outward, count, around, rand } = isle
	const glow = (hex, size, opacity, at, soft = 0.5) => {
		const sprite = new THREE.Sprite(
			own(
				new THREE.SpriteMaterial({
					map: own(glowTexture(soft)),
					color: hex,
					transparent: true,
					opacity,
					blending: THREE.AdditiveBlending,
					depthWrite: false,
				}),
			),
		)
		sprite.scale.setScalar(size)
		sprite.position.copy(at)
		return sprite
	}
	if (s.moon) {
		const mo = s.moon
		const at = new THREE.Vector3(...mo.at)
		const disc = new THREE.Sprite(
			own(new THREE.SpriteMaterial({ map: own(moonTexture(mo)), depthWrite: false, fog: false })),
		)
		disc.scale.setScalar(mo.size)
		disc.position.copy(at)
		forward(disc, 'flagfall-moon').renderOrder = -6
		forward(glow(mo.halo, mo.size * mo.haloScale, mo.haloOpacity, at, 0), 'flagfall-moon-halo')
	}
	if (s.garden) {
		const g = s.garden
		const leaves = { positions: [], normals: [], stones: [] }
		const bells = []
		const add = (geometry) => {
			const flat = geometry.toNonIndexed()
			geometry.dispose()
			flat.computeVertexNormals()
			const p = flat.attributes.position,
				n = flat.attributes.normal
			for (let v = 0; v < p.count; v++) {
				leaves.positions.push(p.getX(v), p.getY(v), p.getZ(v))
				leaves.normals.push(n.getX(v), n.getY(v), n.getZ(v))
				leaves.stones.push(1, 0)
			}
			flat.dispose()
		}
		// A pointed leaf, base at the origin, growing along +y.
		const leafShape = new THREE.Shape()
		leafShape.moveTo(0, 0)
		leafShape.quadraticCurveTo(0.5, 0.45, 0, 1)
		leafShape.quadraticCurveTo(-0.5, 0.45, 0, 0)
		const specks = []
		for (let i = 0; i < count; i += g.every) {
			if (rand() > g.chance) continue
			const o = outward[i]
			const north = o.z < -0.5
			const reach = 0.25 + rand() * 0.5
			const root = new THREE.Vector3(
				outline[i].x + o.x * reach,
				s.groundY - g.sink,
				outline[i].z + o.z * reach,
			)
			const facing = Math.atan2(o.x, o.z)
			const tall = north ? g.tall : g.low
			for (let k = 0; k < g.leaves; k++) {
				const length = g.leaf[0] + rand() * (g.leaf[1] - g.leaf[0])
				const yaw = facing + (rand() - 0.5) * 2.1
				// Lean out over the drop; only the far rim's plants stand up past the court.
				const lean = Math.PI / 2 - Math.asin(Math.min(1, tall / length)) * (0.5 + rand() * 0.5)
				add(
					new THREE.ShapeGeometry(leafShape, 3)
						.scale(length * g.width, length, 1)
						.rotateX(lean)
						.rotateY(yaw)
						.translate(root.x, root.y, root.z),
				)
			}
			for (let k = 0; k < g.bells; k++) {
				// A bell hangs from an arching stem, mouth down, with a cream glow in its throat.
				const yaw = facing + (rand() - 0.5) * 1.6
				const out = 0.5 + rand() * 0.9
				const tip = new THREE.Vector3(
					root.x + Math.sin(yaw) * out,
					root.y + (north ? g.tall * 0.6 : 0.1) + rand() * 0.3,
					root.z + Math.cos(yaw) * out,
				)
				const size = g.bell * (0.75 + rand() * 0.5)
				bells.push(
					new THREE.CylinderGeometry(size * 0.25, size, size * 1.3, 7, 1, true).translate(
						tip.x,
						tip.y - size * 0.75,
						tip.z,
					),
					new THREE.CylinderGeometry(0.02, 0.03, tip.distanceTo(root), 4)
						.translate(0, tip.distanceTo(root) / 2, 0)
						.applyQuaternion(
							new THREE.Quaternion().setFromUnitVectors(
								new THREE.Vector3(0, 1, 0),
								tip.clone().sub(root).normalize(),
							),
						)
						.translate(root.x, root.y, root.z),
				)
				specks.push(new THREE.Vector3(tip.x, tip.y - size * 1.3, tip.z))
			}
		}
		const leafGeometry = own(new THREE.BufferGeometry())
		leafGeometry.setAttribute('position', new THREE.Float32BufferAttribute(leaves.positions, 3))
		leafGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(leaves.normals, 3))
		leafGeometry.setAttribute('stone', new THREE.Float32BufferAttribute(leaves.stones, 2))
		const leafMaterial = own(stone.clone())
		leafMaterial.uniforms = { ...stone.uniforms, ...shared }
		leafMaterial.side = THREE.DoubleSide
		forward(new THREE.Mesh(leafGeometry, leafMaterial), 'flagfall-garden-leaves')
		if (bells.length) {
			const merged = own(mergeGeometries(bells))
			for (const b of bells) b.dispose()
			const petal = own(new THREE.MeshBasicMaterial({ color: g.flower, side: THREE.DoubleSide }))
			forward(new THREE.Mesh(merged, petal), 'flagfall-garden-bells')
		}
		for (const at of specks) {
			forward(glow(g.glow, g.glowSize, 0.9, at, 0.15), 'flagfall-stamen')
			forward(glow(g.glow, g.glowSize * g.glowHalo, g.glowHaloOpacity, at), 'flagfall-stamen-halo')
		}
	}
	if (s.specks) {
		const k = s.specks
		const points = []
		for (let i = 0; i < k.count; i++) {
			const spot = around(k.near + rand() * (k.far - k.near))
			points.push(spot.x, k.y[0] + rand() * (k.y[1] - k.y[0]), spot.z)
		}
		const geometry = own(new THREE.BufferGeometry())
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
		const material = own(
			new THREE.PointsMaterial({
				color: k.color,
				size: k.size,
				map: own(glowTexture(0.2)),
				transparent: true,
				blending: THREE.AdditiveBlending,
				depthWrite: false,
			}),
		)
		forward(new THREE.Points(geometry, material), 'flagfall-specks')
	}
}

function moonTexture(m) {
	const size = 256
	const canvas = document.createElement('canvas')
	canvas.width = canvas.height = size
	const ctx = canvas.getContext('2d')
	const r = size / 2 - 3
	ctx.beginPath()
	ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2)
	ctx.fillStyle = m.color
	ctx.fill()
	ctx.save()
	ctx.clip()
	ctx.fillStyle = m.seas
	for (const [x, y, rr] of [
		[0.38, 0.36, 0.16],
		[0.6, 0.55, 0.12],
		[0.45, 0.7, 0.09],
		[0.7, 0.3, 0.06],
	]) {
		ctx.beginPath()
		ctx.arc(x * size, y * size, rr * size, 0, Math.PI * 2)
		ctx.fill()
	}
	ctx.restore()
	ctx.lineWidth = 2.5
	ctx.strokeStyle = m.ink
	ctx.beginPath()
	ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2)
	ctx.stroke()
	const texture = new THREE.CanvasTexture(canvas)
	texture.colorSpace = THREE.SRGBColorSpace
	return texture
}
