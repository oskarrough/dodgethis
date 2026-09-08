// A local decisive hit gets one short beat. Real-time cooldown prevents a crowded
// volley from repeatedly extending slow motion; simulation clocks stay separate.
export function createImpactBeat() {
	let remaining = 0
	let cooldown = 0
	return {
		trigger(event) {
			if (cooldown > 0 || event.type !== 'impact' || event.outcome !== 'eliminated') return false
			if (!event.source?.isHuman && !event.target?.isHuman) return false
			remaining = 0.065
			cooldown = 0.35
			return true
		},
		step(dt) {
			const elapsed = Math.max(0, Math.min(dt, 0.1))
			const slowed = Math.min(remaining, elapsed)
			remaining = Math.max(0, remaining - elapsed)
			cooldown = Math.max(0, cooldown - elapsed)
			return elapsed > 0 ? 1 - (slowed / elapsed) * 0.85 : 1
		},
		reset() {
			remaining = 0
			cooldown = 0
		},
	}
}
