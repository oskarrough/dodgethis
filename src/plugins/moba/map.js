import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { makeStyleMaterial } from '../../core/stylepass.js'
import { tune as coreTune } from '../../core/tune.js'
import { tune } from './tune.js'
import { slabShape } from './lobby-floor.js'
import { FLOOR, PILLARS, BOXES, buildColliders } from './obstacles.js'
export { FLOOR, PILLARS, SPAWN, walkable, clampWalkable } from './obstacles.js'

// Selection, loading and gameplay share this owner, not the browser's dodgeball world.
// The kernel aborts the previous run before starting its successor.
export function createMapScope(scene, RAPIER, step) {
	let world = null
	let unbuild = null
	let live = null
	let built = null
	return {
		// `kind` picks the terrain: the lane for a match, the small plaza for the pick screen.
		// Switching rebuilds the terrain on the same world; the previous run is already aborted.
		start(run, create, kind = 'lane') {
			if (live) throw new Error('MOBA already has a live sim')
			if (!world) {
				world = new RAPIER.World({ x: 0, y: coreTune.physics.gravity, z: 0 })
				world.timestep = step
			}
			// The plaza rebuilds every start: its slab outline reads tune.lobby.slab, which may have changed.
			if (built !== kind || kind === 'plaza') {
				unbuild?.()
				unbuild = buildMap(scene, world, RAPIER, kind)
				built = kind
			}
			const releaseWorld = run.debug.world(world)
			live = create(world)
			const owned = live
			run.signal.addEventListener(
				'abort',
				() => {
					live = null
					try {
						owned.dispose()
					} finally {
						releaseWorld?.()
					}
				},
				{ once: true },
			)
			return owned
		},
		dispose() {
			if (live) throw new Error('Dispose the MOBA sim before its map')
			unbuild?.()
			unbuild = null
			built = null
			world?.free()
			world = null
		},
	}
}

