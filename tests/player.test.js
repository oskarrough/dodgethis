import { afterEach, beforeEach, expect, test } from 'bun:test'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { createPlayer } from '../src/player.js'
import { createArrow } from '../src/arrow.js'
import { createFeedback } from '../src/feedback.js'

await RAPIER.init({})
let scene, world, unit
beforeEach(() => {
	scene = new THREE.Scene()
	world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
	unit = createPlayer(scene, world, RAPIER, { position: [2, 0, 3] })
	unit.aim.set(1, 0, 0)
	unit.face(unit.aim)
})
afterEach(() => {
	unit.dispose()
	world.free()
	expect(scene.children).toHaveLength(0)
})

test('cosmetic preparation and recovery never change gameplay pose or launch point', () => {
	const root = unit.mesh.position.clone()
	const hand = unit.handPosition().clone()
	const body = { ...unit.body.translation() }
	const collider = { ...unit.collider.translation() }
	unit.react({ type: 'dash', direction: { x: 1, z: 0 } })
	unit.react({ type: 'shot', perfect: true })
	unit.react({ type: 'pickup' })
	unit.react({ type: 'land', speed: 9 })
	unit.updateVisual(0.05, 1)
	expect(unit.visual.position.length()).toBeGreaterThan(0)
	expect(unit.visual.scale.x).toBeGreaterThan(1)
	expect(unit.visual.scale.y).toBeLessThan(1)
	expect(unit.mesh.position.equals(root)).toBe(true)
	expect(unit.handPosition().equals(hand)).toBe(true)
	expect(unit.body.translation()).toEqual(body)
	expect(unit.collider.translation()).toEqual(collider)
	expect(unit.aim.toArray()).toEqual([1, 0, 0])
	const arrow = createArrow(scene, world, RAPIER)
	arrow.loose(unit.handPosition(), unit.aim, 'A', 15)
	expect(arrow.position.x).toBeCloseTo(hand.x, 5)
	expect(arrow.position.y).toBeCloseTo(hand.y, 5)
	expect(arrow.position.z).toBeCloseTo(hand.z, 5)
	arrow.dispose()
})

test('visual springs stay bounded after a stalled tab and settle back to neutral', () => {
	unit.react({ type: 'dash', direction: { x: 1, z: 0 } })
	unit.react({ type: 'shot', perfect: true })
	unit.react({ type: 'pickup' })
	for (let i = 0; i < 60; i++) {
		unit.react({ type: 'shot', perfect: true })
		unit.updateVisual(1 / 60)
	}
	unit.updateVisual(60)
	expect(unit.visual.position.length()).toBeLessThan(0.3)
	expect(Math.abs(unit.visual.rotation.x)).toBeLessThan(0.5)
	for (let i = 0; i < 120; i++) unit.updateVisual(1 / 60)
	expect(unit.visual.position.length()).toBeLessThan(0.0001)
	expect(unit.visual.scale.distanceTo(new THREE.Vector3(1, 1, 1))).toBeLessThan(0.0001)
	expect(Math.abs(unit.visual.rotation.x)).toBeLessThan(0.0001)
})

test('elimination clears cosmetic impulses before handing the visual to death feedback', () => {
	unit.react({ type: 'dash', direction: { x: 1, z: 0 } })
	unit.react({ type: 'shot' })
	unit.react({ type: 'pickup' })
	unit.updateVisual(0.05, 1)
	unit.eliminate()
	expect(unit.visual.position.toArray()).toEqual([0, 0, 0])
	expect(unit.visual.scale.toArray()).toEqual([1, 1, 1])
	expect(unit.visual.rotation.x).toBe(0)
})

test('death detaches the visual without moving the logical root, and disposal owns both', () => {
	const feedback = createFeedback(scene, {
		sfx: { hit() {} },
		confirm() {},
	})
	const root = unit.mesh.position.clone()
	unit.eliminate()
	feedback.present(
		{
			type: 'impact',
			outcome: 'eliminated',
			target: { isHuman: false },
			point: { ...root },
			direction: { x: 1, y: 0, z: 0 },
		},
		unit.visual,
	)
	expect(unit.visual.parent).toBe(scene)
	expect(unit.visual.position.x).toBe(root.x)
	expect(unit.visual.position.z).toBe(root.z)
	feedback.update(0.1)
	expect(unit.mesh.position.equals(root)).toBe(true)
	feedback.reset()
	feedback.dispose()
	// afterEach disposes the unit; a detached corpse still belongs to that unit.
})

test.each(['fall', 'impact'])(
	'a rendered player can die by %s and fade in the forward pass',
	(type) => {
		const shaders = []
		unit.visual.traverse((o) => {
			if (!o.isMesh) return
			expect(o.material.isShaderMaterial).toBe(true)
			expect(o.layers.mask).toBe(1)
			let disposed = false
			o.material.addEventListener('dispose', () => {
				disposed = true
			})
			shaders.push(() => disposed)
		})
		const feedback = createFeedback(scene, { sfx: { hit() {}, fall() {} }, confirm() {} })
		unit.eliminate()
		feedback.present(
			{
				type,
				outcome: 'eliminated',
				target: { isHuman: false },
				point: { x: 2, y: 1, z: 3 },
				direction: { x: 0, y: -1, z: 0 },
			},
			unit.visual,
		)
		unit.visual.traverse((o) => {
			if (!o.isMesh) return
			expect(o.material.isMeshBasicMaterial).toBe(true)
			expect(o.material.transparent).toBe(true)
			expect(o.layers.mask).toBe(2)
		})
		expect(shaders.every((disposed) => disposed())).toBe(true)
		for (let i = 0; i < 50; i++) feedback.update(0.1)
		expect(unit.visual.visible).toBe(false)
		feedback.dispose()
	},
)

test('stride follows displacement, settles at rest, and teleporting never produces a footstep', () => {
	const shoes = unit.visual.getObjectByName('shoes')
	const before = new THREE.Matrix4()
	const moving = new THREE.Matrix4()
	unit.updateVisual(1 / 60)
	shoes.getMatrixAt(0, before)
	let steps = 0
	for (let i = 0; i < 12; i++) {
		unit.mesh.position.z -= 0.1
		if (unit.updateVisual(1 / 60)) steps++
	}
	shoes.getMatrixAt(0, moving)
	expect(moving.equals(before)).toBe(false)
	expect(steps).toBe(1)
	for (let i = 0; i < 120; i++) expect(unit.updateVisual(1 / 60)).toBe(false)
	shoes.getMatrixAt(0, moving)
	expect(moving.elements[13]).toBeCloseTo(before.elements[13], 4)
	unit.place(0, 1, -8)
	expect(unit.updateVisual(1 / 60)).toBe(false)
})
