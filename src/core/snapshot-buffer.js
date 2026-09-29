// Replica interpolation (docs/plugin-architecture.md, line 5): keep the last few timestamped states and sample a little in the past, between two of them.
export function createSnapshotBuffer({ delay = 0.08, size = 6 } = {}) {
	const history = []

	// A state may arrive at the newest time again (it replaces that one) but never earlier.
	const accepts = (time) => Number.isFinite(time) && !(history.length && time < history.at(-1).time)

	return {
		accepts,
		push(time, state) {
			if (!accepts(time)) return false
			if (history.at(-1)?.time === time) history.pop()
			history.push({ time, state })
			if (history.length > size) history.shift()
			return true
		},
		// The states either side of `now - delay` and how far between them, clamped to the oldest and newest. Null until a state arrives.
		sample(now) {
			if (!history.length || !Number.isFinite(now)) return null
			const at = now - delay
			let before = history[0]
			let after = history.at(-1)
			for (const frame of history) {
				if (frame.time <= at) before = frame
				if (frame.time >= at) {
					after = frame
					break
				}
			}
			const span = after.time - before.time
			const blend = span > 0 ? Math.min(Math.max((at - before.time) / span, 0), 1) : 1
			return { before: before.state, after: after.state, blend, latest: history.at(-1).state }
		},
		clear() {
			history.length = 0
		},
	}
}
