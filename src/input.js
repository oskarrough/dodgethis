// Minimal keyboard state. Reads WASD / arrows into a normalized move vector.
const keys = new Set()

window.addEventListener('keydown', (e) => keys.add(e.code))
window.addEventListener('keyup', (e) => keys.delete(e.code))
window.addEventListener('blur', () => keys.clear())

// Returns { x, z } in world space, length <= 1.
// Camera looks down +z toward origin, so W (forward) = -z.
export function moveVector() {
	let x = 0
	let z = 0
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
