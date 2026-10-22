import { tune } from './tune.js'
import { blocked } from './statuses.js'
import { SLOTS, ticks, dirOf } from './sim-kit.js'
import { inOwnBase } from './base.js'

// Recall (B): a tear rips open in front of you while you stand still, stays open a few seconds, and takes
// you home only if you walk into it. `hero.recall` replicates like a channel:
// `{ phase, left, total, at, dir, last }`, ticks for `left`/`total`, `at` the tear's mouth on the ground
// and `dir` the way into it. Phases: `opening` (moving, a cast, a hit or a disable breaks it), `open`
// (walk through; a cast, a hit or a disable still collapses it, and it times out), `through` (slipping in)
// and `out` (spat out at spawn). `hero.recallReady` is the tick the next one may start. Only the owner
// can cross. Bots don't recall yet.
const OUT = { x: 0, z: 1 } // the spawn tear spits you toward the follow camera, which always looks from +z

export function createRecall(ctx) {
	const { intents, present, layout } = ctx
	const busy = (h) =>
		h.cast ||
		h.channel ||
		h.stance ||
		h.shove ||
		h.body.dashing ||
		ctx.ball?.carrying(h) ||
		h.statuses?.some((s) => s.key === 'core.motion' && (s.until === null || s.until > ctx.t))
	const ground = (p) => ({ x: p.x, y: 0, z: p.z })
	const committed = (r) => r.phase === 'through' || r.phase === 'out'

	// Collapse the tear. Once you're slipping through, only death (or a respawn or swap) stops it.
	// An opened tear starts the cooldown when it closes; one broken while opening costs none.
	function cancelRecall(h, reason) {
		const r = h.recall
		if (!r || (committed(r) && !['death', 'respawn', 'swap'].includes(reason))) return
		h.recall = null
		if (r.phase === 'open') h.recallReady = ctx.t + ticks(tune.recall.cooldown)
		present({ type: 'recallCancelled', hero: h.id, reason, point: ground(r.at) })
	}

	function startRecall(h) {
		const deny = (reason) => present({ type: 'denied', hero: h.id, slot: 'recall', reason })
		if (!ctx.lane || !layout.bases?.[h.team]) return deny('unavailable')
		if (inOwnBase(layout, h)) return deny('home')
		if (ctx.t < (h.recallReady ?? 0)) return deny('cooldown')
		if (blocked(h, 'move', ctx.t) || blocked(h, 'cast', ctx.t)) return deny('disabled')
		if (busy(h)) return deny('busy')
		const p = h.body.position
		const dir = dirOf(h.yaw)
		const at = ctx.walkGoal({
			x: p.x + dir.x * tune.recall.ahead,
			z: p.z + dir.z * tune.recall.ahead,
		})
		const total = Math.max(1, ticks(tune.recall.channel))
		h.order = null
		h.attack = null
		h.buffered = null
		h.recall = { phase: 'opening', left: total, total, at, dir, last: { x: p.x, z: p.z } }
		present({ type: 'recallStart', hero: h.id, point: ground(at), direction: { ...dir } })
	}

	// The step from `a` to `b` passes through the tear's mouth: +1 going in along `dir`, -1 from behind, 0 not at all.
	function crossing(r, a, b) {
		const side = (p) => (p.x - r.at.x) * r.dir.x + (p.z - r.at.z) * r.dir.z
		const sa = side(a),
			sb = side(b)
		if (sa === sb || sa < 0 === sb < 0) return 0
		const k = sa / (sa - sb)
		const lateral =
			(a.x + (b.x - a.x) * k - r.at.x) * -r.dir.z + (a.z + (b.z - a.z) * k - r.at.z) * r.dir.x
		if (Math.abs(lateral) > tune.recall.width) return 0
		return sb > sa ? 1 : -1
	}

	function enter(h, sign) {
		const r = h.recall
		const p = h.body.position
		const way = { x: r.dir.x * sign, z: r.dir.z * sign }
		r.phase = 'through'
		r.dir = way
		r.left = r.total = Math.max(1, ticks(tune.recall.slipTime))
		h.order = null
		h.attack = null
		h.buffered = null
		ctx.displace(
			h,
			{ x: p.x + way.x * tune.recall.slip, z: p.z + way.z * tune.recall.slip },
			tune.recall.slipTime,
		)
		present({ type: 'recallEnter', hero: h.id, point: ground(r.at), direction: way })
	}

	function land(h) {
		const from = h.recall.at
		const { spawn } = h
		const start = ctx.walkGoal({
			x: spawn.x - OUT.x * tune.recall.spit,
			z: spawn.z - OUT.z * tune.recall.spit,
		})
		const mouth = { x: (start.x + spawn.x) / 2, z: (start.z + spawn.z) / 2 }
		const total = Math.max(1, ticks(tune.recall.spitTime))
		h.recall = { phase: 'out', left: total, total, at: mouth, dir: { ...OUT }, last: start }
		h.recallReady = ctx.t + ticks(tune.recall.cooldown)
		h.order = null
		h.attack = null
		h.body.place(start.x, h.body.position.y, start.z)
		h.body.setVelocity({ x: 0, y: 0, z: 0 })
		ctx.displace(h, { x: spawn.x, z: spawn.z }, tune.recall.spitTime)
		present({
			type: 'recallEnd',
			hero: h.id,
			from: ground(from),
			point: ground(mouth),
			direction: { ...OUT },
		})
	}

	// Runs before the hero's controls each tick. Presses that break the tear are left in the frame, so the
	// cast, stop or order still happens. B again collapses it.
	function stepRecall(h) {
		const frame = intents.get(h.id)
		const pressed = frame.pressed.some((e) => e.action === 'recall')
		if (pressed) intents.consume(h.id, 'recall')
		if (h.dead) return cancelRecall(h, 'death')
		const r = h.recall
		if (!r) {
			if (pressed) startRecall(h)
			return
		}
		if (committed(r)) {
			if (--r.left > 0) return
			if (r.phase === 'through') return land(h)
			h.recall = null
			return
		}
		if (
			pressed ||
			(r.phase === 'opening' && (frame.order || Math.hypot(frame.move.x, frame.move.z) > 0.01)) ||
			frame.pressed.some(
				(e) => SLOTS.includes(e.action) || ['primary', 'stop', 'cancel'].includes(e.action),
			)
		)
			return cancelRecall(h, 'input')
		if (blocked(h, 'move', ctx.t) || blocked(h, 'cast', ctx.t) || busy(h))
			return cancelRecall(h, 'disabled')
		const p = h.body.position
		if (r.phase === 'opening') {
			if (--r.left > 0) return
			r.phase = 'open'
			r.left = r.total = Math.max(1, ticks(tune.recall.open))
			r.last = { x: p.x, z: p.z }
			present({ type: 'recallOpen', hero: h.id, point: ground(r.at) })
			return
		}
		const sign = crossing(r, r.last, p)
		if (sign) return enter(h, sign)
		r.last = { x: p.x, z: p.z }
		if (--r.left <= 0) cancelRecall(h, 'timeout')
	}

	return { stepRecall, cancelRecall }
}
