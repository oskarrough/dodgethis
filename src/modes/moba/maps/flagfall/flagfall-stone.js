import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { tune } from '../../tune.js'
import { carvedWalls, flowerPanel, lichenClump, sandstone } from '../../carve.js'

function stoneRandom() {
	let seed = 0
	return () => {
		const n = Math.sin(++seed * 12.9898 + 4.1) * 43758.5453
		return n - Math.floor(n)
	}
}

function wallStone(boxes, height, scale, print, material, kerb = false) {
	const c = { ...tune.flagfall.carving }
	for (const key of [
		'blockWidth',
		'joint',
		'bevel',
		'chip',
		'footHeight',
		'capHeight',
		'capStep',
		'faceInset',
		'panelBorder',
		'panelGap',
		'relief',
		'mossHeight',
		'mossReach',
		'mossDrop',
	])
		c[key] *= scale
	if (kerb)
		Object.assign(c, {
			blockWidth: 1.1 * scale,
			mossHeight: 0.035 * scale,
			footHeight: 0.06 * scale,
			capHeight: 0.08 * scale,
			faceInset: 0.05 * scale,
			panelGap: 0.025 * scale,
			panelBorder: 0.03 * scale,
			relief: 0.04 * scale,
			mossReach: 0.13 * scale,
			mossChance: 0.08,
			mossDrop: 0.16 * scale,
		})
	const rand = stoneRandom()
	const { stone, moss } = carvedWalls(boxes, () => height, c, rand)
	const relief = []
	const tops = []
	if (stone) {
		const positions = [[], []],
			normals = [[], []]
		const p = stone.attributes.position,
			n = stone.attributes.normal
		for (let i = 0; i < p.count; i += 3) {
			const band = n.getY(i) > 0.5 ? 1 : 0
			for (let v = i; v < i + 3; v++) {
				positions[band].push(p.getX(v), p.getY(v), p.getZ(v))
				normals[band].push(n.getX(v), n.getY(v), n.getZ(v))
			}
		}
		for (let band = 0; band < 2; band++) {
			const geometry = new THREE.BufferGeometry()
			geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions[band], 3))
			geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals[band], 3))
			;(band ? tops : relief).push(geometry)
		}
		stone.dispose()
	}
	const rust = []
	for (const b of boxes) {
		const alongX = b.halfX >= b.halfZ
		const half = alongX ? b.halfX : b.halfZ
		const depth = alongX ? b.halfZ : b.halfX
		const count = Math.max(1, Math.ceil((half * 2) / c.blockWidth))
		for (let i = 0; i < count; i++) {
			const along = -half + ((i + 0.5) * half * 2) / count
			const x = b.x + (alongX ? along : 0),
				z = b.z + (alongX ? 0 : along)
			if (kerb)
				relief.push(
					flowerPanel(Math.min(depth * 0.78, 0.22 * scale), c.relief, c)
						.rotateX(-Math.PI / 2)
						.translate(x, height - c.relief, z),
				)
			const span = (half * 2) / count
			if (!kerb) {
				const width = (alongX ? span : depth * 2) - c.capStep * 2 - c.bevel * 2
				const length = (alongX ? depth * 2 : span) - c.capStep * 2 - c.bevel * 2
				for (const sign of [-1, 1]) {
					relief.push(
						sandstone(width * 0.84, c.joint * 0.4, c.joint * 0.5).translate(
							x,
							height - c.mossHeight,
							z + sign * length * 0.4,
						),
					)
					relief.push(
						sandstone(c.joint * 0.5, c.joint * 0.4, length * 0.8).translate(
							x + sign * width * 0.42,
							height - c.mossHeight,
							z,
						),
					)
				}
			}
			for (let patch = 0; patch < 3; patch++) {
				if (rand() > tune.flagfall.lichen.chance) continue
				const radius = Math.min(depth * 0.6, tune.flagfall.lichen.radius * scale)
				const geometry = lichenClump(radius, tune.flagfall.lichen, rand)
					.rotateX(patch ? 0.7 : 0)
					.translate(
						x + (alongX ? span * 0.35 + (rand() - 0.5) * radius : depth * 0.8),
						height - c.mossHeight - patch * radius * 0.6,
						z + (alongX ? depth * 0.8 : span * 0.35 + (rand() - 0.5) * radius),
					)
				const p = geometry.attributes.position
				for (let v = 0; v < p.count; v++)
					p.setXYZ(
						v,
						THREE.MathUtils.clamp(p.getX(v), b.x - b.halfX, b.x + b.halfX),
						THREE.MathUtils.clamp(p.getY(v), 0, height),
						THREE.MathUtils.clamp(p.getZ(v), b.z - b.halfZ, b.z + b.halfZ),
					)
				rust.push(geometry)
			}
		}
	}
	print(relief, material('courtShade'), kerb ? 'flagfall-carved-kerbs' : 'flagfall-carved-walls')
	print(tops, material('scenery'), kerb ? 'flagfall-kerb-tops' : 'flagfall-wall-tops')
	print(moss ? [moss] : [], material('leaf'), kerb ? 'flagfall-kerb-moss' : 'flagfall-wall-moss')
	print(rust, material('leafDeep'), kerb ? 'flagfall-kerb-lichen' : 'flagfall-wall-lichen')
}

