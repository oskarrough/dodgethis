// Render-time gates: readiness has its own dwell, independent of the total hold.
export function createLoadingState(tune) {
	let phase = 'hold',
		elapsed = 0,
		dwell = 0,
		flight = 0,
		ready = false,
		skipped = false
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
				if (ready) dwell += dt
				if (ready && (skipped || (elapsed >= tune.hold && dwell >= tune.dwell))) phase = 'descent'
			} else if (phase === 'descent') {
				flight = Math.min(1, flight + dt / Math.max(1 / 60, tune.duration))
				if (flight === 1) phase = 'landed'
			}
			return phase
		},
		get state() {
			return { phase, elapsed, dwell, progress: flight, ready, skipped, frozen: phase !== 'landed' }
		},
	}
}

const ease = (p) => {
	const t = Math.max(0, Math.min(1, p))
	return t * t * (3 - 2 * t)
}

export function localLoadingHero(snapshot, local) {
	const hero = snapshot.heroes.find((hero) => hero.id === local)
	if (!hero) throw new Error('Local hero missing from loading match')
	return hero.pos
}

export function descentFrame(progress, hero, start, follow, bounds, aspect = 1) {
	const p = Math.max(0, Math.min(1, progress)),
		t = ease(p)
	const mix = (a, b, weight = t) => a + (b - a) * weight
	const clamp = (v, half) => Math.max(-half, Math.min(half, v))
	const x = clamp(hero.x, bounds.halfX),
		z = clamp(hero.z, bounds.halfZ)
	const back = Math.max(
		start.back,
		(bounds.halfX * start.fitMargin) /
			(Math.tan((start.fov * Math.PI) / 360) * Math.max(aspect, start.minAspect)) +
			bounds.halfZ,
	)
	const target = {
		x: mix(clamp(start.targetX, bounds.halfX), x),
		y: mix(start.targetY, 0),
		z: mix(0, z),
	}
	// A real boom arc, with the pitch settled before the final approach. No late snap-tilt.
	const height =
		p <= start.riseEnd
			? mix(start.height, start.arcHeight, ease(p / start.riseEnd))
			: mix(start.arcHeight, follow.height, ease((p - start.riseEnd) / (1 - start.riseEnd)))
	const initialPitch = Math.atan2(start.height - start.targetY, back)
	const finalPitch = Math.atan2(follow.height, follow.back)
	const pitch = mix(initialPitch, finalPitch, ease(p / start.pitchEnd))
	return {
		eye: { x: target.x, y: height, z: target.z + (height - target.y) / Math.tan(pitch) },
		target,
		fov: mix(start.fov, follow.fov),
	}
}
