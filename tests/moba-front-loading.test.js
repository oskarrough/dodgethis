import { describe, test, expect } from 'bun:test'
import { createLoadingState, descentFrame } from '../src/plugins/moba/front/loading-state.js'
import { createApp } from '../src/core/app.js'
import { createControls } from '../src/plugins/moba/front/controls.js'
import { createStylePresets } from '../src/core/style-presets.js'
import { createFollow } from '../src/plugins/moba/follow.js'
import { tune as kit } from '../src/plugins/moba/tune.js'
import { tune as front } from '../src/plugins/moba/front/tune.js'
import { FLOOR } from '../src/plugins/moba/obstacles.js'
import { localLoadingHero } from '../src/plugins/moba/front/loading-state.js'
import { projectFrame, projectRidge } from '../src/plugins/moba/front/geometry.js'
import * as THREE from 'three'

describe('loading gates', () => {
	test('early skip never bypasses a three-second build', () => {
		const gate = createLoadingState(front.loading)
		gate.skip()
		gate.step(3)
		expect(gate.state.phase).toBe('hold')
		gate.ready()
		gate.step(0)
		expect(gate.state.phase).toBe('descent')
		gate.step(0.4)
		expect(gate.state.progress).toBe(0.5)
		expect(gate.state.frozen).toBe(true)
		gate.step(0.4)
		expect(gate.state.frozen).toBe(false)
	})
	test('readiness does not bypass hold; cancelled builds never descend', () => {
		const gate = createLoadingState(front.loading)
		gate.ready()
		gate.step(1.19)
		expect(gate.state.phase).toBe('hold')
		gate.cancel()
		gate.ready()
		gate.step(10)
		expect(gate.state.phase).toBe('cancelled')
	})
	test('two gates are independent; live duration cannot reverse or divide by zero', () => {
		const tune = { hold: 1.8, dwell: 0.8, duration: 0.8 }
		const a = createLoadingState(tune),
			b = createLoadingState(tune)
		a.ready()
		a.skip()
		a.step(0)
		a.step(0.4)
		tune.duration = 0
		a.step(0.1)
		expect(a.state.progress).toBe(1)
		expect(b.state.phase).toBe('hold')
		expect(() => b.step(NaN)).toThrow()
	})
	test('scope freezes sim and intents, consumes held confirm, and releases cleanly', () => {
		let ticks = 0,
			confirms = 0,
			held = true
		const app = createApp({
			device: {
				sample: () => ({
					move: { x: 0, z: 0 },
					aim: null,
					held: { slot1: held },
					pressed: [],
					released: [],
				}),
				reset() {},
			},
		})
		app.modes.define('match', {
			scheme: 'pointClick',
			start(run) {
				run.system('simulate', () => ticks++)
				return { snapshot: () => ({}), apply: () => false, validFact: () => false }
			},
		})
		const stop = app.use((scope) => {
			scope.clock.pause(() => true)
			scope.intents.suspend(() => true)
		})
		app.modes.start('match')
		const controls = createControls({
			count: 1,
			focus() {},
			activate() {
				confirms++
			},
			back() {},
			device() {},
		})
		controls.pad({ confirm: true }, { buttons: [true] })
		for (let i = 0; i < 180; i++) {
			controls.pad({ confirm: false }, { buttons: [true] })
			app.frame(1 / 60)
		}
		expect(ticks).toBe(0)
		expect(confirms).toBe(1)
		expect(app.intents.get('local').held.slot1).toBeFalsy()
		held = false
		stop()
		app.intents.cancel()
		app.clock.reset()
		app.frame(1 / 60)
		expect(ticks).toBe(1)
		app.dispose()
	})
	for (const [width, height] of [
		[390, 844],
		[1440, 900],
		[2560, 1080],
	])
		test(`real follow handoff at ${width}×${height} stays still with an offset pointer, and pad look-ahead springs instead of snapping`, () => {
			const hero = { x: -43, z: 0 },
				pointer = { x: -30, z: 8 }
			const aspect = width / height
			const landing = descentFrame(1, hero, front.loading, kit.follow, FLOOR, aspect)
			const nearLanding = descentFrame(0.999, hero, front.loading, kit.follow, FLOOR, aspect)
			expect(
				new THREE.Vector3().copy(nearLanding.eye).distanceTo(new THREE.Vector3().copy(landing.eye)),
			).toBeLessThan(0.001)
			const follow = createFollow(kit.follow)
			follow.frame(0, hero, null, { aspect })
			const next = follow.frame(1 / 60, hero, pointer, { pad: false, aspect })
			expect(
				new THREE.Vector3().copy(next.eye).distanceTo(new THREE.Vector3().copy(landing.eye)),
			).toBeLessThan(1e-8)
			expect(next.fov).toBe(landing.fov)
			const pad = follow.frame(1 / 60, hero, pointer, { pad: true, aspect })
			expect(
				new THREE.Vector3().copy(pad.eye).distanceTo(new THREE.Vector3().copy(landing.eye)),
			).toBeLessThan(0.35)
		})
	test('an unskipped three-second build still gets the full ready dwell', () => {
		const gate = createLoadingState(front.loading)
		gate.step(3)
		gate.ready()
		gate.step(front.loading.dwell - 0.001)
		expect(gate.state.phase).toBe('hold')
		gate.step(0.001)
		expect(gate.state.phase).toBe('descent')
	})
	test('arc rises to 50 m and settles pitch before its last tenth', () => {
		const frame = (p) =>
			descentFrame(p, { x: -43, z: 0 }, front.loading, kit.follow, FLOOR, 1440 / 900)
		expect(frame(front.loading.riseEnd).eye.y).toBeCloseTo(50)
		const pitch = (p) => {
			const f = frame(p)
			return Math.atan2(f.eye.y - f.target.y, f.eye.z - f.target.z)
		}
		expect(Math.abs(pitch(0.9) - pitch(1))).toBeLessThan(Math.PI / 180)
	})
	test('whole floor and core tops fit the establishing shot at all three widths', () => {
		for (const [width, height] of [
			[390, 844],
			[1440, 900],
			[2560, 1080],
		]) {
			const f = descentFrame(0, { x: -43, z: 0 }, front.loading, kit.follow, FLOOR, width / height)
			const camera = new THREE.PerspectiveCamera(f.fov, width / height, 0.1, 1000)
			camera.position.copy(f.eye)
			camera.lookAt(new THREE.Vector3().copy(f.target))
			camera.updateMatrixWorld()
			for (const x of [-FLOOR.halfX, FLOOR.halfX])
				for (const z of [-FLOOR.halfZ, FLOOR.halfZ])
					for (const y of [0, 7]) {
						const point = new THREE.Vector3(x, y, z).project(camera)
						expect(Math.abs(point.x)).toBeLessThan(1)
						expect(Math.abs(point.y)).toBeLessThan(1)
						expect(point.z).toBeLessThan(1)
					}
			for (const fraction of [0.12, 0.22, 0.32, 0.65, 0.75, 0.85]) {
				const foot = projectRidge(width, height, width * fraction)
				expect(foot.x).toBeCloseTo(width * fraction, 4)
				expect(foot.y).toBeLessThan(height)
				expect(projectFrame(width, height).worldX(foot.x)).toBeGreaterThan(0)
			}
		}
	})
	test('team B descends onto its own participant even when not first', () => {
		const pos = { x: 43, z: 0 }
		expect(
			localLoadingHero(
				{
					heroes: [
						{ id: 'other', pos: { x: -43, z: 0 } },
						{ id: 'local-B', pos },
					],
				},
				'local-B',
			),
		).toBe(pos)
		expect(() => localLoadingHero({ heroes: [] }, 'missing')).toThrow()
	})
	test('live preset updates remain nestable and restore defaults', () => {
		let value
		const preset = createStylePresets((next) => (value = next))
		const older = preset({ line: 0.65, hatch: 1, alpha: true })
		const newer = preset({ line: 0.8 })
		older.update({ line: 0.9, hatch: 0.3, alpha: true })
		expect(value.line).toBe(0.8)
		newer()
		expect(value.line).toBe(0.9)
		older()
		expect(value).toEqual({ line: 1, hatch: 0, alpha: false })
	})
})
