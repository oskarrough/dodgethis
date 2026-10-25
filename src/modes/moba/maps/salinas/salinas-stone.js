import * as THREE from 'three'
import { tune } from '../../tune.js'
import { carvedWalls, flowerBand, chippedBlock } from '../../carve.js'

const random = () => {
	let seed = 71
	return () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296
}

export function cover({ boxes, m, print, material }) {
	const c = tune.salinas.carving
	const { stone, moss } = carvedWalls(
		boxes,
		(b) => (b.kind === 'hedge' ? m.hedgeHeight : m.wallHeight),
		c,
		random(),
	)
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
		print([geometry], material(band ? 'scenery' : 'courtShade'), `salinas-salt-wall-${band}`)
	}
	if (moss) print([moss], material('scenery'), 'salinas-wall-salt')
	return []
}

export function kerbs({ boxes, layout, print, material }) {
	const height = layout.settings.kerb.height * layout.settings.scale
	const rand = random(),
		parts = []
	for (const b of boxes) {
		const alongX = b.halfX > b.halfZ
		const length = (alongX ? b.halfX : b.halfZ) * 2
		const depth = (alongX ? b.halfZ : b.halfX) * 2
		const count = Math.ceil(length / tune.salinas.carving.blockWidth)
		for (let i = 0; i < count; i++) {
			const g = chippedBlock(length / count - 0.035, height, depth, tune.salinas.carving, rand)
			g.rotateY(alongX ? 0 : Math.PI / 2)
			g.translate(
				b.x + (alongX ? ((i + 0.5) * length) / count - length / 2 : 0),
				height / 2,
				b.z + (alongX ? 0 : ((i + 0.5) * length) / count - length / 2),
			)
			parts.push(g)
		}
	}
	print(parts, material('scenery'), 'salinas-salt-kerb')
}

export function corePlinth({ radius, base, stone: s, part, material }) {
	part(
		flowerBand(radius * 0.985, radius * 0.97, s.plinth - s.bevel, s.sides, tune.salinas.carving),
		material('courtShade'),
		base,
	)
	part(
		flowerBand(
			radius * s.step * 0.985,
			radius * s.step * 0.97,
			s.plinth * 0.8 - s.bevel,
			s.sides + 1,
			tune.salinas.carving,
		),
		material('scenery'),
		base + s.plinth - 0.02,
	)
}
