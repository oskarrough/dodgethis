// Render-time gate, independent of the simulation clock and of build completion order.
export function createLoadingState(tune) {
	let phase = 'hold'
	let elapsed = 0
	let flight = 0
	let ready = false
	let skipped = false
	return {
		ready() {
			ready = true
		},
		skip() {
			if (phase === 'hold') skipped = true
		},
		cancel() {
			if (phase !== 'landed') phase = 'cancelled'
		},
		step(dt) {
			if (!Number.isFinite(dt) || dt < 0) throw new Error('Invalid loading step')
			if (phase === 'hold') {
				elapsed += dt
				if (ready && (skipped || elapsed >= tune.hold)) phase = 'descent'
			} else if (phase === 'descent') {
				flight = Math.min(1, flight + dt / Math.max(1 / 60, tune.duration))
				if (flight === 1) phase = 'landed'
			}
			return phase
		},
		get state() {
			return { phase, elapsed, progress: flight, ready, skipped, frozen: phase !== 'landed' }
		},
	}
}

export function descentFrame(progress, hero, start, follow, bounds) {
	const p = Math.max(0, Math.min(1, progress))
	const t = p * p * (3 - 2 * p)
	const mix = (a, b) => a + (b - a) * t
	const clamp = (v, half) => Math.max(-half, Math.min(half, v))
	// Clamp the ground anchor, not the optical boom: follow also adds its back offset.
	const x = clamp(hero.x, bounds.halfX)
	const z = clamp(hero.z, bounds.halfZ)
	return {
		eye: {
			x: mix(clamp(start.targetX, bounds.halfX), x),
			y: mix(start.height, follow.height),
			z: mix(start.back, z + follow.back),
		},
		target: {
			x: mix(clamp(start.targetX, bounds.halfX), x),
			y: mix(start.targetY, 0),
			z: mix(0, z),
		},
		fov: mix(start.fov, follow.fov),
	}
}
