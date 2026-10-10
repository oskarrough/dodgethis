import { tune } from './tune.js'
import { castAbility, abilityOf } from './ability.js'
import { segmentClear } from './obstacles.js'
import { pursue } from './path.js'
import { TAU, ticks, yawOf, dirOf } from './sim-kit.js'

// Where heroes go: right-click and attack-move orders, path following, the walk itself and facing.
export function createOrders(ctx) {
	const {
		lane,
		ball,
		obstacles,
		field,
		scripted,
		botIds,
		present,
		trace,
		walkGoal,
		enemiesOf,
		find,
		pick,
		nearestToClick,
	} = ctx

	function plan(h, goal) {
		const p = h.body.position
		h.stall = 0
		h.lastRemaining = null
		return {
			points: [
				{ x: p.x, z: p.z },
				...ctx.planPath(p, goal, { radius: h.body.radius, ...tune.orders }),
			],
			leg: 0,
		}
	}

	// Re-clicks still acknowledge input; only the expensive plan is suppressed while the hero stays on it.
	function offPath(h) {
		const path = h.order?.path
		if (!path || path.points.length < 2) return false
		const p = h.body.position
		let distance = Infinity
		for (let i = path.leg; i < path.points.length - 1; i++) {
			const a = path.points[i],
				b = path.points[i + 1]
			const dx = b.x - a.x,
				dz = b.z - a.z,
				len2 = dx * dx + dz * dz
			const u = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)) : 0
			distance = Math.min(distance, Math.hypot(p.x - a.x - dx * u, p.z - a.z - dz * u))
		}
		return distance > tune.orders.rejoinDistance
	}

	function issue(h, point) {
		const target = ball?.carrying(h)
			? null
			: point.kind === 'attack-move' && point.pick
				? nearestToClick(h.team, point)
				: point.kind
					? null
					: pick(h.team, point)
		const repeat = ctx.t - h.lastOrder <= ticks(0.15)
		h.lastOrder = ctx.t
		if (target) {
			if (
				h.order?.kind !== 'attack' ||
				h.order.target !== target.id ||
				h.order.resume ||
				offPath(h)
			)
				h.order = {
					kind: 'attack',
					target: target.id,
					goal: null,
					path: null,
					// An attack-move keeps fighting around the click once its pick dies.
					resume: point.kind === 'attack-move' ? walkGoal(point) : undefined,
				}
			present({
				type: 'order',
				hero: h.id,
				kind: 'attack',
				target: target.id,
				point: { x: target.x, z: target.z },
				repeat,
			})
			return
		}
		const goal = walkGoal(point)
		if (
			h.order?.kind !== (point.kind ?? 'move') ||
			Math.hypot(h.order.goal.x - goal.x, h.order.goal.z - goal.z) >= tune.collision.epsilon ||
			offPath(h)
		)
			h.order = { kind: point.kind ?? 'move', target: null, goal, path: plan(h, goal) }
		present({ type: 'order', hero: h.id, kind: h.order.kind, target: null, point: goal, repeat })
	}

	// Pad A: the best target in a 45° cone around the aim, within 1.5 × attack range, nearest first.
	function attackAhead(h, at) {
		const p = h.body.position
		const f = at ? { x: at.x - p.x, z: at.z - p.z } : dirOf(h.yaw)
		const fl = Math.hypot(f.x, f.z) || 1
		let best = null
		let bestD = Infinity
		for (const e of enemiesOf(h.team)) {
			if (lane && !lane.vulnerable(e.unit)) continue
			const dx = e.x - p.x
			const dz = e.z - p.z
			const d = Math.hypot(dx, dz)
			if (
				d > (h.definition.basic?.range ?? 0) * 1.5 ||
				(best && ((!e.hero && best.hero) || (e.hero === best.hero && d >= bestD)))
			)
				continue
			if ((dx * f.x + dz * f.z) / (d * fl || 1) < Math.cos(Math.PI / 8)) continue
			best = e
			bestD = d
		}
		if (best) issue(h, { x: best.x, z: best.z })
	}

	// Walk the path: pursue a carrot, and in the last metre cap speed at distance / dt so arrival lands exactly with no easing.
	function steer(h, goal, arrive, dt) {
		const p = h.body.position
		const top = h.definition.base.speed * h.body.speedMul
		const dist = Math.hypot(goal.x - p.x, goal.z - p.z)
		if (arrive && dist <= tune.orders.arrival) return null
		if (h.order.path.points.length < 2) return null
		const { carrot, remaining } = pursue(h.order.path, p, tune.orders.carrot)
		const last = remaining <= 1
		const aim = last ? goal : carrot
		const ax = aim.x - p.x
		const az = aim.z - p.z
		const al = Math.hypot(ax, az)
		// Stuck against something the static layout does not know: plan again from here.
		if (
			h.lastRemaining !== null &&
			h.lastRemaining - remaining < tune.orders.stallProgress * top * dt
		)
			h.stall += dt
		else h.stall = 0
		h.lastRemaining = remaining
		if (h.stall >= tune.orders.stallTime) h.order.path = plan(h, goal)
		if (al < 1e-6) return null
		return {
			wish: { x: ax / al, z: az / al },
			cap: last && arrive ? Math.min(top, dist / dt) : Infinity,
		}
	}

	function move(h, frame, dt) {
		const body = h.body
		if (
			(h.cast &&
				castAbility(h)?.root !== false &&
				!['stance', 'channel'].includes(castAbility(h)?.kind)) ||
			(h.channel && abilityOf(h.channel.ability, h)?.root === true) ||
			h.attack ||
			h.ballThrow ||
			ctx.t < h.stunUntil ||
			ctx.t < h.freezeUntil ||
			ctx.t < h.proneUntil
		)
			return body.update({ x: 0, z: 0 }, dt, 0) // rooted for the cast point, stopped dead
		const stick = Math.hypot(frame.move.x, frame.move.z)
		if (stick > 0.01) return body.update(frame.move, dt)
		let o = h.order
		if (o?.kind === 'attack-move' && !ball?.carrying(h)) {
			const target = enemiesOf(h.team)
				.filter(
					(e) =>
						(!lane || lane.vulnerable(e.unit)) &&
						Math.hypot(e.x - body.position.x, e.z - body.position.z) <=
							(h.definition.basic?.range ?? 0),
				)
				.sort(
					(a, b) =>
						Math.hypot(a.x - body.position.x, a.z - body.position.z) -
							Math.hypot(b.x - body.position.x, b.z - body.position.z) ||
						String(a.id).localeCompare(String(b.id)),
				)[0]
			if (target)
				h.order = o = { kind: 'attack', target: target.id, goal: null, path: null, resume: o.goal }
		}
		let s = null
		if (o?.kind === 'move' || o?.kind === 'attack-move') {
			s = steer(h, o.goal, true, dt)
			if (!s) h.order = null
		} else if (o?.kind === 'attack') {
			const target = find(o.target)
			if (!target) {
				if (o.resume)
					h.order = { kind: 'attack-move', target: null, goal: o.resume, path: plan(h, o.resume) }
				else h.order = null
			} else {
				const tp = target.body.position
				const p = body.position
				if (
					h.definition.basic &&
					Math.hypot(tp.x - p.x, tp.z - p.z) <=
						h.definition.basic.range + (target.kind ? target.body.radius : 0) &&
					segmentClear(
						p,
						tp,
						h.definition.basic.radius,
						obstacles.filter((o) => o.id !== target.id),
						field,
					)
				) {
					o.path = null
					if (
						ctx.t >=
							h.attackTick -
								ticks(
									scripted.includes(h.id) || botIds.has(h.id)
										? Math.max(h.definition.basic.windup, tune.scripted.tell)
										: h.definition.basic.windup,
								) +
								1 &&
						!body.dashing
					) {
						h.attack = {
							target: target.id,
							phase: 'windup',
							left: ticks(
								scripted.includes(h.id) || botIds.has(h.id)
									? Math.max(h.definition.basic.windup, tune.scripted.tell)
									: h.definition.basic.windup,
							),
						}
						if (h.definition.basic.id) h.attack.total = h.attack.left
						h.yaw = yawOf(tp.x - p.x, tp.z - p.z)
						trace(h, h.attack, tp, h.definition.basic.id)
						present({
							type: 'cast',
							hero: h.id,
							...(h.definition.basic.id && { ability: h.definition.basic.id }),
							slot: 'primary',
							point: { x: p.x, y: p.y, z: p.z },
							direction: dirOf(h.yaw),
							target: { x: tp.x, z: tp.z },
						})
					}
				} else {
					if (
						!o.path ||
						Math.hypot(tp.x - o.goal.x, tp.z - o.goal.z) > tune.orders.replanDistance
					) {
						o.goal = walkGoal(tp)
						o.path = plan(h, o.goal)
					}
					s = steer(h, o.goal, false, dt)
				}
			}
		}
		if (s) body.update(s.wish, dt, s.cap)
		else body.update({ x: 0, z: 0 }, dt, 0)
	}

	// Cosmetic facing: snap to the cast, otherwise turn toward travel (or an attack target) at turnRate.
	function face(h, dt) {
		let want = null
		if (h.ballThrow) want = yawOf(h.ballThrow.dir.x, h.ballThrow.dir.z)
		else if (h.cast) want = h.cast.yaw
		else {
			const v = h.body.velocity
			if (Math.hypot(v.x, v.z) > 0.3) want = yawOf(v.x, v.z)
			else if (h.order?.kind === 'attack') {
				const tp = find(h.order.target)?.body.position
				const p = h.body.position
				if (tp) want = yawOf(tp.x - p.x, tp.z - p.z)
			}
		}
		if (want !== null) {
			const diff = ((((want - h.yaw) % TAU) + TAU * 1.5) % TAU) - Math.PI
			const turn = ((tune.hero.turnRate * Math.PI) / 180) * dt
			h.yaw = h.cast || h.ballThrow ? want : h.yaw + Math.max(-turn, Math.min(turn, diff))
		}
		h.body.face(dirOf(h.yaw))
	}

	return { plan, offPath, issue, attackAhead, steer, move, face }
}
