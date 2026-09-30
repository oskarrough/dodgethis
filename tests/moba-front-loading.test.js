import { describe, test, expect } from 'bun:test'
import { createLoadingState, descentFrame } from '../src/plugins/moba/front/loading-state.js'
import { createApp } from '../src/core/app.js'
import { createControls } from '../src/plugins/moba/front/controls.js'
import { createStylePresets } from '../src/core/style-presets.js'

describe('loading gates', () => {
	test('early skip never bypasses a three-second build', () => {
		const gate = createLoadingState({ hold: 1.2, duration: 0.8 })
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
		const gate = createLoadingState({ hold: 1.2, duration: 0.8 })
		gate.ready()
		gate.step(1.19)
		expect(gate.state.phase).toBe('hold')
		gate.cancel()
		gate.ready()
		gate.step(10)
		expect(gate.state.phase).toBe('cancelled')
	})
	test('two gates are independent; live duration cannot reverse or divide by zero', () => {
		const tune = { hold: 1.2, duration: 0.8 }
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
	test('descent ends exactly on the bounded follow pose', () => {
		const start = { height: 38, back: 48, targetX: 0, targetY: 8, fov: 65 }
		const follow = { height: 20, back: 12, fov: 50 }
		const bounds = { halfX: 48, halfZ: 18 }
		for (const progress of [0, 0.5, 1]) {
			const frame = descentFrame(progress, { x: -43, z: 0 }, start, follow, bounds)
			expect(Math.abs(frame.eye.x)).toBeLessThanOrEqual(48)
			expect(Math.abs(frame.target.z)).toBeLessThanOrEqual(18)
			expect(Number.isFinite(frame.fov)).toBe(true)
		}
		expect(descentFrame(1, { x: -43, z: 0 }, start, follow, bounds)).toEqual({
			eye: { x: -43, y: 20, z: 12 },
			target: { x: -43, y: 0, z: 0 },
			fov: 50,
		})
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
