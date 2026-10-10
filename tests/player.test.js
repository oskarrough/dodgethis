import { afterEach, beforeEach, expect, test } from 'bun:test'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { createPlayer } from '../src/plugins/dodgeball/unit.js'
import { createArrow } from '../src/plugins/dodgeball/arrow.js'

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