export function cover({ boxes, m, print, material, layout }) {
	wallStone(
		boxes.filter((b) => b.kind === 'wall'),
		m.wallHeight,
		layout.settings.scale,
		print,
		material,
	)
	return boxes.filter((b) => b.kind !== 'wall')
}

export function kerbs({ boxes, print, material, layout }) {
	wallStone(
		boxes,
		layout.settings.kerb.height * layout.settings.scale,
		layout.settings.scale,
		print,
		material,
		true,
	)
}

// The lane view owns these panels with the core's body and removes them with its rubble.
export function corePlinth({ radius, base, stone, part, material }) {
	const c = tune.flagfall.carving
	const relief = [],
		moss = [],
		rust = []
	const rand = stoneRandom()
	for (let side = 0; side < stone.sides; side++) {
		const angle = ((side + 0.5) * Math.PI * 2) / stone.sides
		const face = radius * 0.985 * Math.cos(Math.PI / stone.sides)
		const size = stone.plinth * 0.86
		const place = (g) =>
			relief.push(g.translate(0, stone.plinth / 2, face + stone.jitter * 0.6).rotateY(angle))
		place(flowerPanel(size * 0.4, c.relief * 0.95, c))
		for (const sign of [-1, 1]) {
			place(sandstone(size, size * 0.06, c.relief * 0.32).translate(0, sign * size * 0.46, 0))
			place(
				sandstone(size * 0.06, size * 0.88, c.relief * 0.32).translate(sign * size * 0.46, 0, 0),
			)
		}
		const r = radius * (0.76 + rand() * 0.12)
		const patch = lichenClump(tune.flagfall.lichen.radius, tune.flagfall.lichen, rand).translate(
			Math.sin(angle) * r,
			stone.plinth - 0.02,
			Math.cos(angle) * r,
		)
		;(side % 3 ? moss : rust).push(patch)
	}
	for (const [parts, role] of [
		[relief, 'courtShade'],
		[moss, 'leaf'],
		[rust, 'leafDeep'],
	]) {
		if (!parts.length) continue
		const geometry = mergeGeometries(
			parts.map((g) => {
				g.deleteAttribute('uv')
				return g
			}),
		)
		for (const g of parts) g.dispose()
		const position = geometry.attributes.position
		for (let i = 0; i < position.count; i++) {
			const x = position.getX(i),
				z = position.getZ(i)
			const shrink = Math.min(1, radius / (Math.hypot(x, z) || 1))
			position.setXYZ(
				i,
				x * shrink,
				THREE.MathUtils.clamp(position.getY(i), 0, stone.plinth),
				z * shrink,
			)
		}
		part(geometry, material(role), base).name = 'flagfall-core-carving'
	}
}
