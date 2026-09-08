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

test('jump leaves the floor, rejects double jumps, and reports one landing on the way down', () => {
	const y = unit.position.y
	expect(unit.consumeLanding()).toBeLessThan(2.5) // the spawn settle stays under the event threshold
	expect(unit.jump()).toBe(true)
	expect(unit.jump()).toBe(false)
	step(30)
	expect(unit.position.y).toBeGreaterThan(y + 1.5)
	expect(unit.jump()).toBe(false)
	step(90)
	expect(Math.abs(unit.position.y - y)).toBeLessThan(0.04)
	expect(unit.consumeLanding()).toBeGreaterThan(0) // the landing is reported once...
	expect(unit.consumeLanding()).toBe(0)
	expect(unit.jump()).toBe(true) // ...and the jump is available again
	unit.eliminate()
	expect(unit.jump()).toBe(false)
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

// Stand on the lowest bleacher and walk toward the court until the first airborne frame over the gap.
function walkOffBleacher() {
	unit.place(ARENA.width / 2 + 1.6, 1, 0)
	step(60)
	unit.consumeLanding()
	for (let i = 0; i < 120 && unit.velocity.y === 0; i++) step(1, { x: -1, z: 0 })
	expect(unit.velocity.y).toBeLessThan(0)
	expect(unit.position.x).toBeLessThan(ARENA.width / 2 + 1.6)
}

test('coyote time forgives a jump just after walking off a bleacher, then expires', () => {
	walkOffBleacher()
	step(2) // ~0.05 s in the air: inside the window
	expect(unit.velocity.y).toBeLessThan(0)
	expect(unit.jump()).toBe(true)
	expect(unit.jump()).toBe(false) // a coyote jump is still one jump
	step(3)
	expect(unit.jump()).toBe(false)
	walkOffBleacher()
	step(11) // 0.2 s in the air: past the window
	expect(unit.velocity.y).toBeLessThan(0)
	expect(unit.jump()).toBe(false)
})
