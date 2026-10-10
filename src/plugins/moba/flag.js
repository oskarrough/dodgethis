import { STEP } from '../../core/app.js'
import { tune } from './tune.js'

const ticks = (s) => Math.max(1, Math.round(s / STEP))

// Flagfall's centre flag: hoisted on a fixed clock at the chalk cross, held by standing in its
// ring with no enemy hero beside you. The team that fills the bar gets team XP and silences the
// other team's frontmost structure in each lane. Numbers in `tune.flagfall.flag`.
export function createFlag({ heroes, lane, layout, present }) {
	const f = () => tune.flagfall.flag
	const spot = { ...(layout.settings?.posts?.[0] ?? { x: 0, z: 0 }) }
	const state = {
		phase: 'down', // down → rising (warning) → up → down
		x: spot.x,
		z: spot.z,
		nextHoist: ticks(f().first),
		upUntil: 0,
		owner: null, // whose bar is filling
		progress: 0, // 0–1
		contested: false,
		holders: { A: 0, B: 0 },
		taken: { A: 0, B: 0 },
		lastWinner: null,
	}
	const radius = () => f().radius * (layout.settings?.scale ?? 1)

	function silence(team, t) {
		const enemy = team === 'A' ? 'B' : 'A'
		const standing = (lane?.structures ?? []).filter(
			(u) => u.team === enemy && !u.dead && lane.vulnerable(u),
		)
		const lanes = [...new Set(standing.map((u) => u.lane).filter(Boolean))]
		const silenced = lanes.map((id) => standing.find((u) => u.lane === id))
		const core = standing.find((u) => u.kind === 'core')
		if (core) silenced.push(core)
		for (const u of silenced)
			u.silentUntil = Math.max(u.silentUntil ?? 0, t + ticks(f().silence[u.kind] ?? 20))
		return silenced.map((u) => u.id)
	}

	function win(team, t) {
		state.taken[team]++
		state.lastWinner = team
		state.phase = 'down'
		state.progress = 0
		state.owner = null
		lane?.addXp(team, f().xp, spot)
		const silenced = silence(team, t)
		present({ type: 'flagTaken', team, silenced: silenced.join(' '), point: { ...spot } })
	}

	function step(t) {
		const s = f()
		if (state.phase === 'down' && t >= state.nextHoist - ticks(s.warn)) {
			state.phase = 'rising'
			present({ type: 'flagWarn', at: state.nextHoist, point: { ...spot } })
		}
		if (state.phase === 'rising' && t >= state.nextHoist) {
			state.phase = 'up'
			state.upUntil = t + ticks(s.window)
			state.progress = 0
			state.owner = null
			state.nextHoist = t + ticks(t * STEP >= s.late ? s.lateEvery : s.every)
			present({ type: 'flagUp', point: { ...spot } })
		}
		if (state.phase !== 'up') return
		const r = radius()
		const count = (team) =>
			heroes.filter(
				(h) =>
					h.team === team &&
					!h.dead &&
					Math.hypot(h.body.position.x - spot.x, h.body.position.z - spot.z) <= r,
			).length
		state.holders = { A: count('A'), B: count('B') }
		const { A, B } = state.holders
		state.contested = A > 0 && B > 0
		const rate = STEP / s.hold
		if (!A && !B) {
			state.progress = Math.max(0, state.progress - rate * s.decay)
			if (!state.progress) state.owner = null
		} else if (!state.contested) {
			const team = A ? 'A' : 'B'
			const boost = 1 + s.extraHolder * (Math.max(A, B) - 1)
			if (state.owner && state.owner !== team) {
				state.progress -= rate * boost
				if (state.progress <= 0) {
					state.owner = team
					state.progress = 0
				}
			} else {
				state.owner = team
				state.progress += rate * boost
				if (state.progress >= 1) return win(team, t)
			}
		}
		if (t >= state.upUntil) {
			state.phase = 'down'
			state.progress = 0
			state.owner = null
			present({ type: 'flagLowered', point: { ...spot } })
		}
	}

	return { state, step, radius }
}
