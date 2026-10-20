import { tune } from './tune.js'
import { blocked } from './statuses.js'
import { SLOTS, ticks } from './sim-kit.js'
import { inOwnBase } from './base.js'

// Recall (B): stand still while a tear opens beside you and shows home, then step through to your
// spawn. `hero.recall` is `{ left, total }` in ticks and replicates like a channel; `hero.recallReady`
// is the tick the next one may start. Where the tear stands is the view's (recall-view.js).
// Moving, ordering, casting, stop, a hit, a disable or death collapses it. Bots don't recall yet.
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

	function cancelRecall(h, reason) {
		if (!h.recall) return
		h.recall = null
		const p = h.body.position
		present({ type: 'recallCancelled', hero: h.id, reason, point: { x: p.x, y: 0, z: p.z } })
	}

	function startRecall(h) {
		const deny = (reason) => present({ type: 'denied', hero: h.id, slot: 'recall', reason })
		if (!ctx.lane || !layout.bases?.[h.team]) return deny('unavailable')
		if (inOwnBase(layout, h)) return deny('home')
		if (ctx.t < (h.recallReady ?? 0)) return deny('cooldown')
		if (blocked(h, 'move', ctx.t) || blocked(h, 'cast', ctx.t)) return deny('disabled')
		if (busy(h)) return deny('busy')
		const p = h.body.position
		const total = Math.max(1, ticks(tune.recall.channel))
		h.order = null
		h.attack = null
		h.buffered = null
		h.recall = { left: total, total }
		present({ type: 'recallStart', hero: h.id, point: { x: p.x, y: 0, z: p.z } })
	}

	function land(h) {
		const p = h.body.position
		const from = { x: p.x, y: 0, z: p.z }
		h.recall = null
		h.recallReady = ctx.t + ticks(tune.recall.cooldown)
		h.order = null
		h.attack = null
		h.body.place(h.spawn.x, p.y, h.spawn.z)
		h.body.setVelocity({ x: 0, y: 0, z: 0 })
		present({
			type: 'recallEnd',
			hero: h.id,
			from,
			point: { x: h.spawn.x, y: 0, z: h.spawn.z },
		})
	}

	// Runs before the hero's controls each tick. Presses that cancel are left in the frame, so the
	// cast, stop or order that broke the recall still happens. B again collapses the tear.
	function stepRecall(h) {
		const frame = intents.get(h.id)
		const pressed = frame.pressed.some((e) => e.action === 'recall')
		if (pressed) intents.consume(h.id, 'recall')
		if (h.dead) return cancelRecall(h, 'death')
		if (!h.recall) {
			if (pressed) startRecall(h)
			return
		}
		if (pressed) return cancelRecall(h, 'input')
		if (
			frame.order ||
			Math.hypot(frame.move.x, frame.move.z) > 0.01 ||
			frame.pressed.some(
				(e) => SLOTS.includes(e.action) || ['primary', 'stop', 'cancel'].includes(e.action),
			)
		)
			return cancelRecall(h, 'input')
		if (blocked(h, 'move', ctx.t) || blocked(h, 'cast', ctx.t) || busy(h))
			return cancelRecall(h, 'disabled')
		if (--h.recall.left <= 0) land(h)
	}

	return { stepRecall, cancelRecall }
}
