import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { ARENA, bounds } from './arena.js'
import { LAYOUTS } from './obstacles.js'
import { PALETTE } from './style.js'
import { makeStyleMaterial } from './stylepass.js'

// Themes only change world colors. Team, ammo and ink identities stay stable.
export const COURT_THEMES = Object.freeze({
	park: {
		label: 'Park',
		palette: {
			page: PALETTE.page,
			court: PALETTE.court,
			courtLine: PALETTE.courtLine,
			courtRim: PALETTE.courtRim,
			courtShade: PALETTE.courtShade,
			scenery: PALETTE.scenery,
		},
	},
	sunset: {
		label: 'Sunset',
		palette: {
			page: 0xf2c7a3,
			court: 0xc38e78,
			courtLine: 0xfff2cf,
			courtRim: 0xf7ca75,
			courtShade: 0x986a63,
			scenery: 0xb69b9c,
		},
	},
	gym: {
		label: 'Night Gym',
		palette: {
			page: 0x71849e,
			court: 0x78999c,
			courtLine: 0xf2e5c7,
			courtRim: 0xe9bc71,
			courtShade: 0x526e81,
			scenery: 0x8592ad,
		},
	},
})

// Re-exported for readability at call sites that only want the dimensions.
export const COURT = ARENA
export const KILL_Y = ARENA.killY

