import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { ARENA } from '../src/arena.js'
import { buildCourt, COURT_THEMES } from '../src/court.js'
import { buildPortalPad } from '../src/portal.js'
import { PALETTE } from '../src/style.js'

test('portal batches retain bounds and all four semantic materials without canvas', () => {
	for (const [difficulty, role] of [
		[1, 'portalChill'],
		[2, 'portalSpicy'],
		[3, 'portalChaos'],
	]) {
		const pad = buildPortalPad(difficulty)
		expect(pad.children).toHaveLength(4)
		expect(pad.children.map((mesh) => mesh.name)).toEqual([
			'portal-cream',
			'portal-hole',
			'portal-ink',
			`portal-${role}`,
		])
		const bounds = new THREE.Box3().setFromObject(pad)
		expect(bounds.max.x).toBeCloseTo(1.75)
		expect(bounds.min.x).toBeCloseTo(-1.75)
		expect(bounds.max.z).toBeCloseTo(1.75)
		expect(bounds.max.y).toBeCloseTo(0.005)
		for (const mesh of pad.children) {
			expect(mesh.geometry.groups).toHaveLength(0)
			mesh.geometry.dispose()
			mesh.material.dispose()
		}
	}
})

test('court themes switch scenery without rebuilding colliders or changing gameplay colors', () => {
	const colliders = []
	const world = { createRigidBody: () => ({}), createCollider: (desc) => colliders.push(desc) }
	const RAPIER = {
		RigidBodyDesc: { fixed: () => ({}) },
		ColliderDesc: {
			cuboid: (...halfExtents) => ({
				halfExtents,
				setTranslation(x, y, z) {
					this.translation = [x, y, z]
					return this
				},
			}),
		},
	}
	const scene = new THREE.Scene()
	const court = buildCourt(scene, world, RAPIER)
	const size = scene.children.length
	for (const [name, theme] of Object.entries(COURT_THEMES)) {
		expect(court.setTheme(name)).toBe(theme)
		for (const role of ['teamA', 'teamB', 'ammo', 'ink', 'bowl', 'perfect']) {
			expect(theme.palette[role]).toBeUndefined()
			expect({ ...PALETTE, ...theme.palette }[role]).toBe(PALETTE[role])
		}
		const groups = scene.children.filter((obj) => obj.name.startsWith('court-theme-'))
		expect(groups.filter((obj) => obj.visible).map((obj) => obj.name)).toEqual([
			`court-theme-${name}`,
		])
		for (const group of groups) expect(group.children.length).toBeLessThanOrEqual(3)
	}
	expect(court.setTheme('missing')).toBe(COURT_THEMES.park)
	expect(scene.children).toHaveLength(size)
	expect(colliders).toHaveLength(1)
	expect(colliders[0].halfExtents).toEqual([ARENA.width / 2, ARENA.thickness / 2, ARENA.depth / 2])
	expect(colliders[0].translation).toEqual([0, -ARENA.thickness / 2, 0])
	scene.traverse((obj) => {
		obj.geometry?.dispose()
		obj.material?.dispose()
	})
})
