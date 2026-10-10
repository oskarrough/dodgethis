// window.dt, the in-page proof API: send what the player's hardware would, then wait on dt.screen().
// Screens are named by whichever run exposes `screen` on window.game; otherwise the active mode's id.
const BUTTONS = {
	a: 0,
	b: 1,
	x: 2,
	y: 3,
	lb: 4,
	rb: 5,
	lt: 6,
	rt: 7,
	back: 8,
	start: 9,
	ls: 10,
	rs: 11,
	up: 12,
	down: 13,
	left: 14,
	right: 15,
}

const frame = () => new Promise(requestAnimationFrame)
// At least two frames, so one input phase is sure to see the key or button down; then `ms`,
// then until `until()` is true. False if `until` was still false after ten seconds.
async function hold(ms, until) {
	await Promise.all([frame().then(frame), new Promise((resolve) => setTimeout(resolve, ms))])
	const end = performance.now() + 10000
	while (until && !until()) {
		if (performance.now() > end) return false
		await frame()
	}
	return true
}

// KeyboardEvent.key for a code, close enough for handlers that read it.
function keyOf(code) {
	const letter = /^Key([A-Z])$/.exec(code)
	if (letter) return letter[1].toLowerCase()
	const digit = /^Digit(\d)$/.exec(code)
	if (digit) return digit[1]
	const modifier = /^(Shift|Control|Alt|Meta)(Left|Right)$/.exec(code)
	if (modifier) return modifier[1]
	return { Space: ' ', Backquote: '`' }[code] ?? code
}

export function createProofApi(app, input) {
	const screen = () => app.debug.game.screen ?? app.modes.active
	let mock = null
	// Polled idle first, like a pad plugged in earlier, so the first press counts as fresh.
	async function installPad() {
		if (mock) return mock
		mock = {
			id: 'dt mock pad',
			index: 0,
			connected: true,
			mapping: 'standard',
			timestamp: 0,
			axes: [0, 0, 0, 0],
			buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
		}
		Object.defineProperty(navigator, 'getGamepads', { value: () => [mock], configurable: true })
		await frame().then(frame)
		return mock
	}
	return {
		screen,
		device: () => input.activeDevice(),
		get game() {
			return app.debug.game
		},
		// A down/up pair on the focused element, as a real key would arrive; resolves to the screen after.
		// Each half goes to whatever has focus then, so a release still lands after the press removed its element.
		async key(code, { hold: ms = 0, until } = {}) {
			const send = (type) =>
				(document.activeElement ?? document.body).dispatchEvent(
					new KeyboardEvent(type, { code, key: keyOf(code), bubbles: true, cancelable: true }),
				)
			send('keydown')
			const held = await hold(ms, until)
			send('keyup')
			await frame()
			if (!held) throw new Error(`${code} released before until() held`)
			return screen()
		},
		// A standard-mapping pad, plugged in on first use. Buttons by index or name (a, b, start, up…).
		pad: {
			async press(button, { hold: ms = 0, until } = {}) {
				const b = (await installPad()).buttons[
					typeof button === 'number' ? button : BUTTONS[button]
				]
				if (!b) throw new Error(`Unknown pad button: ${button}`)
				Object.assign(b, { pressed: true, touched: true, value: 1 })
				const held = await hold(ms, until)
				Object.assign(b, { pressed: false, touched: false, value: 0 })
				await frame().then(frame)
				if (!held) throw new Error(`Pad ${button} released before until() held`)
				return screen()
			},
			// Stays where it is put; stick(0, 0) lets go.
			async stick(x, y, side = 'left') {
				if (![x, y].every((v) => Number.isFinite(v) && Math.abs(v) <= 1))
					throw new Error('Stick axes are within -1..1')
				const axes = (await installPad()).axes
				const i = side === 'right' ? 2 : 0
				axes[i] = x
				axes[i + 1] = y
				await frame().then(frame)
				return screen()
			},
		},
	}
}
