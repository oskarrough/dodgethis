import { afterEach, beforeEach, expect, test } from 'bun:test'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { createPlayer } from '../src/player.js'
import { createArrow } from '../src/arrow.js'

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
	// Elimination hands a neutral visual to death feedback, with no impulse left running.
	unit.eliminate()
	expect(unit.visual.position.toArray()).toEqual([0, 0, 0])
	expect(unit.visual.scale.toArray()).toEqual([1, 1, 1])
	expect(unit.visual.rotation.x).toBe(0)
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
