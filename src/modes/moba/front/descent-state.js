import { clampView } from '../follow.js'
import { tune as kit } from '../tune.js'

// Render-time phases: the crane rises to the apex, the apex waits for the built lane's
// reveal, then the descent lands. Nothing skips; quitting is the caller's. `times()` is read live.
export function createDescentState(times) {
	let phase = 'crane',
		crane = 0,
		flight = 0,
		arrived = false,
		ready = false
	return {
		arrive() {
			arrived = true
		},
		// Shader build and reveal are complete at the apex.
		ready() {
			if (phase === 'apex') ready = true
		},
		step(dt) {
			if (!Number.isFinite(dt) || dt < 0) throw new Error('Invalid descent step')
			const { crane: craneTime, preview, duration } = times()
			if (phase === 'crane') {
				crane = Math.min(1, crane + dt / Math.max(1 / 60, craneTime))
				if (crane === 1 && arrived) phase = 'apex'
			} else if (phase === 'apex') {
				if (ready) phase = 'descent'
			} else if (phase === 'descent') {
				flight = Math.min(1, flight + dt / Math.max(1 / 60, preview + duration))
				if (flight === 1) phase = 'landed'
			}
			return phase
		},
		get state() {
			const { preview, duration, creep } = times()
			const progress = descentProgress(flight * (preview + duration), preview, duration, creep)
			const elapsed = flight * (preview + duration)
			return { phase, crane, progress, elapsed, ready, frozen: phase !== 'landed' }
		},
	}
}

// The descent's eased share at `time` s: a slow creep to `creep` over the `preview` while
// you look at the map, then the dive, which leaves the creep at its speed and lands still.
// Returned pre-ease, since descentFrame eases its own progress.
function descentProgress(time, preview, duration, creep) {
	const c = preview > 0 ? Math.max(0, Math.min(1, creep)) : 0
	let shown
	if (time < preview) shown = c * (time / preview) ** 2
	else {
		const t = Math.max(0, Math.min(1, (time - preview) / Math.max(1 / 60, duration)))
		const lead = preview > 0 ? (2 * c * duration) / preview : 0
		// Cubic Hermite from (c, lead) to (1, 0).
		shown =
			c * (2 * t ** 3 - 3 * t ** 2 + 1) +
			lead * (t ** 3 - 2 * t ** 2 + t) +
			(3 * t ** 2 - 2 * t ** 3)
	}
	shown = Math.max(0, Math.min(1, shown))
	// Undo the smoothstep descentFrame applies.
	return 0.5 - Math.sin(Math.asin(1 - 2 * shown) / 3)
}

const ease = (p) => {
	const t = Math.max(0, Math.min(1, p))
	return t * t * (3 - 2 * t)
}

export function descentFrame(progress, hero, start, follow, bounds, aspect = 1) {
	const p = Math.max(0, Math.min(1, progress)),
		t = ease(p)
	const mix = (a, b, weight = t) => a + (b - a) * weight
	const clamp = (v, half) => Math.max(-half, Math.min(half, v))
	const landing = clampView(
		{ x: clamp(hero.x, bounds.halfX), z: clamp(hero.z, bounds.halfZ) },
		follow,
		aspect,
		0,
		bounds,
	)
	const x = landing.x,
		z = landing.z
	const finalHeight = Math.max(follow.minHeight ?? kit.follow.minHeight, follow.height)
	const finalBack = Math.max(0, follow.back)
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
			: mix(start.arcHeight, finalHeight, ease((p - start.riseEnd) / (1 - start.riseEnd)))
	const initialPitch = Math.atan2(start.height - start.targetY, back)
	const finalPitch = Math.atan2(finalHeight, finalBack)
	const pitch = mix(initialPitch, finalPitch, ease(p / start.pitchEnd))
	return {
		eye: { x: target.x, y: height, z: target.z + (height - target.y) / Math.tan(pitch) },
		target,
		fov: mix(start.fov, landing.fov),
	}
}
