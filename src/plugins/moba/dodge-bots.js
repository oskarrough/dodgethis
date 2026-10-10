import { STEP } from '../../core/app.js'
import { tune } from './tune.js'
import { abilityOf } from './ability.js'
import { clampWalkable, segmentClear, sweepHit, walkable } from './obstacles.js'

const ticks = (s) => Math.max(1, Math.round(s / STEP))
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

// A single judgement survives windup and release. Neither memory nor RNG is shared.
export function createDodgeBot(random) {
	let dodgeGoal = null,
		dodgeUntil = 0
	const judged = new Map()
	return {
		read,
		avoid,
		reset() {
			dodgeGoal = null
		},
	}
	function read(ctx, habits) {
		const { perceived, enemies, team } = ctx
		// One judgement per windup/shot, retained until its threat is gone.
		const threats = []
		for (const u of enemies)
			if (u.cast && (u.cast.shot || abilityOf(u.cast.ability)?.kind === 'shot')) {
				const s = u.cast.shot ?? abilityOf(u.cast.ability).stats
				threats.push({
					key: `${u.id}:${u.cast.ability}:${perceived.tick + u.cast.left}`,
					from: u.pos,
					dir: u.cast.dir,
					range: s.range,
					radius: s.radius,
					delay: u.cast.left * STEP,
					speed: s.speed,
					catchable: u.cast.shot ? true : abilityOf(u.cast.ability).catchable,
				})
			}
		for (const s of perceived.shots.filter((s) => s.team !== team))
			threats.push({
				key: `${s.owner}:${s.ability}:${s.releaseTick}`,
				from: { x: s.x, z: s.z },
				dir: { x: s.dx, z: s.dz },
				range: s.range - s.travelled,
				radius: s.radius,
				speed: s.speed,
				delay: 0,
				catchable: s.catchable,
			})
		for (const habit of habits) threats.push(...(habit.botThreats?.(ctx) ?? []))
		for (const z of perceived.zones.filter((z) => z.team !== team))
			threats.push({
				key: `zone:${z.id}`,
				centre: { x: z.x, z: z.z },
				radius: abilityOf(z.ability ?? 'rain').stats.radius,
				delay: z.left * STEP,
			})
		return threats
	}

	function avoid(ctx, threats) {
		const {
			sim,
			perceived,
			h,
			p,
			now,
			b,
			k,
			side,
			setState,
			catchAbility,
			dashAbility,
			dashSlot,
			move,
			cast,
			safe,
		} = ctx
		const frame = ctx.frame
		const active = new Set(threats.map((t) => t.key))
		for (const key of judged.keys()) if (!active.has(key)) judged.delete(key)
		for (const threat of threats) {
			let goal, impact
			if (threat.centre) {
				if (distance(p, threat.centre) > threat.radius + h.body.radius) continue
				const d = distance(p, threat.centre) || 1
				goal = {
					x:
						threat.centre.x +
						((p.x - threat.centre.x || side) / d) *
							(threat.radius + h.body.radius + b.zoneClearance),
					z:
						threat.centre.z +
						((p.z - threat.centre.z) / d) * (threat.radius + h.body.radius + b.zoneClearance),
				}
				impact = threat.delay
			} else {
				const end = {
					x: threat.from.x + threat.dir.x * threat.range,
					z: threat.from.z + threat.dir.z * threat.range,
				}
				if (
					sweepHit(
						threat.from.x,
						threat.from.z,
						end.x,
						end.z,
						p.x,
						p.z,
						h.body.radius + b.dodgeClearance + threat.radius,
					) === null
				)
					continue
				impact = threat.delay + distance(p, threat.from) / threat.speed
				const clearance = h.body.radius + threat.radius + b.dodgeClearance
				const offset = (p.x - threat.from.x) * threat.dir.z - (p.z - threat.from.z) * threat.dir.x
				const nearSide = Math.sign(offset) || (random() < 0.5 ? -1 : 1)
				const candidates = [nearSide, -nearSide].map((sign) => ({
					x: p.x + threat.dir.z * (sign * clearance - offset),
					z: p.z - threat.dir.x * (sign * clearance - offset),
				}))
				goal = candidates.find(
					(at) =>
						walkable(at.x, at.z, h.body.radius, tune.orders.clearance, sim.obstacles) &&
						segmentClear(p, at, h.body.radius + tune.orders.clearance, sim.obstacles),
				)
			}
			impact -= (now - perceived.tick) * STEP
			if (impact <= 0) continue
			const window = h.catchWindow
			if (window && !threat.centre && (threat.catchable || threat.accepts?.(window))) {
				const dx = threat.from.x - p.x,
					dz = threat.from.z - p.z,
					length = Math.hypot(dx, dz)
				const front =
					window.angle >= 360 ||
					(dx * window.dir.x + dz * window.dir.z) / (length || 1) >=
						Math.cos((window.angle * Math.PI) / 360)
				const atArc = Math.max(0, impact - window.radius / threat.speed)
				if (front && atArc < (window.until - now) * STEP) continue
			}
			if (
				catchAbility &&
				!ctx.skillsLocked &&
				!h.catchWindow &&
				(threat.catchable || threat.accepts?.(catchAbility[1]))
			) {
				const [slot, ability] = catchAbility
				const atArc = impact - ability.stats.radius / threat.speed
				if (atArc >= 0 && atArc < ability.stats.duration && cast(slot, threat.from)) {
					setState('catch')
					return frame
				}
			}
			if (!judged.has(threat.key))
				judged.set(threat.key, { try: random() < k.dodge, at: now + ticks(k.dodgeReaction) })
			const roll = judged.get(threat.key)
			if (!roll.try || now < roll.at || !goal) continue
			goal = clampWalkable(goal, h.body.radius, tune.orders.clearance, sim.obstacles)
			const travel = distance(p, goal)
			if (travel / (h.definition.base.speed * ctx.moveScale) <= impact) {
				dodgeGoal = goal
				dodgeUntil = now + ticks(impact)
				move(goal)
			} else if (
				!ctx.skillsLocked &&
				dashAbility &&
				travel <= dashAbility.stats.range &&
				dashAbility.stats.castPoint +
					travel / (dashAbility.stats.range / Math.max(STEP, dashAbility.stats.time)) <=
					impact &&
				safe(goal) &&
				cast(dashSlot, goal)
			) {
				dodgeGoal = goal
				dodgeUntil = now + ticks(dashAbility.stats.time)
			} else continue
			setState('dodge')
			return frame
		}
		if (dodgeGoal && now < dodgeUntil && distance(p, dodgeGoal) > tune.orders.arrival) {
			move(dodgeGoal)
			return frame
		}
		dodgeGoal = null
		return null
	}
}
