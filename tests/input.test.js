import { afterAll, afterEach, expect, test } from 'bun:test'

const globals = Object.fromEntries(
	['window', 'document', 'navigator'].map((key) => [
		key,
		Object.getOwnPropertyDescriptor(globalThis, key),
	]),
)
const canvas = Object.assign(new EventTarget(), { setPointerCapture() {} })
const browser = Object.assign(new EventTarget(), { innerWidth: 1000, innerHeight: 800 })
let pads = []
Object.defineProperty(globalThis, 'window', { configurable: true, value: browser })
Object.defineProperty(globalThis, 'document', {
	configurable: true,
	value: { querySelector: () => canvas },
})
Object.defineProperty(globalThis, 'navigator', {
	configurable: true,
	value: { getGamepads: () => pads },
})
const input = await import('../src/input.js')

afterEach(() => {
	browser.dispatchEvent(new Event('blur'))
	pads = []
	input.pollGamepad(0)
})
afterAll(() => {
	for (const [key, descriptor] of Object.entries(globals)) {
		if (descriptor) Object.defineProperty(globalThis, key, descriptor)
		else delete globalThis[key]
	}
})

function pad() {
	const gamepad = {
		connected: true,
		axes: [0, 0, 0, 0],
		buttons: Array.from({ length: 17 }, () => ({ pressed: false })),
	}
	pads = [gamepad]
	input.pollGamepad(0)
	return gamepad
}

test('idle connected pads do not steal prompts from mouse/keyboard', () => {
	const gp = pad()
	input.pollGamepad(1 / 60)
	expect(input.activeDevice()).toBe('keyboard')
	gp.buttons[7].pressed = true
	input.pollGamepad(1 / 60)
	expect(input.activeDevice()).toBe('gamepad')
	browser.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: 200, clientY: 200 }))
	input.pollGamepad(1 / 60) // a held button is not a new device change
	expect(input.activeDevice()).toBe('keyboard')
	gp.axes[0] = 0.7
	input.pollGamepad(1 / 60)
	expect(input.activeDevice()).toBe('gamepad')
})

test('disconnect cancels held charge and pending pad actions without a release', () => {
	const gp = pad()
	gp.buttons[7].pressed = true
	gp.buttons[4].pressed = true
	gp.buttons[15].pressed = true
	input.pollGamepad(1 / 60)
	expect(input.pointerDown()).toBe(true)
	pads = []
	input.pollGamepad(1 / 60)
	expect(input.pointerDown()).toBe(false)
	expect(input.consumePress()).toBe(false)
	expect(input.consumeRelease()).toBe(false)
	expect(input.consumeDash()).toBe(false)
	expect(input.consumeWeaponSwitch()).toBeNull()
	expect(input.consumeMenuInput()).toEqual({ move: 0, confirm: false })
	expect(input.activeDevice()).toBe('keyboard')
})

test('a trigger held across blur or reconnect must be released before charging again', () => {
	const gp = pad()
	gp.buttons[7].pressed = true
	input.pollGamepad(1 / 60)
	expect(input.consumePress()).toBe(true)
	browser.dispatchEvent(new Event('blur'))
	input.pollGamepad(1 / 60)
	expect(input.pointerDown()).toBe(false)
	expect(input.consumePress()).toBe(false)
	gp.buttons[7].pressed = false
	input.pollGamepad(1 / 60)
	expect(input.consumeRelease()).toBe(false)
	gp.buttons[7].pressed = true
	input.pollGamepad(1 / 60)
	expect(input.consumePress()).toBe(true)
	pads = []
	input.pollGamepad(1 / 60)
	pads = [gp]
	input.pollGamepad(1 / 60)
	expect(input.pointerDown()).toBe(false)
	expect(input.consumeRelease()).toBe(false)
})

test('D-pad selects a weapon once per press, matching the advertised controls', () => {
	const gp = pad()
	gp.buttons[15].pressed = true
	input.pollGamepad(1 / 60)
	expect(input.consumeWeaponSwitch()).toBe('bowl')
	input.pollGamepad(1 / 60)
	expect(input.consumeWeaponSwitch()).toBeNull()
	gp.buttons[15].pressed = false
	gp.buttons[14].pressed = true
	input.pollGamepad(1 / 60)
	expect(input.consumeWeaponSwitch()).toBe('bow')
})

test('a stalled tab cannot jump the virtual cursor through unbounded elapsed time', () => {
	const gp = pad()
	browser.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: 500, clientY: 400 }))
	gp.axes[2] = 1
	input.pollGamepad(60)
	expect(input.pointerNDC().x).toBeCloseTo(0.17, 6)
})
