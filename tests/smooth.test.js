import { expect, test } from 'bun:test'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { createApp, STEP } from '../src/core/app.js'
import { createBody } from '../src/core/body.js'
import { tune } from '../src/plugins/dodgeball/tune.js'

await RAPIER.init({})

test('smoothed objects are posed between the last two sim poses; snaps and teleports do not blend', () => {
	const app = createApp()
	const object = new THREE.Object3D()
	const sim = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() }
	app.system('simulate', () => (sim.position.x += 1))
	const remove = app.smooth(object, () => sim)
	let rendered
	app.system('present', () => (rendered = object.position.x))
	app.frame(0) // a new registration starts where the sim is
	expect(rendered).toBe(0)
	app.frame(STEP * 1.5) // one step (x 0 → 1), half a step left over
	expect(rendered).toBeCloseTo(0.5, 9)
	app.frame(STEP * 0.25)
	expect(rendered).toBeCloseTo(0.75, 9)
	sim.position.x = 50 // a teleport
	app.smooth.snap(object)
	app.frame(0)
	expect(rendered).toBe(50)
	expect(() => app.smooth(object, () => sim)).toThrow('already smoothed')
	remove()
	object.position.x = -1
	app.frame(STEP)
	expect(object.position.x).toBe(-1)
})

test('a smoothed registration ends with its plugin', () => {
	const app = createApp()
	const object = new THREE.Object3D()
	const sim = { position: new THREE.Vector3(3, 0, 0), quaternion: new THREE.Quaternion() }
	const stop = app.use((plugin) => void plugin.smooth(object, () => sim))
	app.frame(0)
	expect(object.position.x).toBe(3)
	stop()
	sim.position.x = 9
	app.frame(STEP)
	expect(object.position.x).toBe(3)
})

// docs/plugin-architecture.md: a unit at constant velocity on a 144 Hz screen moves the same distance every frame.
test('at 144 Hz a walking body renders constant per-frame displacement', () => {
	const app = createApp()
	const scene = new THREE.Scene()
	const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
	world.timestep = STEP
	world.createCollider(RAPIER.ColliderDesc.cuboid(500, 0.5, 20).setTranslation(0, -0.5, 0))
	const body = createBody(scene, world, RAPIER, { profile: tune.player, smooth: app.smooth })
	app.system('simulate', (dt) => {
		body.update({ x: 1, z: 0 }, dt)
		world.step()
		body.sync()
	})
	const rendered = []
	const simulated = []
	app.system('present', () => {
		rendered.push(body.mesh.position.x)
		simulated.push(body.position.x)
	})
	for (let i = 0; i < 144 * 3; i++) app.frame(1 / 144)
	expect(body.velocity.x).toBeCloseTo(tune.player.speed, 3) // at top speed long before the sample
	const deltas = (xs) =>
		xs
			.slice(-144)
			.map((x, i, a) => (i ? x - a[i - 1] : null))
			.slice(1)
	const expected = tune.player.speed / 144
	for (const d of deltas(rendered)) expect(Math.abs(d - expected) / expected).toBeLessThan(0.05)
	// Unsmoothed, the same frames lurch: some move a whole step, some not at all.
	const raw = deltas(simulated)
	expect(Math.min(...raw)).toBe(0)
	expect(Math.max(...raw)).toBeCloseTo(tune.player.speed * STEP, 3)
	body.dispose()
	world.free()
	expect(scene.children).toHaveLength(0)
})
