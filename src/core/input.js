import { tune } from './tune.js'

// Minimal keyboard state. Reads WASD / arrows into a normalized move vector.
const keys = new Set()
let device = 'keyboard'
let slotQueued = null // keys and on-screen buttons
let padSlotQueued = null // the D-pad, dropped on disconnect
let pauseQueued = false
let padNeedsRelease = false
const previousPadButtons = []

export function activeDevice() {
	return device
}

// Digits 1–5 and the D-pad's left/right pick slots; the newest pick wins.
export function consumeSlot() {
	const slot = padSlotQueued ?? slotQueued
	slotQueued = null
	padSlotQueued = null
	return slot
}

window.addEventListener('pointerdown', () => {
	device = 'keyboard'
})

// Every fresh key-down, in order, for schemes that bind letters (pointClick's Q W E R Z S).
const keyEdges = []
export function consumeKeys() {
	return keyEdges.splice(0)
}

// Jump and dash are Space and Shift edges, with Space's page-scroll suppressed.
let jumpQueued = false
let dashQueued = false
let padDashQueued = false

window.addEventListener('keydown', (e) => {
	device = 'keyboard'
	if (e.code === 'Space') {
		if (!e.repeat) jumpQueued = true
		e.preventDefault()
	}
	if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
		if (!e.repeat) dashQueued = true
	}
	const typing = !!e.target?.closest?.('input, textarea')
	const digit = /^Digit([1-5])$/.exec(e.code)
	if (digit && !e.repeat && !typing) slotQueued = `slot${digit[1]}`
	if (!e.repeat && !typing && keyEdges.length < 16) keyEdges.push(e.code)
	keys.add(e.code)
})
// Every key-up, in order, so a hold-to-aim scheme never misses a release. Blur clears them (and the held set) instead.
const keyUps = []
export function consumeKeyUps() {
	return keyUps.splice(0)
}
export const keyHeld = (code) => keys.has(code)
window.addEventListener('keyup', (e) => {
	if (keys.delete(e.code) && keyUps.length < 16) keyUps.push(e.code)
})
window.addEventListener('blur', () => {
	pauseQueued = false
	keys.clear()
	jumpQueued = false
	dashQueued = false
	padDashQueued = false
	slotQueued = null
	padSlotQueued = null
	keyEdges.length = 0
	keyUps.length = 0
	padNeedsRelease = true
})

export function consumeJump() {
	const queued = jumpQueued
	jumpQueued = false
	return queued
}

// True once per dash tap; clears the flag so each press is a single burst.
export function consumeDash() {
	if (dashQueued || padDashQueued) {
		dashQueued = false
		padDashQueued = false
		return true
	}
	return false
}

// Sum keyboard and gamepad movement into a clamped world-space vector, with forward along -z.
export function moveVector() {
	let x = padMove.x
	let z = padMove.z
	if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1
	if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1
	if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1
	if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1
	const len = Math.hypot(x, z)
	if (len > 1) {
		x /= len
		z /= len
	}
	return { x, z }
}

// --- Pointer (aim) + shoot edge-detect ---
// The left button provides press, release, and held signals; blur cancels held state without firing.
const canvas = document.querySelector('.app')
const pointer = { x: 0, y: 0 }
let pressQueued = false
let releaseQueued = false
let pointerHeld = false
let padShootHeld = false
let activePointerId = null

window.addEventListener('pointermove', (e) => {
	device = 'keyboard'
	pointer.x = (e.clientX / window.innerWidth) * 2 - 1
	pointer.y = -(e.clientY / window.innerHeight) * 2 + 1
})
canvas.addEventListener('pointerdown', (e) => {
	if (e.button !== 0) return
	pointer.x = (e.clientX / window.innerWidth) * 2 - 1
	pointer.y = -(e.clientY / window.innerHeight) * 2 + 1
	const wasHeld = pointerHeld || padShootHeld
	activePointerId = e.pointerId
	canvas.setPointerCapture(e.pointerId)
	pointerHeld = true
	if (!wasHeld) pressQueued = true
})
canvas.addEventListener('pointerup', (e) => {
	if (e.button !== 0 || e.pointerId !== activePointerId) return
	activePointerId = null
	pointerHeld = false
	if (!padShootHeld) releaseQueued = true
})
canvas.addEventListener('pointercancel', (e) => {
	if (e.pointerId !== activePointerId) return
	activePointerId = null
	pointerHeld = false
	if (!padShootHeld) clearShoot()
})
window.addEventListener('blur', () => {
	activePointerId = null
	pointerHeld = false
	padShootHeld = false
	padMenuDirection = 0
	padConfirmHeld = false
	menuMoveQueued = 0
	menuConfirmQueued = false
	pressQueued = false
	releaseQueued = false
})

