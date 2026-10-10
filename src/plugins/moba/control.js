import { tune, profile } from './tune.js'
import { abilityOf, castAbility, slowFactor } from './ability.js'
import { SLOTS, ticks, yawOf, dirOf } from './sim-kit.js'

// One tick of one unit: a hero turns its intents frame into orders, casts and movement; a dummy strafes and shoots.
export function createControl(ctx) {
	const {
		heroes,
		lobby,
		ball,
		training,
		readySeats,
		intents,
		rng,
		present,
		enemiesOf,
		respawn,
		dropIn,
		dunk,
		plan,
		issue,
		attackAhead,
		move,
		casts,
		release,
		aimBasic,
		traitContext,
		cancelChannel,
	} = ctx

	function control(h, dt) {
		for (let i = 0; i < h.cd.length; i++)
			if (training.noCooldowns && h.id === training.local) h.cd[i] = 0
			else if (h.cd[i] > 0) h.cd[i]--
		if (h.dead) {
			if (readySeats) {
				readySeats.cancel(h.id, ctx.t)
				h.readyWalk = false
			}
			intents.cancel(h.id)
			h.buffered = null
			if (ctx.t >= h.respawnTick) respawn(h)
			return
		}
		if (lobby && h.body.position.y < -tune.lobby.fall.depth) dropIn(h)
		if (h.shove) {
			// The slide is committed; orders and presses wait for it rather than being swallowed.
			if (ctx.t < h.shove.until) return h.body.update({ x: 0, z: 0 }, dt, 0)
			const shoved = h.shove
			h.shove = null
			if (shoved.dunk) return dunk(h, shoved)
			if (h.order?.goal) h.order.path = plan(h, h.order.goal)
		}
		const frame = intents.get(h.id)
		if (readySeats) {
			const box = readySeats.seatOf(h.id)
			const cancel = frame.pressed.some((e) => ['cancel', 'stop'].includes(e.action))
			const movement =
				Math.hypot(frame.move.x, frame.move.z) > 0 ||
				(frame.order &&
					(!box || Math.hypot(frame.order.x - box.x, frame.order.z - box.z) > tune.orders.arrival))
			if (cancel || (h.readyWalk && movement)) {
				if (h.readyWalk || box?.enteredAt != null) present({ type: 'readyCancel', hero: h.id })
				if (h.readyWalk) h.order = null
				h.readyWalk = false
				readySeats.cancel(h.id, ctx.t)
			}
			if (frame.pressed.some((e) => e.action === 'ready')) {
				intents.consume(h.id, 'ready')
				if (box && !cancel) {
					readySeats.resume(h.id)
					if (!h.readyWalk) {
						h.readyWalk = true
						issue(h, { x: box.x, z: box.z, kind: 'move' })
						present({
							type: 'readyWalk',
							hero: h.id,
							seat: box.id,
							point: { x: box.x, y: 0, z: box.z },
						})
					}
				}
			}
			// Occupancy may have claimed a different box in the preceding physics step.
			if (
				h.readyWalk &&
				!movement &&
				!cancel &&
				box &&
				h.order?.goal &&
				Math.hypot(h.order.goal.x - box.x, h.order.goal.z - box.z) > tune.orders.arrival
			)
				issue(h, { x: box.x, z: box.z, kind: 'move' })
		}
		const swapAim = h.swapAim
		if (swapAim && swapAim.sample !== frame.held) {
			// Samples own a fresh held map. Process it once even when a render drives several ticks.
			swapAim.sample = frame.held
			for (const slot of swapAim.blocked) {
				for (const edge of frame.pressed.filter((e) => e.action === slot)) {
					intents.consume(h.id, edge.action)
					present({ type: 'denied', hero: h.id, slot, reason: 'swap-held' })
				}
				if (!frame.held[slot]) swapAim.blocked.delete(slot)
				else delete frame.held[slot]
			}
			if (swapAim.blocked.size) frame.aim = null
			else h.swapAim = null
		}
		if (ctx.t < h.stunUntil || ctx.t < h.freezeUntil || ctx.t < h.proneUntil) {
			cancelChannel(h, 'disabled')
			h.body.cancelDash()
			if (ctx.t < h.stunUntil || ctx.t < h.freezeUntil) {
				h.catchWindow = null
				h.abilityState.bag = []
			}
			if (frame.order) present({ type: 'denied', hero: h.id, slot: 'primary', reason: 'disabled' })
			for (const e of frame.pressed.slice()) {
				intents.consume(h.id, e.action)
				present({ type: 'denied', hero: h.id, slot: e.action, reason: 'disabled' })
			}
			if (h.buffered) {
				present({ type: 'denied', hero: h.id, slot: h.buffered.edge.action, reason: 'disabled' })
				h.buffered = null
			}
			h.body.update({ x: 0, z: 0 }, dt, 0)
			return
		}
		if (h.cast && frame.pressed.some((e) => ['stop', 'cancel'].includes(e.action))) {
			const cast = h.cast,
				ability = castAbility(h)
			h.cast = null
			const slotIndex = SLOTS.indexOf(cast.slot)
			if (slotIndex >= 0) {
				const lockout = Math.max(1, ticks(tune.cast.cancelLockout))
				h.cancelUntil[slotIndex] = ctx.t + lockout
				h.cd[slotIndex] = Math.max(
					lockout,
					(cast.cooldownBefore ?? 0) - (ctx.t - (cast.startedTick ?? ctx.t)),
				)
			}
			if (cast.pocket) {
				if (cast.pocket.until > ctx.t) h.abilityState.pocket = cast.pocket
				else present({ type: 'catchExpired', hero: h.id, point: { ...h.body.position } })
			}
			ability?.onCancel?.(traitContext(h, { ...cast, reason: 'input' }))
			present({
				type: 'denied',
				hero: h.id,
				ability: cast.ability,
				slot: cast.slot,
				reason: 'cancelled',
			})
		}
		if (
			h.channel &&
			((abilityOf(h.channel.ability, h)?.cancelOnMove &&
				(frame.order || Math.hypot(frame.move.x, frame.move.z) > 0.01)) ||
				frame.pressed.some((e) => ['stop', 'cancel'].includes(e.action)))
		)
			cancelChannel(h, 'input')
		const heldBall = ball?.control(h, frame, intents, dirOf(h.yaw))
		if (
			Math.hypot(frame.move.x, frame.move.z) > 0.01 ||
			frame.pressed.some((e) => e.action === 'stop')
		)
			h.attack = null
		if (
			h.attack?.phase === 'backswing' &&
			(frame.order || frame.pressed.some((e) => e.action === 'primary'))
		)
			h.attack = null
		for (const e of frame.pressed.slice()) {
			if (e.action === 'stop') {
				h.order = null
				h.buffered = null
				for (const s of frame.pressed.slice())
					if (SLOTS.includes(s.action)) intents.consume(h.id, s.action)
				intents.consume(h.id, 'stop')
			} else if (e.action === 'cancel') {
				h.buffered = null
				intents.consume(h.id, 'cancel') // channels arrive with mount and R
			} else if (e.action === 'primary') {
				if (!heldBall && !aimBasic(h, e.at)) attackAhead(h, e.at)
				intents.consume(h.id, 'primary')
			}
		}
		if (frame.order) issue(h, frame.order)
		if (Math.hypot(frame.move.x, frame.move.z) > 0.01) h.order = null
		if (frame.order && ['move', 'attack-move'].includes(h.order?.kind)) h.attack = null
		if (!heldBall) casts(h, frame)
		else h.buffered = null
		if (h.cast?.left === 0) release(h)
		h.body.speedMul =
			slowFactor(h, ctx.t) *
			(h.stance?.factor ?? 1) *
			(ball?.carrying(h) ? tune.ball.carrySpeed : 1)
		move(h, frame, dt)
	}

	function strafe(d, dt) {
		if (d.dead) {
			if (ctx.t >= d.respawnTick) respawn(d)
			return
		}
		const target = enemiesOf(d.team).sort(
			(a, b) =>
				Math.hypot(a.x - d.body.position.x, a.z - d.body.position.z) -
				Math.hypot(b.x - d.body.position.x, b.z - d.body.position.z),
		)[0]
		if (
			d.sparring &&
			!lobby &&
			!d.cast &&
			ctx.t >= d.castTick &&
			target &&
			Math.hypot(target.x - d.body.position.x, target.z - d.body.position.z) <= tune.loose.range
		) {
			const p = d.body.position
			const dx = target.x - p.x,
				dz = target.z - p.z
			const length = Math.hypot(dx, dz) || 1
			d.cast = {
				ability: 'loose',
				slot: 'slot1',
				dir: { x: dx / length, z: dz / length },
				target: { x: target.x, z: target.z },
				yaw: yawOf(dx, dz),
				left: ticks(lobby ? tune.lobby.practice.tell : tune.dummies.tell),
				total: ticks(lobby ? tune.lobby.practice.tell : tune.dummies.tell),
			}
			d.castTick = ctx.t + ticks(tune.dummies.castEvery)
			present({
				type: 'cast',
				hero: d.id,
				ability: 'loose',
				slot: 'slot1',
				point: { x: p.x, y: p.y, z: p.z },
				direction: { ...d.cast.dir },
				target: { ...d.cast.target },
			})
		}
		if (d.cast) {
			d.yaw = d.cast.yaw
			d.body.face(d.cast.dir)
			d.body.update({ x: 0, z: 0 }, dt, 0)
			if (--d.cast.left <= 0) release(d)
			return
		}
		const x = d.body.position.x - d.post.x
		d.flipIn -= dt
		if (d.flipIn <= 0 || x * d.dir > tune.dummies.span) {
			if (d.flipIn <= 0 || x * d.dir > 0) d.dir = -d.dir
			const { flipMin, flipMax } = tune.dummies
			d.flipIn = flipMin + rng() * Math.max(0, flipMax - flipMin)
		}
		d.body.speedMul = (tune.dummies.speed / profile.speed) * slowFactor(d, ctx.t)
		d.body.update({ x: d.dir, z: 0 }, dt)
		// Dummies watch the nearest hero, like players would.
		const h = heroes[0]
		if (h) {
			const p = d.body.position
			const hp = h.body.position
			d.yaw = yawOf(hp.x - p.x, hp.z - p.z)
		}
		d.body.face(dirOf(d.yaw))
	}

	return { control, strafe }
}
