import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { makeStyleMaterial } from '../../core/stylepass.js'
import { tune as coreTune } from '../../core/tune.js'
import { tune } from './tune.js'
import { floorShape } from './lobby-floor.js'
import { createOverthrowTerrain } from './overthrow-terrain.js'
import { FLOOR, mapLayout, buildColliders } from './obstacles.js'
export { FLOOR, PILLARS, SPAWN, walkable, clampWalkable } from './obstacles.js'

// Selection, loading and gameplay share this owner, not the browser's dodgeball world.
// The kernel aborts the previous run before starting its successor.
export function createMapScope(scene, RAPIER, step) {
	let world = null
	let unbuild = null
	let live = null
	let built = null
	return {
		// `kind` picks the terrain: lane, Flagfall walkabout, or the lobby pick screen.
		// Switching rebuilds the terrain on the same world; the previous run is already aborted.
		start(run, create, kind = 'overthrow') {
			if (live) throw new Error('MOBA already has a live sim')
			if (!world) {
				world = new RAPIER.World({ x: 0, y: coreTune.physics.gravity, z: 0 })
				world.timestep = step
			}
			// Authored lobby/Flagfall layouts read tune on restart; rebuild visuals and colliders together.
			if (built !== kind || kind === 'lobby' || kind === 'flagfall') {
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
						if (kind === 'overthrow') {
							unbuild?.()
							unbuild = null
							built = null
						}
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

// Ground prints and cover share the active layout's collision descriptors.
// The 'lobby' kind draws only the lobby floor's cream ground: no walls, no pillars.
export function buildMap(scene, world, RAPIER, kind = 'overthrow') {
	const m = tune.map
	const layout = mapLayout(kind)
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
	const buildLobby = () => {
		// The lobby floor's outline, not an endless plane: nothing is drawn beyond it, so the desert shows through.
		add(floorShape(), cream, 0, m.printLayers.lobby, 0)
	}
	let unterrain = null
	const buildLane = () => {
		unterrain = createOverthrowTerrain(group)
		// Ownership remains a small semantic print; it is not scenery.
		for (const side of [-1, 1]) {
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
	}
	const buildFlagfall = () => {
		const s = tune.flagfall
		const layers = s.print.layers
		const sand = material('court', { flat: true })
		const yard = material('courtShade', { flat: true })
		const plane = (width, depth, mat, x, y, z) =>
			add(new THREE.PlaneGeometry(width, depth).rotateX(-Math.PI / 2), mat, x, y, z)
		plane(s.bounds.halfX * 2, s.bounds.halfZ * 2, sand, 0, layers.sand, 0)
		plane(s.yard.halfX * 2, s.yard.halfZ * 2, yard, 0, layers.yard, 0)
		const strokes = []
		for (let z = -s.yard.halfZ; z < s.yard.halfZ; z += s.print.hatchSpacing)
			strokes.push(
				new THREE.PlaneGeometry(s.yard.halfX * 2, s.print.hatchWidth)
					.rotateX(-Math.PI / 2)
					.translate(0, layers.hatch, z),
			)
		print(strokes, ink, 'flagfall-yard-hatching')
		for (const side of [-1, 1]) {
			plane(
				s.bounds.halfX * 2,
				s.lane.outerZ - s.lane.innerZ,
				cream,
				0,
				layers.lanes,
				side * s.lane.centreZ,
			)
			// Open courtyards connect both lanes behind the base blocks.
			plane(
				s.bounds.halfX - s.baseBlock.outerX,
				s.lane.innerZ * 2,
				cream,
				(side * (s.bounds.halfX + s.baseBlock.outerX)) / 2,
				layers.lanes,
				0,
			)
			const team = material(side < 0 ? 'teamA' : 'teamB', { flat: true })
			const kerbs = []
			for (let x = m.dashSpacing; x < s.baseBlock.outerX; x += m.dashSpacing)
				for (const flank of [-1, 1])
					kerbs.push(
						new THREE.PlaneGeometry(m.dashLength, s.print.kerbWidth)
							.rotateX(-Math.PI / 2)
							.translate(side * x, layers.marks, flank * (s.lane.innerZ + s.print.kerbWidth)),
					)
			print(kerbs, team, `flagfall-kerbs-${side}`)
			for (const flank of [-1, 1])
				plane(
					s.bounds.halfX - s.baseX,
					s.print.kerbWidth,
					team,
					(side * (s.bounds.halfX + s.baseX)) / 2,
					layers.marks,
					flank * s.lane.innerZ,
				)
		}
		// Future buildings are chalk only: no body, target or collider.
		for (const point of [
			...layout.structures,
			...layout.posts.map((p) => ({ ...p, kind: 'post' })),
		]) {
			const radius = s.print.radii[point.kind]
			// White chalk needs a keyline on the cream trodden lanes and courtyards.
			add(
				new THREE.RingGeometry(
					radius - s.print.footprintWidth - s.print.footprintOutline,
					radius + s.print.footprintOutline,
					m.printSegments,
				).rotateX(-Math.PI / 2),
				ink,
				point.x,
				layers.marks,
				point.z,
			)
			const footprint = add(
				new THREE.RingGeometry(radius - s.print.footprintWidth, radius, m.printSegments).rotateX(
					-Math.PI / 2,
				),
				cream,
				point.x,
				layers.chalk,
				point.z,
			)
			footprint.name = `flagfall-${point.kind}-footprint`
		}
		for (const post of layout.posts)
			add(
				new THREE.CylinderGeometry(
					s.print.poleRadius,
					s.print.poleRadius,
					s.print.poleHeight,
					m.pillarSegments,
				),
				scenery,
				post.x,
				s.print.poleHeight / 2,
				post.z,
			)
	}
	if (kind === 'lobby') buildLobby()
	else if (kind === 'flagfall') buildFlagfall()
	else buildLane()
	for (const b of layout.boxes) {
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
			kind === 'flagfall' ? scenery : shade,
			b.x,
			trunk / 2,
			b.z,
		)
		if (b.kind !== 'hedge') continue
		for (let x = b.x - b.halfX + m.scallopRadius; x < b.x + b.halfX; x += m.scallopSpacing)
			add(
				new THREE.SphereGeometry(m.scallopRadius, m.pillarSegments, m.pillarSegments / 2),
				kind === 'flagfall' ? scenery : shade,
				x,
				h - m.scallopRadius,
				b.z,
			)
	}

	for (const p of layout.pillars) {
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
	const uncollide = buildColliders(
		world,
		RAPIER,
		layout.obstacles,
		kind === 'lobby' ? undefined : layout.bounds,
	)
	scene.add(group)
	return () => {
		scene.remove(group)
		unterrain?.()
		for (const resource of owned) resource.dispose()
		uncollide()
	}
}