// Build matching Three floor geometry and fixed Rapier collision from ARENA dimensions.
export function buildCourt(scene, world, RAPIER) {
	const { width, depth, thickness } = ARENA

	const mesh = new THREE.Mesh(
		new THREE.BoxGeometry(width, thickness, depth),
		makeStyleMaterial('court'),
	)
	mesh.position.y = -thickness / 2
	mesh.receiveShadow = true
	scene.add(mesh)

	// Center line (the "net" line) for orientation.
	const line = new THREE.Mesh(
		new THREE.BoxGeometry(width, 0.02, 0.12),
		makeStyleMaterial('courtLine', { flat: true }),
	)
	line.position.y = 0.011
	scene.add(line)

	// The painted warning rim is visual only, leaving the edge fallable.
	const rimGeometries = []
	const rimMat = makeStyleMaterial('courtRim', { flat: true })
	const b = bounds(ARENA.inset.rim / 2)
	const band = ARENA.inset.rim
	for (const [w, d, x, z] of [
		[width, band, 0, b.z],
		[width, band, 0, -b.z],
		[band, depth, b.x, 0],
		[band, depth, -b.x, 0],
	]) {
		const geometry = new THREE.BoxGeometry(w, 0.02, d)
		geometry.translate(x, 0.008, z)
		rimGeometries.push(geometry)
	}
	const rim = new THREE.Mesh(mergeGeometries(rimGeometries), rimMat)
	rim.name = 'court-rim'
	for (const geometry of rimGeometries) geometry.dispose()
	scene.add(rim)

	const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
	world.createCollider(
		RAPIER.ColliderDesc.cuboid(width / 2, thickness / 2, depth / 2).setTranslation(
			0,
			-thickness / 2,
			0,
		),
		body,
	)

	// Merge scenery by ink role and give solid bleachers matching fixed colliders while gaps remain fallable.
	const batches = new Map()
	function box(role, w, h, d, x, y, z, solid = false) {
		if (solid) {
			world.createCollider(
				RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, y, z),
				body,
			)
		}
		const geometry = new THREE.BoxGeometry(w, h, d)
		geometry.translate(x, y, z)
		if (!batches.has(role)) batches.set(role, [])
		batches.get(role).push(geometry)
	}
	for (const side of [-1, 1]) {
		for (let row = 0; row < 3; row++) {
			const x = side * (width / 2 + 1.6 + row * 0.65)
			box('scenery', 0.62, 0.22, depth * 0.64, x, row * 0.45 - 0.3, 0, true)
			for (const z of [-depth * 0.26, depth * 0.26])
				box('ink', 0.12, 0.7 + row * 0.45, 0.12, x, row * 0.225 - 0.65, z, true)
		}
	}
	// Service lines frame the ends without laying texture under moving ammo.
	for (const z of [-depth * 0.3, depth * 0.3]) {
		box('courtLine', width * 0.8, 0.01, 0.055, 0, 0.018, z)
		box('courtLine', 0.055, 0.01, 0.55, 0, 0.018, z)
	}
	const boardZ = -depth / 2 - 2
	box('ink', 5.8, 1.9, 0.22, 0, 2.1, boardZ)
	box('cream', 5.35, 1.5, 0.08, 0, 2.1, boardZ + 0.15)
	for (const x of [-2.3, 2.3]) box('ink', 0.16, 2.4, 0.16, x, 0.15, boardZ)
	box('teamA', 0.2, 1.1, 0.08, -2.35, 2.1, boardZ + 0.22)
	box('teamB', 0.2, 1.1, 0.08, 2.35, 2.1, boardZ + 0.22)
	for (const [role, geometries] of batches) {
		const decoration = new THREE.Mesh(
			mergeGeometries(geometries),
			makeStyleMaterial(role, { flat: true }),
		)
		decoration.name = `court-${role}`
		decoration.matrixAutoUpdate = false
		scene.add(decoration)
		for (const geometry of geometries) geometry.dispose()
	}
	// Each location's off-court silhouette is merged by role and toggled as a group without rebuilding geometry or physics.
	const themeGroups = new Map()
	for (const name of Object.keys(COURT_THEMES)) {
		const group = new THREE.Group()
		group.name = `court-theme-${name}`
		batches.clear()
		for (const side of [-1, 1]) {
			const x = side * (width / 2 + 3.8)
			if (name === 'park') {
				for (const z of [-depth * 0.3, depth * 0.3]) {
					box('ink', 0.24, 2.8, 0.24, x, 0.7, z)
					box('scenery', 1.3, 1.1, 1.25, x, 2.05, z)
					box('scenery', 0.85, 0.75, 0.85, x + side * 0.18, 2.8, z)
				}
			} else if (name === 'sunset') {
				// Wide shade canopies on slender legs: a beach-side evening court.
				for (const z of [-depth * 0.26, depth * 0.26]) box('ink', 0.12, 3.2, 0.12, x, 0.8, z)
				box('scenery', 2.7, 0.2, depth * 0.65, x, 2.45, 0)
				box('courtLine', 0.12, 0.25, depth * 0.65, x - side * 1.3, 2.35, 0)
			} else {
				// Low gym framing and floodlights, without walls hiding the action.
				for (const z of [-depth * 0.35, depth * 0.35]) {
					box('ink', 0.18, 4.4, 0.18, x, 1.4, z)
					box('scenery', 1.35, 0.65, 0.4, x, 3.5, z)
					box('cream', 1.1, 0.4, 0.1, x, 3.5, z + 0.23)
				}
				box('scenery', 0.18, 0.5, depth * 0.8, x, -0.1, 0)
			}
		}
		for (const [role, geometries] of batches) {
			const decoration = new THREE.Mesh(mergeGeometries(geometries), makeStyleMaterial(role))
			decoration.name = `${name}-${role}`
			group.add(decoration)
			for (const geometry of geometries) geometry.dispose()
		}
		group.visible = name === 'park'
		themeGroups.set(name, group)
		scene.add(group)
	}
	// Obstacle layouts: one merged-mesh group plus fixed colliders per layout, toggled by setLayout without rebuilding geometry or physics.
	const layoutGroups = new Map()
	const layoutColliders = new Map()
	let activeLayout = 'open'
	for (const [name, shapes] of Object.entries(LAYOUTS)) {
		const group = new THREE.Group()
		group.name = `court-layout-${name}`
		batches.clear()
		const colliders = []
		// Cylinders have no box() path, so they go through the same role batches with a matching helper.
		const disc = (role, r, h, x, y, z) => {
			const geometry = new THREE.CylinderGeometry(r, r, h, 12)
			geometry.translate(x, y, z)
			if (!batches.has(role)) batches.set(role, [])
			batches.get(role).push(geometry)
		}
		for (const o of shapes) {
			if (o.kind === 'pillar') {
				disc('ink', o.r, o.h, o.x, o.h / 2, o.z)
				disc('cream', o.r * 0.8, 0.04, o.x, o.h + 0.02, o.z)
				colliders.push(
					world.createCollider(
						RAPIER.ColliderDesc.cylinder(o.h / 2, o.r).setTranslation(o.x, o.h / 2, o.z),
						body,
					),
				)
			} else {
				box('courtShade', o.w, o.h, o.d, o.x, o.h / 2, o.z)
				box('courtLine', o.w + 0.06, 0.04, o.d + 0.06, o.x, o.h + 0.02, o.z)
				colliders.push(
					world.createCollider(
						RAPIER.ColliderDesc.cuboid(o.w / 2, o.h / 2, o.d / 2).setTranslation(o.x, o.h / 2, o.z),
						body,
					),
				)
			}
		}
		for (const [role, geometries] of batches) {
			const decoration = new THREE.Mesh(
				mergeGeometries(geometries),
				makeStyleMaterial(role, { flat: true }),
			)
			decoration.name = `layout-${name}-${role}`
			group.add(decoration)
			for (const geometry of geometries) geometry.dispose()
		}
		group.visible = name === activeLayout
		for (const collider of colliders) collider.setEnabled(name === activeLayout)
		layoutGroups.set(name, group)
		layoutColliders.set(name, colliders)
		scene.add(group)
	}
	const scorePips = []
	for (let team = 0; team < 2; team++) {
		for (let i = 0; i < 2; i++) {
			const pip = new THREE.Mesh(
				new THREE.CircleGeometry(0.22, 12),
				makeStyleMaterial(team ? 'teamB' : 'teamA', { flat: true }),
			)
			pip.position.set((team ? 1 : -1) * (0.65 + i * 0.75), 2.1, boardZ + 0.22)
			scene.add(pip)
			scorePips.push(pip)
		}
	}
	return {
		floor: mesh,
		setTheme(name) {
			const selected = Object.hasOwn(COURT_THEMES, name) ? name : 'park'
			for (const [key, group] of themeGroups) group.visible = key === selected
			return COURT_THEMES[selected]
		},
		// Show one obstacle layout's meshes and enable only its colliders; unknown names fall back to the open court.
		setLayout(name) {
			const selected = Object.hasOwn(LAYOUTS, name) ? name : 'open'
			activeLayout = selected
			for (const [key, group] of layoutGroups) group.visible = key === selected
			for (const [key, colliders] of layoutColliders)
				for (const collider of colliders) collider.setEnabled(key === selected)
			return selected
		},
		get obstacles() {
			return LAYOUTS[activeLayout]
		},
		get layout() {
			return activeLayout
		},
		updateScore(a, b) {
			for (let i = 0; i < 4; i++) scorePips[i].scale.setScalar(i % 2 < (i < 2 ? a : b) ? 1 : 0.25)
		},
	}
}