// Printed road, shaded flanks and low cover; all collision geometry comes from obstacles.js.
// The 'plaza' kind draws only the Slab's cream ground: no walls, no pillars.
export function buildMap(scene, world, RAPIER, kind = 'lane') {
	const m = tune.map
	const group = new THREE.Group()
	group.name = 'moba-map'
	const owned = []
	const material = (role, options) => {
		const mat = makeStyleMaterial(role, options)
		owned.push(mat)
		return mat
	}
	const shade = material('courtShade')
	const ink = material('ink', { flat: true })
	const cream = material('cream', { flat: true })
	const scenery = material('scenery')
	const add = (geometry, mat, x, y, z) => {
		owned.push(geometry)
		const mesh = new THREE.Mesh(geometry, mat)
		mesh.position.set(x, y, z)
		group.add(mesh)
		return mesh
	}
	const print = (geometries, mat, name) => {
		if (!geometries.length) return
		add(mergeGeometries(geometries), mat, 0, 0, 0).name = name
		for (const g of geometries) g.dispose()
	}
	const buildPlaza = () => {
		// The Slab's outline, not an endless plane: nothing is drawn beyond it, so the desert shows through.
		add(slabShape(), cream, 0, m.printLayers.plaza, 0)
	}
	const buildLane = () => {
		add(
			new THREE.BoxGeometry(FLOOR.halfX * 2, FLOOR.thickness, FLOOR.halfZ * 2),
			shade,
			0,
			-FLOOR.thickness / 2,
			0,
		)
		add(
			new THREE.PlaneGeometry(FLOOR.halfX * 2, m.hedgeInnerZ * 2).rotateX(-Math.PI / 2),
			cream,
			0,
			m.printLayers.road,
			0,
		)
		for (const side of [-1, 1]) {
			// The base throat is wider than the central road.
			add(
				new THREE.PlaneGeometry(FLOOR.halfX - m.baseWallX, m.throat * 2).rotateX(-Math.PI / 2),
				cream,
				(side * (FLOOR.halfX + m.baseWallX)) / 2,
				m.printLayers.road,
				0,
			)
			const team = material(side < 0 ? 'teamA' : 'teamB', { flat: true })
			const kerbs = []
			for (let x = m.dashSpacing; x < FLOOR.halfX; x += m.dashSpacing)
				for (const flank of [-1, 1])
					kerbs.push(
						new THREE.PlaneGeometry(m.dashLength, m.lineWidth * 2)
							.rotateX(-Math.PI / 2)
							.translate(side * x, m.printLayers.marks, flank * (m.hedgeInnerZ - m.lineWidth)),
					)
			print(kerbs, team, `moba-kerbs-${side}`)
		}
		const dashes = []
		for (let x = -FLOOR.halfX + m.dashSpacing; x < FLOOR.halfX; x += m.dashSpacing)
			dashes.push(
				new THREE.PlaneGeometry(m.dashLength, m.lineWidth)
					.rotateX(-Math.PI / 2)
					.translate(x, m.printLayers.marks, 0),
			)
		print(dashes, ink, 'moba-centreline')
		const dots = []
		for (let x = -m.baseWallX; x <= m.baseWallX; x += m.dotSpacing)
			for (const side of [-1, 1])
				for (let z = m.hedgeOuterZ + m.dotSpacing; z < FLOOR.halfZ; z += m.dotSpacing)
					dots.push(
						new THREE.CircleGeometry(m.dotRadius, m.printSegments)
							.rotateX(-Math.PI / 2)
							.translate(x, m.printLayers.dots, side * z),
					)
		print(dots, ink, 'moba-halftone')
		add(
			new THREE.CircleGeometry(m.plazaRadius, m.printSegments).rotateX(-Math.PI / 2),
			cream,
			0,
			m.printLayers.plaza,
			0,
		)
		add(
			new THREE.RingGeometry(m.plazaRadius - m.lineWidth, m.plazaRadius, m.printSegments).rotateX(
				-Math.PI / 2,
			),
			ink,
			0,
			m.printLayers.seams,
			0,
		)
		// Printed dodgeball centre: a ring and crossing seams, not an objective yet.
		add(
			new THREE.RingGeometry(
				m.plazaRadius / 3 - m.lineWidth,
				m.plazaRadius / 3,
				m.printSegments,
			).rotateX(-Math.PI / 2),
			ink,
			0,
			m.printLayers.seams,
			0,
		)
		for (const yaw of [0, Math.PI / 2]) {
			const seam = add(
				new THREE.PlaneGeometry((m.plazaRadius * 2) / 3, m.lineWidth).rotateX(-Math.PI / 2),
				ink,
				0,
				m.printLayers.seams,
				0,
			)
			seam.rotation.y = yaw
		}
		for (const b of BOXES) {
			const h = b.kind === 'hedge' ? m.hedgeHeight : m.wallHeight
			const trunk = b.kind === 'hedge' ? h - m.scallopRadius : h
			add(
				new RoundedBoxGeometry(
					b.halfX * 2,
					trunk,
					b.halfZ * 2,
					1,
					Math.min(m.scallopRadius, trunk / 2),
				),
				shade,
				b.x,
				trunk / 2,
				b.z,
			)
			if (b.kind !== 'hedge') continue
			for (let x = b.x - b.halfX + m.scallopRadius; x < b.x + b.halfX; x += m.scallopSpacing)
				add(
					new THREE.SphereGeometry(m.scallopRadius, m.pillarSegments, m.pillarSegments / 2),
					shade,
					x,
					h - m.scallopRadius,
					b.z,
				)
		}
	}
	if (kind === 'plaza') buildPlaza()
	else buildLane()
	for (const p of kind === 'plaza' ? [] : PILLARS) {
		add(
			new THREE.CylinderGeometry(p.r, p.r, m.pillarHeight, m.pillarSegments),
			scenery,
			p.x,
			m.pillarHeight / 2,
			p.z,
		)
		add(
			new THREE.CylinderGeometry(p.r * m.capScale, p.r * m.capScale, m.capHeight, m.pillarSegments),
			cream,
			p.x,
			m.pillarHeight + m.capHeight / 2,
			p.z,
		)
	}
	const uncollide = buildColliders(world, RAPIER, kind === 'plaza' ? BOXES : undefined)
	scene.add(group)
	return () => {
		scene.remove(group)
		for (const resource of owned) resource.dispose()
		uncollide()
	}
}
