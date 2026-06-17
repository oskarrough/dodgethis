// Minimal keyboard state. Reads WASD / arrows into a normalized move vector.
const keys = new Set()

// Dash is an edge (one burst per tap), not a held state. Space / Shift on the
// keyboard, a bumper on the pad (see pollGamepad). Space also scrolls the page,
// so swallow its default while we're in the game.
let dashQueued = false

window.addEventListener('keydown', (e) => {
	if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
		if (!e.repeat) dashQueued = true
		if (e.code === 'Space') e.preventDefault()
	}
	keys.add(e.code)
})
window.addEventListener('keyup', (e) => keys.delete(e.code))
window.addEventListener('blur', () => keys.clear())

// True once per dash tap; clears the flag so each press is a single burst.
export function consumeDash() {
	if (dashQueued) {
		dashQueued = false
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
const pointer = { x: 0, y: 0 }
let pressQueued = false
let releaseQueued = false
let down = false

window.addEventListener('pointermove', (e) => {
	pointer.x = (e.clientX / window.innerWidth) * 2 - 1
	pointer.y = -(e.clientY / window.innerHeight) * 2 + 1
})
window.addEventListener('pointerdown', (e) => {
	if (e.button !== 0) return
	down = true
	pressQueued = true
})
window.addEventListener('pointerup', (e) => {
	if (e.button !== 0) return
	down = false
	releaseQueued = true
})
window.addEventListener('blur', () => {
	down = false
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
	return down
}

// Swallow any pending edges (used when a round starts, so the click that
// dismissed the overlay doesn't immediately loose an arrow).
export function clearShoot() {
	pressQueued = false
	releaseQueued = false
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
let padShootHeld = false
let padDashHeld = false

function axis(v) {
	return Math.abs(v) < DEADZONE ? 0 : v
}

export function pollGamepad(dt) {
	padMove.x = 0
	padMove.z = 0
	if (!navigator.getGamepads) return
	let gp = null
	for (const p of navigator.getGamepads()) {
		if (p && p.connected) {
			gp = p
			break
		}
	}
	if (!gp) return

	padMove.x = axis(gp.axes[0] || 0)
	padMove.z = axis(gp.axes[1] || 0)

	const rx = axis(gp.axes[2] || 0)
	const ry = axis(gp.axes[3] || 0)
	if (rx || ry) {
		pointer.x = Math.max(-1, Math.min(1, pointer.x + rx * AIM_SPEED * dt))
		pointer.y = Math.max(-1, Math.min(1, pointer.y - ry * AIM_SPEED * dt))
	}

	const held = !!(gp.buttons[7]?.pressed || gp.buttons[0]?.pressed)
	if (held && !padShootHeld) {
		down = true
		pressQueued = true
	} else if (!held && padShootHeld) {
		down = false
		releaseQueued = true
	}
	padShootHeld = held

	// Dash on either bumper (LB/RB) or B — edge-detected like the keyboard tap.
	const dashHeld = !!(gp.buttons[4]?.pressed || gp.buttons[5]?.pressed || gp.buttons[1]?.pressed)
	if (dashHeld && !padDashHeld) dashQueued = true
	padDashHeld = dashHeld
}