// Right mouse gives orders: a press edge and a held state. mousedown fires for every button, where pointerdown only fires for the first.
let orderQueued = false
let orderHeld = false
canvas.addEventListener('contextmenu', (e) => e.preventDefault())
canvas.addEventListener('mousedown', (e) => {
	if (e.button !== 2) return
	device = 'keyboard'
	pointer.x = (e.clientX / window.innerWidth) * 2 - 1
	pointer.y = -(e.clientY / window.innerHeight) * 2 + 1
	orderQueued = true
	orderHeld = true
})
window.addEventListener('mouseup', (e) => {
	if (e.button === 2) orderHeld = false
})
window.addEventListener('blur', () => {
	orderQueued = false
	orderHeld = false
})
export function consumeOrder() {
	const queued = orderQueued
	orderQueued = false
	return queued
}
export function orderDown() {
	return orderHeld
}
export const now = () => performance.now()

export function pointerNDC() {
	return pointer
}

// True once per press; clears the flag so each click fires a single shot.
export function consumePress() {
	if (pressQueued) {
		pressQueued = false
		return true
	}
	return false
}

// True once per release of the left button.
export function consumeRelease() {
	if (releaseQueued) {
		releaseQueued = false
		return true
	}
	return false
}

// Is the left button currently held? (drives the charge meter)
export function pointerDown() {
	return pointerHeld || padShootHeld
}

// Swallow pending edges so a click dismissing the overlay cannot loose an arrow.
function clearShoot() {
	pressQueued = false
	releaseQueued = false
}

// Swallow a pending dash when changing rounds or opening a modal.
function clearDash() {
	dashQueued = false
	padDashQueued = false
}

// --- Gamepad (plan.md: stick move + aim, trigger shoot) ---
// Main polls each frame: left stick moves, right stick drives the shared NDC aim cursor, and RT or A mirrors mouse press, hold, and release.
const DEADZONE = 0.18
const AIM_SPEED = 1.7 // NDC units per second at full stick deflection
const padMove = { x: 0, z: 0 }
let padRaw = null // this frame's axes and buttons, for schemes that read the pad whole

// The pad as last polled ({ axes, buttons: booleans }), or null while none is usable.
export function pad() {
	return padRaw
}
let padDashHeld = false
let padMenuDirection = 0
let padConfirmHeld = false
let menuMoveQueued = 0
let menuConfirmQueued = false

// Apply a hard deadzone, then rescale the usable stick range to 0→1.
function axis(v) {
	const a = Math.abs(v)
	if (a < DEADZONE) return 0
	return Math.sign(v) * ((a - DEADZONE) / (1 - DEADZONE))
}

