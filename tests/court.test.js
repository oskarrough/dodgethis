import { expect, test } from 'bun:test'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { createPlayer } from '../src/player.js'
import { tune } from '../src/tune.js'

await RAPIER.init({})
import { ARENA } from '../src/arena.js'
import { LAYOUTS } from '../src/obstacles.js'
import { buildCourt, COURT_THEMES } from '../src/court.js'
import { PALETTE } from '../src/style.js'

test('court themes switch scenery without rebuilding colliders or changing gameplay colors', () => {
	const scene = new THREE.Scene()
	const world = new RAPIER.World({ x: 0, y: tune.physics.gravity, z: 0 })
	const court = buildCourt(scene, world, RAPIER)
	const colliders = world.colliders.len()
	const size = scene.children.length
	try {
		for (const [name, theme] of Object.entries(COURT_THEMES)) {
			expect(court.setTheme(name)).toBe(theme)
			// Scenery may retint anything except the roles gameplay reads.
			for (const role of ['teamA', 'teamB', 'ammo', 'ink', 'bowl', 'perfect']) {
				expect(theme.palette[role]).toBeUndefined()
				expect({ ...PALETTE, ...theme.palette }[role]).toBe(PALETTE[role])
			}
			const groups = scene.children.filter((obj) => obj.name.startsWith('court-theme-'))
			expect(groups.filter((obj) => obj.visible).map((obj) => obj.name)).toEqual([
				`court-theme-${name}`,
			])
		}
		expect(court.setTheme('missing')).toBe(COURT_THEMES.park)
		expect(scene.children).toHaveLength(size)
		expect(world.colliders.len()).toBe(colliders)
	} finally {
		world.free()
		scene.traverse((obj) => {
			obj.geometry?.dispose()
			obj.material?.dispose()
		})
	}
})

test('bleachers support falling players and block movement through a riser', () => {
	const scene = new THREE.Scene()
	const world = new RAPIER.World({ x: 0, y: tune.physics.gravity, z: 0 })
	buildCourt(scene, world, RAPIER)
	const x = ARENA.width / 2 + 1.6
	const unit = createPlayer(scene, world, RAPIER, { position: [x, 2, 0] })
	const step = (dir, frames) => {
		for (let i = 0; i < frames; i++) {
			unit.update(dir, 1 / 60)
			world.step()
			unit.sync()
		}
	}
	try {
		step({ x: 0, z: 0 }, 120)
		const landedY = -0.3 + 0.11 + tune.player.radius + tune.player.halfHeight + 0.01
		expect(unit.body.translation().y).toBeCloseTo(landedY, 2)
		step({ x: 1, z: 0 }, 60)
		expect(unit.body.translation().x).toBeLessThan(x + 0.65 - 0.31)
		expect(unit.body.translation().y).toBeCloseTo(landedY, 2)
	} finally {
		unit.dispose()
		world.free()
		scene.traverse((obj) => {
			obj.geometry?.dispose()
			obj.material?.dispose()
		})
	}
})

test('obstacle layouts toggle meshes and colliders without changing the world collider count', () => {
	const scene = new THREE.Scene()
	const world = new RAPIER.World({ x: 0, y: tune.physics.gravity, z: 0 })
	const court = buildCourt(scene, world, RAPIER)
	const total = world.colliders.len()
	const enabledCount = () => {
		let enabled = 0
		world.forEachCollider((c) => {
			if (c.isEnabled()) enabled++
		})
		return enabled
	}
	try {
		expect(court.layout).toBe('open')
		expect(court.obstacles).toEqual(LAYOUTS.open)
		const baseEnabled = enabledCount()
		court.setLayout('pillars')
		expect(court.layout).toBe('pillars')
		expect(court.obstacles).toEqual(LAYOUTS.pillars)
		expect(world.colliders.len()).toBe(total) // toggling never creates or destroys colliders
		expect(enabledCount()).toBe(baseEnabled + 5)
		const group = scene.children.find((obj) => obj.name === 'court-layout-pillars')
		expect(group.visible).toBe(true)
		for (const obj of scene.children.filter((o) => o.name.startsWith('court-layout-')))
			expect(obj.visible).toBe(obj === group)
		court.setLayout('open')
		expect(court.layout).toBe('open')
		expect(group.visible).toBe(false)
		expect(enabledCount()).toBe(baseEnabled)
		court.setLayout('not-a-layout')
		expect(court.layout).toBe('open') // unknown names fall back
		court.setLayout('walls')
		expect(court.obstacles).toEqual(LAYOUTS.walls)
		expect(enabledCount()).toBe(baseEnabled + 6)
	} finally {
		world.free()
		scene.traverse((obj) => {
			obj.geometry?.dispose()
			obj.material?.dispose()
		})
	}
})
