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

test('Space jumps once per tap; either Shift dashes; blur and modal resets discard the queue', () => {
	const key = (code, repeat = false) => {
		const event = Object.assign(new Event('keydown', { cancelable: true }), { code, repeat })
		browser.dispatchEvent(event)
		return event
	}
	expect(key('Space').defaultPrevented).toBe(true)
	expect(input.consumeJump()).toBe(true)
	expect(input.consumeJump()).toBe(false)
	expect(input.consumeDash()).toBe(false)
	key('Space', true)
	expect(input.consumeJump()).toBe(false)
	for (const code of ['ShiftLeft', 'ShiftRight']) {
		key(code)
		expect(input.consumeDash()).toBe(true)
		expect(input.consumeDash()).toBe(false)
		expect(input.consumeJump()).toBe(false)
		key(code, true)
		expect(input.consumeDash()).toBe(false)
	}
	for (const reset of [() => browser.dispatchEvent(new Event('blur')), input.resetActions]) {
		key('Space')
		reset()
		expect(input.consumeJump()).toBe(false)
	}
})

test('a press aims at its own coordinates, and canceling it discards the queued shot', () => {
	const press = (clientX, clientY) =>
		canvas.dispatchEvent(
			Object.assign(new Event('pointerdown'), { button: 0, pointerId: 1, clientX, clientY }),
		)
	press(750, 200) // no pointermove has ever arrived
	expect(input.pointerNDC()).toEqual({ x: 0.5, y: 0.5 })
	press(500, 400)
	canvas.dispatchEvent(Object.assign(new Event('pointercancel'), { pointerId: 1 }))
	expect(input.pointerDown()).toBe(false)
	expect(input.consumePress()).toBe(false)
	expect(input.consumeRelease()).toBe(false)
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

test('a pad consumes each gesture once, and blur, pause or disconnect never leave one held', () => {
	// Disconnecting mid-charge cancels the charge and every pending pad action.
	let gp = pad()
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

	// A trigger held across blur or a reconnect must be released before it charges again.
	gp = pad()
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

	// The D-pad picks a weapon once per press, matching the advertised controls.
	gp = pad()
	gp.buttons[15].pressed = true
	input.pollGamepad(1 / 60)
	expect(input.consumeWeaponSwitch()).toBe('bowl')
	input.pollGamepad(1 / 60)
	expect(input.consumeWeaponSwitch()).toBeNull()
	gp.buttons[15].pressed = false
	gp.buttons[14].pressed = true
	input.pollGamepad(1 / 60)
	expect(input.consumeWeaponSwitch()).toBe('bow')

	// Start pauses once, and the modal handoff swallows gameplay gestures still held down.
	gp = pad()
	gp.buttons[9].pressed = true
	gp.buttons[7].pressed = true
	gp.buttons[4].pressed = true
	input.pollGamepad(1 / 60)
	expect(input.consumePause()).toBe(true)
	expect(input.consumePause()).toBe(false)
	input.resetActions()
	input.pollGamepad(1 / 60)
	expect(input.pointerDown()).toBe(false)
	expect(input.consumePress()).toBe(false)
	expect(input.consumeDash()).toBe(false)
	gp.buttons.forEach((b) => {
		b.pressed = false
	})
	input.pollGamepad(1 / 60)
	gp.buttons[7].pressed = true
	input.pollGamepad(1 / 60)
	expect(input.consumePress()).toBe(true)
})

test('a stalled tab cannot jump the virtual cursor through unbounded elapsed time', () => {
	const gp = pad()
	browser.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: 500, clientY: 400 }))
	gp.axes[2] = 1
	input.pollGamepad(60)
	expect(input.pointerNDC().x).toBeCloseTo(0.17, 6)
})
