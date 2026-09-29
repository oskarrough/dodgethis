import { expect, test } from 'bun:test'
import { createApp } from '../src/core/app.js'
import { createStylePresets } from '../src/core/style-presets.js'
import { createControls } from '../src/plugins/moba/front/controls.js'
import { projectFrame, easePointer } from '../src/plugins/moba/front/geometry.js'

test('the sign shares an undistorted slice projection at wide and narrow aspect ratios', () => {
	for (const [width, height] of [
		[1440, 900],
		[2560, 1080],
		[390, 844],
	]) {
		const shot = projectFrame(width, height)
		expect(shot.scale).toBe(Math.max((width * 1.1) / 1440, (height * 1.1) / 900))
		expect(shot.signX - 95 * shot.scale).toBeGreaterThan(0)
		expect(shot.signX + 95 * shot.scale).toBeLessThan(width)
		expect(shot.ground).toBeGreaterThan(0)
	}
})

test('pointer easing never overshoots, is frame-rate independent and holds for zero time', () => {
	expect(easePointer(0, 1, 0, 0.18)).toBe(0)
	const once = easePointer(0, 1, 1 / 30, 0.18)
	const twice = easePointer(easePointer(0, 1, 1 / 60, 0.18), 1, 1 / 60, 0.18)
	expect(once).toBeCloseTo(twice, 12)
	for (const dt of [0, 0.001, 0.1, 1, 10]) {
		expect(easePointer(-1, 1, dt, 0.18)).toBeGreaterThanOrEqual(-1)
		expect(easePointer(-1, 1, dt, 0.18)).toBeLessThanOrEqual(1)
	}
})

test('render demands stop drawing, not input or presentation, and release with their scope', () => {
	const app = createApp()
	let frames = 0
	app.system('present', () => frames++)
	const remove = app.use((run) => {
		run.renderDemand(() => false)
		run.clock.pause(() => true)
	})
	expect(app.shouldRender).toBe(false)
	app.frame(1 / 60)
	expect(frames).toBe(1)
	remove()
	expect(app.shouldRender).toBe(true)
})

test('style overrides validate and restore exactly, even with out-of-order disposal', () => {
	let value
	const set = createStylePresets((next) => {
		value = next
	})
	const first = set({ line: 0.5, hatch: 1, alpha: true })
	const second = set({ line: 0.25 })
	first()
	expect(value).toEqual({ line: 0.25, hatch: 1, alpha: true })
	second()
	second()
	expect(value).toEqual({ line: 1, hatch: 0, alpha: false })
	for (const preset of [{ line: NaN }, { line: 0 }, { hatch: 2 }, { alpha: 1 }])
		expect(() => set(preset)).toThrow('Invalid style preset')
})

test('preset is restored when a run stops', () => {
	let value
	const app = createApp({
		setStylePreset: createStylePresets((next) => {
			value = next
		}),
	})
	const remove = app.use((run) => run.setStylePreset({ line: 0.5, hatch: 1, alpha: true }))
	remove()
	expect(value).toEqual({ line: 1, hatch: 0, alpha: false })
})

function harness() {
	const focused = [],
		activated = [],
		devices = []
	let backs = 0
	const controls = createControls({
		count: 2,
		focus: (i) => focused.push(i),
		activate: (i) => activated.push(i),
		back: () => backs++,
		device: (d) => devices.push(d),
	})
	const key = (code, shiftKey = false, repeat = false) => {
		const event = {
			code,
			shiftKey,
			repeat,
			defaultPrevented: false,
			preventDefault() {
				this.defaultPrevented = true
			},
		}
		controls.key(event)
		return event
	}
	return { controls, focused, activated, devices, key, backs: () => backs }
}

test('Tab only moves, Shift-Tab reverses, Enter confirms only the focused control', () => {
	const h = harness()
	h.key('Tab')
	expect(h.focused).toEqual([1])
	expect(h.activated).toEqual([])
	h.key('Tab', true)
	h.key('Enter')
	h.key('Enter', false, true)
	expect(h.activated).toEqual([0])
	expect(h.key('Escape').defaultPrevented).toBe(true)
	expect(h.backs()).toBe(1)
})

test('mouse, keyboard and pad share selection; B is a rising edge and beats confirm', () => {
	const h = harness()
	h.controls.point(1)
	h.controls.pad({ move: 0, confirm: true }, { buttons: [] })
	expect(h.activated).toEqual([1])
	h.controls.pad({ move: 1, confirm: false }, { buttons: [] })
	h.controls.pad({ move: 0, confirm: true }, { buttons: [false, true] })
	h.controls.pad({ move: 0, confirm: false }, { buttons: [false, true] })
	expect(h.backs()).toBe(1)
	expect(h.activated).toEqual([1])
	h.controls.pad({ move: 0, confirm: false }, null)
	h.controls.pad({ move: 0, confirm: false }, { buttons: [false, true] })
	expect(h.backs()).toBe(2)
})
