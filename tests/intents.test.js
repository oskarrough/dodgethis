import { expect, test } from 'bun:test'
import {
	createIntents,
	direct,
	neutralFrame,
	pointClick,
	POINT_CLICK,
	stickVector,
	validIntent,
} from '../src/core/intents.js'
import { createApp, STEP } from '../src/core/app.js'

const sample = (overrides = {}) => ({ ...neutralFrame(), ...overrides })
const actions = (frame) => frame.pressed.map((e) => e.action)

test('validIntent accepts plain frames and rejects anything malformed', () => {
	const good = sample({
		move: { x: 0.6, z: -0.8 },
		aim: { x: 3, z: -2 },
		held: { primary: true },
		pressed: [
			{ action: 'dash', at: { x: 1, z: 1 } },
			{ action: 'slot2', at: null },
		],
		released: ['primary'],
	})
	expect(validIntent(good)).toBe(true)
	expect(validIntent(neutralFrame())).toBe(true)
	for (const bad of [
		null,
		[],
		{ ...good, move: { x: 1, z: 1 } },
		{ ...good, move: { x: NaN, z: 0 } },
		{ ...good, aim: { x: 1e9, z: 0 } },
		{ ...good, order: 'here' },
		{ ...good, held: { primary: 1 } },
		{ ...good, held: { fly: true } },
		{ ...good, held: [] },
		{ ...good, pressed: [{ action: 'teleport', at: null }] },
		{ ...good, pressed: [{ action: 'dash', at: { x: 0 } }] },
		{ ...good, pressed: Array.from({ length: 17 }, () => ({ action: 'dash', at: null })) },
		{ ...good, released: ['primary', 'nope'] },
		{ ...good, released: 'primary' },
	])
		expect(validIntent(bad)).toBe(false)
})

test('the direct scheme maps the device onto the vocabulary, pressing at the aim of that moment', () => {
	const queued = { slot: 'slot2', press: true, release: false, dash: true, jump: true }
	const device = {
		moveVector: () => ({ x: 1, z: 0 }),
		pointerDown: () => true,
		consumeSlot: () => queued.slot,
		consumePress: () => queued.press,
		consumeRelease: () => queued.release,
		consumeDash: () => queued.dash,
		consumeJump: () => queued.jump,
	}
	const frame = direct(device, () => ({ x: 2, y: 0, z: -3 }))
	expect(validIntent(frame)).toBe(true)
	expect(frame.move).toEqual({ x: 1, z: 0 })
	expect(frame.aim).toEqual({ x: 2, z: -3 })
	expect(frame.held).toEqual({ primary: true })
	expect(frame.pressed).toEqual(
		['slot2', 'primary', 'dash', 'jump'].map((action) => ({ action, at: { x: 2, z: -3 } })),
	)
	Object.assign(queued, { slot: null, press: false, release: true, dash: false, jump: false })
	const miss = direct(device, () => null)
	expect(miss.aim).toBeNull()
	expect(miss.pressed).toEqual([])
	expect(miss.released).toEqual(['primary'])
})

test('dash and jump stay buffered for 0.1 s of steps unless consumed; other presses last one step', () => {
	const intents = createIntents()
	intents.feed(
		'p',
		sample({
			pressed: [
				{ action: 'dash', at: null },
				{ action: 'primary', at: null },
			],
		}),
	)
	intents.feed('p', sample({ pressed: [{ action: 'jump', at: null }], released: ['primary'] }))
	expect(actions(intents.get('p'))).toEqual(['dash', 'primary', 'jump'])
	expect(intents.get('p').released).toEqual(['primary'])
	intents.age(STEP)
	expect(actions(intents.get('p'))).toEqual(['dash', 'jump'])
	expect(intents.get('p').released).toEqual([])
	intents.consume('p', 'jump')
	let steps = 1
	while (intents.get('p').pressed.length) {
		intents.age(STEP)
		steps++
	}
	expect(steps).toBe(6) // seen by six steps: 0, 1/60 … 5/60 s after the press
	// Frames between steps (a 144 Hz screen) keep an edge until a step sees it.
	intents.feed('p', sample({ pressed: [{ action: 'primary', at: null }] }))
	intents.feed('p', sample())
	intents.feed('p', sample())
	expect(actions(intents.get('p'))).toEqual(['primary'])
})

