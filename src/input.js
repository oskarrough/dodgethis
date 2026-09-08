import { tune } from './tune.js'

// Minimal keyboard state. Reads WASD / arrows into a normalized move vector.
const keys = new Set()
let device = 'keyboard'
let weaponQueued = null
let pauseQueued = false
let padNeedsRelease = false
const previousPadButtons = []

export function activeDevice() {
	return device
}

export function consumeWeaponSwitch() {
	const weapon = weaponQueued
	weaponQueued = null
	return weapon
}

window.addEventListener('pointerdown', () => {
	device = 'keyboard'
})

// Jump and dash are edges, not held states. Space jumps; Shift dashes.
// Swallow Space's page-scroll default while we're in the game.
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
	keys.add(e.code)
})
window.addEventListener('keyup', (e) => keys.delete(e.code))
window.addEventListener('blur', () => {
	pauseQueued = false
	keys.clear()
	jumpQueued = false
	dashQueued = false
	padDashQueued = false
	weaponQueued = null
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

// Returns { x, z } in world space, length <= 1.
// Camera looks down +z toward origin, so W (forward) = -z.
// Keyboard and the gamepad's left stick simply sum (then clamp).
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
// Three signals off the left button: a press edge (click weapons fire on this),
// a release edge (the charge bow fires on this), and the held state (the charge
// bow winds while it's true). blur drops the held state without firing a release.
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

// Swallow any pending edges (used when a round starts, so the click that
// dismissed the overlay doesn't immediately loose an arrow).
export function clearShoot() {
	pressQueued = false
	releaseQueued = false
}

// Swallow a pending dash when changing rounds or opening a modal.
export function clearDash() {
	dashQueued = false
	padDashQueued = false
}

// --- Gamepad (plan.md: stick move + aim, trigger shoot) ---
// Polled once per frame by main. Left stick feeds moveVector; the right stick
// nudges the same NDC pointer the mouse writes (a virtual cursor, so the
// ground-plane raycast aim works unchanged); RT or A mirrors the left mouse
// button through the same press/hold/release edge model (so the charge bow's
// hold-and-release works on a pad too).
const DEADZONE = 0.18
const AIM_SPEED = 1.7 // NDC units per second at full stick deflection
const padMove = { x: 0, z: 0 }
let padDashHeld = false
let padMenuDirection = 0
let padConfirmHeld = false
let menuMoveQueued = 0
let menuConfirmQueued = false

// Hard deadzone, then rescale so the usable stick range maps to 0→1.
// Without rescale, the first 18% of throw is wasted and full tilt never quite
// feels like full tilt — mushy vs. keyboard.
function axis(v) {
	const a = Math.abs(v)
	if (a < DEADZONE) return 0
	return Math.sign(v) * ((a - DEADZONE) / (1 - DEADZONE))
}

export function pollGamepad(dt) {
	dt = Math.max(0, Math.min(dt, 0.1))
	padMove.x = 0
	padMove.z = 0
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
		// A disconnected trigger cancels its charge instead of leaving it held or
		// firing a release edge when the controller disappears.
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
		weaponQueued = null
		previousPadButtons.length = 0
		device = 'keyboard'
		return
	}

	// A held button carried across blur/disconnect is not a fresh press.
	if (padNeedsRelease && gp.buttons.some((button) => button.pressed)) return
	padNeedsRelease = false
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
	if (gp.buttons[14]?.pressed && !previousPadButtons[14]) weaponQueued = 'bow'
	if (gp.buttons[15]?.pressed && !previousPadButtons[15]) weaponQueued = 'bowl'
	for (let i = 0; i < gp.buttons.length; i++) previousPadButtons[i] = gp.buttons[i].pressed
	if (rx || ry) {
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
	weaponQueued = null
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
	if (!tune.fx.rumble || activeDevice() !== 'gamepad') return
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
