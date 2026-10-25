import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { tune } from '../../tune.js'
import { carvedWalls, carvedPillar, flowerBand, lichenClump } from '../../carve.js'

function stoneRandom() {
	let seed = 0
	return () => {
		const n = Math.sin(++seed * 12.9898 + 4.1) * 43758.5453
		return n - Math.floor(n)
	}
}

export function cover({ boxes, m, print, material }) {
	const { stone, moss } = carvedWalls(
		boxes.filter((b) => b.kind === 'wall'),
		() => m.wallHeight,
		tune.overthrow.carving,
		stoneRandom(),
	)
	// Broad pale caps catch the sun; the camera-facing carved fields stay lavender.
	const positions = [[], []],
		normals = [[], []]
	const p = stone.attributes.position,
		n = stone.attributes.normal
	for (let i = 0; i < p.count; i += 3) {
		const band = n.getY(i) > 0.5 ? 1 : 0
		for (let j = i; j < i + 3; j++) {
			positions[band].push(p.getX(j), p.getY(j), p.getZ(j))
			normals[band].push(n.getX(j), n.getY(j), n.getZ(j))
		}
	}
	stone.dispose()
	for (let band = 0; band < 2; band++) {
		const geometry = new THREE.BufferGeometry()
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions[band], 3))
		geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals[band], 3))
		print([geometry], material(band ? 'scenery' : 'courtShade'), `overthrow-wall-${band}`)
	}
	if (moss) print([moss], material('leaf'), 'overthrow-wall-moss')
	return boxes.filter((b) => b.kind !== 'wall')
}

export function pillars({ pillars, m, print, material }) {
	print(
		pillars.map((p) =>
			carvedPillar(
				p,
				m.pillarHeight + m.capHeight,
				tune.overthrow.carving,
				tune.overthrow.pillarRelief,
			),
		),
		material('courtShade'),
		'overthrow-carved-pillars',
	)
}

export function corePlinth({ radius, base, stone: s, part, material }) {
	const c = tune.overthrow.carving
	part(
		flowerBand(radius * 0.985, radius * 0.97, s.plinth - s.bevel, s.sides, c),
		material('courtShade'),
		base,
	)
	const band = part(
		flowerBand(
			radius * s.step * 0.985,
			radius * s.step * 0.97,
			s.plinth * 0.8 - s.bevel,
			s.sides + 1,
			c,
		),
		material('scenery'),
		base + s.plinth - 0.02,
	)
	band.position.set(s.stepShift[0], base + s.plinth - 0.02, s.stepShift[1])
	band.rotation.y = Math.PI / s.sides
	const rand = stoneRandom(),
		moss = []
	for (let i = 0; i < s.sides; i++) {
		if (rand() > c.mossChance) continue
		const angle = (i * Math.PI * 2) / s.sides
		const reach = radius * 0.84
		moss.push(
			lichenClump(c.mossReach, tune.overthrow.lichen, rand).translate(
				Math.sin(angle) * reach,
				s.plinth - c.mossHeight,
				Math.cos(angle) * reach,
			),
		)
	}
	if (moss.length) {
		const geometry = mergeGeometries(moss)
		const positions = geometry.attributes.position
		for (let i = 0; i < positions.count; i++) {
			const x = positions.getX(i),
				z = positions.getZ(i)
			const shrink = Math.min(1, radius / (Math.hypot(x, z) || 1))
			positions.setXYZ(i, x * shrink, Math.min(s.plinth, positions.getY(i)), z * shrink)
		}
		part(geometry, material('leaf'), base).name = 'overthrow-core-moss'
		for (const g of moss) g.dispose()
	}
}
