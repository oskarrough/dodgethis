const cursors = {
	move: `url("${new URL('./cursors/move.svg', import.meta.url).href}") 5 4, default`,
	attack: `url("${new URL('./cursors/attack.svg', import.meta.url).href}") 5 4, crosshair`,
	target: 'none', // the view draws the aim reticle: the OS hides its pointer while a key repeats
}

// Native CSS cursors: the OS moves them, not our render loop. Scoped to the play canvas.
export function createCursor(canvas) {
	const previous = canvas.style.cursor
	let current = null
	return {
		update({ aiming = false, armed = false, enemy = false, pad = false, paused = false } = {}) {
			const next = pad || paused ? null : aiming ? 'target' : enemy || armed ? 'attack' : 'move'
			if (next === current) return
			current = next
			canvas.style.cursor = next ? cursors[next] : previous
		},
		dispose() {
			canvas.style.cursor = previous
		},
	}
}