test('suspension neutralizes the frame and cancels once; cancel and drain clear what is queued', () => {
	const intents = createIntents()
	intents.feed('p', sample({ move: { x: 1, z: 0 }, held: { primary: true } }))
	for (let i = 0; i < 3; i++)
		intents.feed(
			'p',
			sample({ move: { x: 1, z: 0 }, pressed: [{ action: 'dash', at: null }] }),
			true,
		)
	expect(intents.get('p').move).toEqual({ x: 0, z: 0 })
	expect(intents.get('p').held).toEqual({})
	expect(actions(intents.get('p'))).toEqual(['cancel'])
	intents.feed('p', sample({ move: { x: 0, z: 1 }, pressed: [{ action: 'jump', at: null }] }))
	intents.press('p', 'slot2')
	expect(actions(intents.get('p'))).toEqual(['cancel', 'jump', 'slot2'])
	const drained = intents.drain('p')
	expect(actions(drained)).toEqual(['cancel', 'jump', 'slot2'])
	expect(drained.move).toEqual({ x: 0, z: 1 })
	expect(intents.get('p').pressed).toEqual([])
	intents.feed('p', sample({ held: { primary: true }, pressed: [{ action: 'dash', at: null }] }))
	intents.cancel()
	expect(intents.get('p')).toEqual({ ...neutralFrame(), pressed: [{ action: 'cancel', at: null }] })
	expect(() => intents.press('p', 'fly')).toThrow('Unknown action')
})

test('the kernel feeds the local frame from the device and ages it after each step', () => {
	const resets = []
	let pending = [{ action: 'jump', at: null }]
	const app = createApp({
		device: {
			sample: (scheme) => {
				const pressed = pending
				pending = []
				return sample({ move: { x: scheme === 'direct' ? 1 : 0, z: 0 }, pressed })
			},
			reset: () => resets.push('reset'),
		},
	})
	const seen = []
	app.modes.define('m', {
		scheme: 'direct',
		start(run) {
			run.intents.suspend(() => hold)
			run.system('simulate', () => seen.push(actions(run.intents.get('local'))))
			return { epoch: 1, snapshot: () => ({}), apply() {}, validFact: () => true }
		},
	})
	let hold = false
	app.frame(STEP) // no mode yet: the device is not read
	expect(pending).toHaveLength(1)
	app.modes.start('m')
	app.frame(STEP * 2)
	expect(app.intents.get('local').move).toEqual({ x: 1, z: 0 })
	expect(seen).toEqual([['jump'], ['jump']])
	app.intents.consume('local', 'jump')
	hold = true
	app.frame(STEP)
	expect(seen.at(-1)).toEqual(['cancel'])
	app.intents.cancel()
	expect(resets).toEqual(['reset'])
	app.modes.stop()
	hold = false
	pending = [{ action: 'dash', at: null }]
	app.frame(STEP)
	expect(pending).toHaveLength(1)
})

// A fake device for pointClick: keys, the right button, and a pad whose axes and buttons tests set directly.
function clicker() {
	const d = {
		device: 'keyboard',
		keys: [],
		order: false,
		orderHeld: false,
		time: 0,
		activeDevice: () => d.device,
		consumeKeys: () => d.keys.splice(0),
		consumeOrder() {
			const o = d.order
			d.order = false
			return o
		},
		orderDown: () => d.orderHeld,
		now: () => d.time,
		pad: () => d.padState,
		padState: null,
		consumeSlot: () => null,
		consumePress: () => false,
		consumeRelease: () => false,
		consumeDash: () => false,
		consumeJump: () => false,
	}
	return d
}
const buttons = (...down) => Array.from({ length: 16 }, (_, i) => down.includes(i))

