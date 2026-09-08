import { beforeEach, afterEach, expect, test } from 'bun:test'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { buildCourt } from '../src/court.js'
import { createPlayer } from '../src/player.js'
import { ARENA } from '../src/arena.js'
import { tune } from '../src/tune.js'

await RAPIER.init({})
let scene, world, unit
beforeEach(() => {
	scene = new THREE.Scene()
	world = new RAPIER.World({ x: 0, y: tune.physics.gravity, z: 0 })
	buildCourt(scene, world, RAPIER)
	unit = createPlayer(scene, world, RAPIER)
	step(30)
})
afterEach(() => {
	unit.dispose()
	world.free()
	scene.traverse((obj) => {
		obj.geometry?.dispose()
		obj.material?.dispose()
	})
})
function step(frames, dir = { x: 0, z: 0 }) {
	for (let i = 0; i < frames; i++) {
		unit.update(dir, 1 / 60)
		world.step()
		unit.sync()
	}
}

test('jump leaves the floor, rejects double jumps, and resets on landing', () => {
	const y = unit.position.y
	expect(unit.jump()).toBe(true)
	expect(unit.jump()).toBe(false)
	step(30)
	expect(unit.position.y).toBeGreaterThan(y + 1.5)
	expect(unit.jump()).toBe(false)
	step(90)
	expect(Math.abs(unit.position.y - y)).toBeLessThan(0.04)
	expect(unit.jump()).toBe(true)
	unit.eliminate()
	expect(unit.jump()).toBe(false)
})

test('jump reaches a bleacher and can jump again from its surface', () => {
	unit.place(ARENA.width / 2 - 0.5, unit.position.y, 0)
	step(2)
	expect(unit.jump()).toBe(true)
	const targetX = ARENA.width / 2 + 1.6
	for (let i = 0; i < 120; i++) {
		// Steer and counter-steer: releasing movement preserves air momentum.
		const steer = (targetX - unit.position.x) * 3 - unit.velocity.x * 0.6
		step(1, { x: Math.max(-1, Math.min(1, steer)), z: 0 })
	}
	const feet = unit.position.y - tune.player.radius - tune.player.halfHeight
	expect(unit.position.x).toBeGreaterThan(ARENA.width / 2 + 1.3)
	expect(feet).toBeGreaterThan(-0.2)
	expect(feet).toBeLessThan(0.75)
	expect(unit.jump()).toBe(true)
})

test('contact with the next riser does not cancel a jump from the lowest bleacher', () => {
	unit.place(ARENA.width / 2 + 1.6, 1, 0)
	step(60)
	const y = unit.position.y
	expect(unit.jump()).toBe(true)
	step(20)
	expect(unit.position.y).toBeGreaterThan(y + 1)
	expect(unit.jump()).toBe(false)
})

test('air dash preserves jump height and does not teleport from outside the court', () => {
	unit.place(ARENA.width / 2 + 1.6 + 2 * 0.65, 2, 0)
	step(60)
	expect(unit.jump()).toBe(true)
	step(10)
	const before = unit.position.clone()
	expect(unit.dash({ x: 0, z: 1 })).toBe(true)
	step(6)
	expect(unit.position.x).toBeCloseTo(before.x, 2)
	expect(unit.position.z).toBeGreaterThan(before.z + 1)
	expect(unit.position.y).toBeGreaterThan(before.y)
})
