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
	unit.updateVisual(0.05, 1)
	expect(unit.visual.position.length()).toBeGreaterThan(0)
	expect(unit.visual.scale.x).toBeGreaterThan(1)
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

test('reduced motion clears cosmetic impulses and charge anticipation', () => {
	unit.react({ type: 'dash', direction: { x: 1, z: 0 } })
	unit.react({ type: 'shot' })
	unit.react({ type: 'pickup' })
	unit.updateVisual(0.05, 1, true)
	expect(unit.visual.position.toArray()).toEqual([0, 0, 0])
	expect(unit.visual.scale.toArray()).toEqual([1, 1, 1])
	expect(unit.visual.rotation.x).toBe(0)
})

test('death detaches the visual without moving the logical root, and disposal owns both', () => {
	const feedback = createFeedback(scene, {
		sfx: { hit() {} },
		confirm() {},
		reducedMotion: () => true,
	})
	const root = unit.mesh.position.clone()
	unit.eliminate()
	feedback.present(
		{ type: 'impact', outcome: 'eliminated', target: { isHuman: false } },
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