test('pointClick: RMB orders at the cursor and again every resend ms while held; keys quick-cast at the cursor', () => {
	const d = clicker()
	const poll = pointClick(d, () => ({ x: 4, y: 0, z: -2 }), { ...POINT_CLICK, quickCast: true })
	d.order = true
	d.orderHeld = true
	d.keys.push('KeyQ', 'KeyS', 'KeyX')
	let f = poll()
	expect(validIntent(f)).toBe(true)
	expect(f.order).toEqual({ x: 4, z: -2 })
	expect(f.pressed).toEqual([
		{ action: 'slot1', at: { x: 4, z: -2 } },
		{ action: 'stop', at: null },
	])
	d.time = POINT_CLICK.resend / 2
	expect(poll().order).toBeNull()
	d.time = POINT_CLICK.resend
	expect(poll().order).toEqual({ x: 4, z: -2 })
	d.orderHeld = false
	d.time = 400
	expect(poll().order).toBeNull()

	// An order survives until a step has seen it, even when the next device sample has none.
	const intents = createIntents()
	intents.use('pointClick')
	intents.feed('p', sample({ order: { x: 1, z: 1 } }))
	intents.feed('p', sample())
	expect(intents.get('p').order).toEqual({ x: 1, z: 1 })
	intents.age(STEP)
	expect(intents.get('p').order).toBeNull()
})

test('pointClick on a pad: a curved left stick, hold to aim with the mode’s stickAim, fire on release, B cancels', () => {
	const d = clicker()
	d.device = 'gamepad'
	const aims = []
	const stickAim = (dir, magnitude, slot) => {
		aims.push({ dir, magnitude, slot })
		return { x: 10, z: 0 }
	}
	const sample = pointClick(d, () => null)
	d.padState = { axes: [0.1, 0, 0, 0], buttons: buttons() }
	expect(sample(stickAim).move).toEqual({ x: 0, z: 0 }) // inside the deadzone
	d.padState = { axes: [0.59, 0, 1, 0], buttons: buttons(5) }
	let f = sample(stickAim)
	expect(f.move.x).toBeCloseTo(0.5 ** 1.5, 6)
	expect(f.held).toEqual({ slot1: true })
	expect(f.pressed).toEqual([])
	expect(aims.at(-1)).toEqual({ dir: { x: 1, z: 0 }, magnitude: 1, slot: 'slot1' })
	d.padState = { axes: [0, 0, 0, 0], buttons: buttons() }
	f = sample(stickAim)
	expect(f.held).toEqual({})
	expect(f.pressed).toEqual([{ action: 'slot1', at: { x: 10, z: 0 } }])
	expect(aims.at(-1)).toEqual({ dir: null, magnitude: 0, slot: 'slot1' })
	// B while aiming: no cast on release, one cancel.
	d.padState = { axes: [0, 0, 0, 0], buttons: buttons(5) }
	sample(stickAim)
	d.padState = { axes: [0, 0, 0, 0], buttons: buttons(5, 1) }
	expect(sample(stickAim).pressed).toEqual([{ action: 'cancel', at: null }])
	d.padState = { axes: [0, 0, 0, 0], buttons: buttons() }
	expect(sample(stickAim).pressed).toEqual([])
	// A and X are taps at the aim; a lost pad drops a held aim silently.
	d.padState = { axes: [0, 0, 0, 0], buttons: buttons(0, 2, 7) }
	f = sample(stickAim)
	expect(f.pressed.map((e) => e.action)).toEqual(['primary', 'slot5'])
	expect(f.held).toEqual({ slot2: true })
	d.padState = null
	f = sample(stickAim)
	expect(f.held).toEqual({})
	expect(f.pressed).toEqual([])
	expect(stickVector(0.6, 0.8, 0.18, 1.5).magnitude).toBeCloseTo(1, 9)
})

test('the kernel hands the device the newest live stickAim, scoped to its registrant', () => {
	const contexts = []
	const app = createApp({
		input: {},
		device: {
			sample: (scheme, context) => {
				contexts.push(context)
				return neutralFrame()
			},
			reset() {},
		},
	})
	app.modes.define('m', {
		scheme: 'pointClick',
		start(run) {
			run.input.stickAim(() => ({ x: 1, z: 2 }))
			return { epoch: 1, snapshot: () => ({}), apply() {}, validFact: () => true }
		},
	})
	app.modes.start('m')
	app.frame(0)
	expect(contexts.at(-1).stickAim(null, 0, null)).toEqual({ x: 1, z: 2 })
	app.modes.stop()
	app.modes.start('m')
	app.frame(0)
	expect(contexts.at(-1).stickAim).toBeFunction()
	app.modes.stop()
	app.frame(0)
	expect(contexts).toHaveLength(2)
})