// `steerCursor` lets the right stick drive the NDC cursor (the direct scheme); pointClick reads the stick itself.
export function pollGamepad(dt, steerCursor = true) {
	dt = Math.max(0, Math.min(dt, 0.1))
	padMove.x = 0
	padMove.z = 0
	padRaw = null
	let gp = null
	for (const p of navigator.getGamepads?.() ?? []) {
		if (p && p.connected) {
			gp = p
			break
		}
	}
	if (!gp) {
		pauseQueued = false
		if (previousPadButtons.some(Boolean)) padNeedsRelease = true
		// Disconnect cancels trigger charge without creating a release edge.
		if (padShootHeld) {
			padShootHeld = false
			if (!pointerHeld) {
				pressQueued = false
				releaseQueued = false
			}
		}
		padDashHeld = false
		padDashQueued = false
		padMenuDirection = 0
		padConfirmHeld = false
		menuMoveQueued = 0
		menuConfirmQueued = false
		padSlotQueued = null
		previousPadButtons.length = 0
		device = 'keyboard'
		return
	}

	// A held button carried across blur/disconnect is not a fresh press.
	if (padNeedsRelease && gp.buttons.some((button) => button.pressed)) return
	padNeedsRelease = false
	padRaw = { axes: gp.axes.slice(0, 4), buttons: gp.buttons.map((b) => b.pressed) }
	padMove.x = axis(gp.axes[0] || 0)
	padMove.z = axis(gp.axes[1] || 0)

	const rx = axis(gp.axes[2] || 0)
	const ry = axis(gp.axes[3] || 0)
	if (
		padMove.x ||
		padMove.z ||
		rx ||
		ry ||
		gp.buttons.some((b, i) => b.pressed && !previousPadButtons[i])
	)
		device = 'gamepad'
	if (gp.buttons[9]?.pressed && !previousPadButtons[9]) pauseQueued = true
	if (gp.buttons[14]?.pressed && !previousPadButtons[14]) padSlotQueued = 'slot1'
	if (gp.buttons[15]?.pressed && !previousPadButtons[15]) padSlotQueued = 'slot2'
	for (let i = 0; i < gp.buttons.length; i++) previousPadButtons[i] = gp.buttons[i].pressed
	if (steerCursor && (rx || ry)) {
		pointer.x = Math.max(-1, Math.min(1, pointer.x + rx * AIM_SPEED * dt))
		pointer.y = Math.max(-1, Math.min(1, pointer.y - ry * AIM_SPEED * dt))
	}

	const menuDirection =
		gp.buttons[13]?.pressed || gp.buttons[15]?.pressed || padMove.z > 0.65 || padMove.x > 0.65
			? 1
			: gp.buttons[12]?.pressed || gp.buttons[14]?.pressed || padMove.z < -0.65 || padMove.x < -0.65
				? -1
				: 0
	if (menuDirection && !padMenuDirection) menuMoveQueued = menuDirection
	padMenuDirection = menuDirection

	const confirmHeld = !!gp.buttons[0]?.pressed
	if (confirmHeld && !padConfirmHeld) menuConfirmQueued = true
	padConfirmHeld = confirmHeld

	const held = !!(gp.buttons[7]?.pressed || confirmHeld)
	const wasHeld = pointerHeld || padShootHeld
	padShootHeld = held
	const isHeld = pointerHeld || padShootHeld
	if (isHeld && !wasHeld) pressQueued = true
	else if (!isHeld && wasHeld) releaseQueued = true

	// Dash on either bumper (LB/RB) or B — edge-detected like the keyboard tap.
	const dashHeld = !!(gp.buttons[4]?.pressed || gp.buttons[5]?.pressed || gp.buttons[1]?.pressed)
	if (dashHeld && !padDashHeld) padDashQueued = true
	padDashHeld = dashHeld
}

export function consumeMenuInput() {
	const input = { move: menuMoveQueued, confirm: menuConfirmQueued }
	menuMoveQueued = 0
	menuConfirmQueued = false
	return input
}

export function consumePause() {
	const queued = pauseQueued
	pauseQueued = false
	return queued
}

// Modal navigation owns these gestures; resuming requires a fresh press.
export function resetActions() {
	keys.clear()
	clearShoot()
	clearDash()
	jumpQueued = false
	slotQueued = null
	padSlotQueued = null
	keyEdges.length = 0
	keyUps.length = 0
	orderQueued = false
	orderHeld = false
	pauseQueued = false
	pointerHeld = false
	activePointerId = null
	padShootHeld = false
	padNeedsRelease = true
	menuMoveQueued = 0
	menuConfirmQueued = false
}

// Haptics are optional hardware; an unsupported/disconnected actuator is silent.
export function rumble(weak, strong, duration) {
	if (!tune.output.rumble || activeDevice() !== 'gamepad') return
	const pad = [...(navigator.getGamepads?.() ?? [])].find((p) => p?.connected)
	const actuator = pad?.vibrationActuator
	if (!actuator?.playEffect) return
	try {
		actuator
			.playEffect('dual-rumble', {
				startDelay: 0,
				duration,
				weakMagnitude: weak,
				strongMagnitude: strong,
			})
			?.catch(() => {})
	} catch {
		/* actuator support can disappear on disconnect */
	}
}
