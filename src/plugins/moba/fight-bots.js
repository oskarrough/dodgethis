import { STEP } from '../../core/app.js'
import { neutralFrame } from '../../core/intents.js'
import { tune } from './tune.js'
import { clampWalkable, sweepHit, sweepObstacles } from './obstacles.js'

const ticks = (s) => Math.max(1, Math.round(s / STEP))
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const position = (u) => ({ x: u.body.position.x, z: u.body.position.z })

// Hero combat and its memory. No match population or objective is assumed.
export function createFightBot(
	{ id, team, file, difficulty, slickCare = true },
	botIds,
	random,
	interceptTime,
) {
	const side = team === 'A' ? -1 : 1
	const normal = () =>
		Math.sqrt(-2 * Math.log(Math.max(Number.EPSILON, random()))) * Math.cos(2 * Math.PI * random())
	const knobs = () => tune.bots[difficulty] ?? tune.bots.normal
	let retreat = false,
		healing = false,
		state = 'advance',
		holdUntil = 0,
		targetId = null,
		stickyUntil = 0,
		seenAt = 0
	return {
		knobs,
		perceive,
		assess,
		returnShot,
		selectTarget,
		fight,
		hold,
		push,
		get state() {
			return state
		},
		get retreating() {
			return retreat
		},
		reset() {
			retreat = false
			healing = false
			targetId = null
			state = 'advance'
		},
	}
	function perceive(sim, perceived, h) {
		const frame = neutralFrame()
		const b = tune.bots,
			k = knobs(),
			p = position(h),
			now = sim.tick
		const abilities = Object.entries(h.definition.abilities).filter(([, a]) => a)
		const [shotSlot, shotAbility] = abilities.find(([, a]) => a.kind === 'shot') ?? []
		const [zoneSlot, zoneAbility] = abilities.find(([, a]) => a.kind === 'zone') ?? []
		const [dashSlot, dashAbility] = abilities.find(([, a]) => a.kind === 'dash') ?? []
		const [swapSlot, swapAbility] = abilities.find(([, a]) => a.blinkTo) ?? []
		const [coverSlot, coverAbility] = abilities.find(([, a]) => a.placesCover) ?? []
		const melee = h.definition.basic?.kind === 'melee'
		const catchAbility = abilities.find(([, a]) => a.kind === 'stance' && a.catchesShots)
		const own = perceived.heroes.filter((u) => !u.dead && u.team === team)
		const enemies = perceived.heroes.filter((u) => !u.dead && u.team !== team)
		const near = (units, at, range) => units.filter((u) => distance(u.pos, at) <= range)
		// The shore flank (−1 or 1) when `at` stands on a gap's slick, widened by `margin`; else 0.
		const slick = (at, margin = 0) => {
			const flank = at.z < 0 ? -1 : 1
			return sim.gaps?.some(
				(g) =>
					g.flank === flank &&
					at.x >= g.x0 - margin &&
					at.x <= g.x1 + margin &&
					Math.abs(at.z) >= sim.shore - tune.flagfall.dunk.slick - margin,
			)
				? flank
				: 0
		}
		const wary = slickCare && near(enemies, p, b.slickWary).length > 0
		const inland = (at) => {
			const flank = wary ? slick(at, b.slickMargin) : 0
			return flank
				? { x: at.x, z: flank * (sim.shore - tune.flagfall.dunk.slick - b.slickMargin) }
				: at
		}
		const effective = (u) => u.hp * (1 + tune.levels.growth * u.level)
		const ctx = {
			sim,
			perceived,
			frame,
			h,
			p,
			now,
			id,
			team,
			side,
			file,
			b,
			k,
			abilities,
			shotSlot,
			shotAbility,
			zoneSlot,
			zoneAbility,
			dashSlot,
			dashAbility,
			swapSlot,
			swapAbility,
			coverSlot,
			coverAbility,
			melee,
			catchAbility,
			own,
			enemies,
			near,
			effective,
			slick,
			wary,
			inland,
			blockers: [],
			pressure: 0,
			skillsLocked: false,
			castBusy: false,
			moveScale: 1,
			preferredTargets: [],
			objectives: [],
			guardOk: [],
			safe: (...args) => ctx.guardOk.every((guard) => guard(...args)),
			setState: (next) => {
				state = next
			},
		}
		const move = (goal) => {
			const at = clampWalkable(
				inland(goal),
				h.body.radius,
				tune.orders.clearance,
				sim.obstacles,
				sim.bounds,
			)
			if (h.order?.kind !== 'move' || distance(h.order.goal, at) > b.goalTolerance) frame.order = at
		}
		const attack = (target) => {
			if (h.order?.kind === 'attack' && h.order.target === target.id) return
			// Only click resolution gets live target coordinates, as specified.
			const live = sim.find(target.id)
			if (live && !live.dead) frame.order = position(live)
		}
		const cast = (slot, at) => {
			if (
				!h.definition.abilities[slot] ||
				(h.cancelUntil?.[Number(slot.slice(-1)) - 1] ?? 0) > now ||
				(h.cd[Number(slot.slice(-1)) - 1] &&
					!(h.definition.abilities[slot]?.returnsPocket && h.abilityState?.pocket)) ||
				h.cast ||
				ctx.castBusy
			)
				return false
			frame.aim = { ...at }
			frame.pressed = [{ action: slot, at: { ...at } }]
			return true
		}
		// Lead and jitter a hero shot; hold fire if another body or cover takes it first.
		// With a caught shot in the pocket, Toss throws that back instead.
		const shoot = (target) => {
			const loose =
				shotAbility?.returnsPocket && h.abilityState?.pocket
					? h.abilityState.pocket.shot
					: shotAbility?.stats
			if (!loose || distance(p, target.pos) > loose.range || target.dashing) return false
			const lead = interceptTime(p, target, loose.speed) * (1 + normal() * k.leadError)
			const dx = target.pos.x + target.vel.x * lead - p.x,
				dz = target.pos.z + target.vel.z * lead - p.z,
				angle = normal() * k.jitter
			const aim = {
				x: p.x + dx * Math.cos(angle) - dz * Math.sin(angle),
				z: p.z + dx * Math.sin(angle) + dz * Math.cos(angle),
			}
			const candidates = [...enemies, ...ctx.blockers]
			const first = candidates
				.map((u) => ({
					u,
					t: sweepHit(p.x, p.z, aim.x, aim.z, u.pos.x, u.pos.z, u.radius + loose.radius),
				}))
				.filter((hit) => hit.t !== null)
				.sort((a, c) => a.t - c.t || a.u.id.localeCompare(c.u.id))[0]
			const cover = sweepObstacles(p, aim, loose.radius, sim.obstacles)
			return (
				!!first &&
				enemies.includes(first.u) &&
				(cover === null || first.t < cover) &&
				ctx.safe(p, [first.u]) &&
				cast(shotSlot, aim)
			)
		}
		Object.assign(ctx, { move, attack, cast, shoot })
		return ctx
	}

	function assess(ctx) {
		const { h, b, k, melee } = ctx
		const support =
			(ctx.near(ctx.own, ctx.p, b.supportRange).reduce((s, u) => s + ctx.effective(u), 0) -
				ctx.near(ctx.enemies, ctx.p, b.supportRange).reduce((s, u) => s + ctx.effective(u), 0)) /
			h.maxHp
		const advantage = support - ctx.pressure
		ctx.advantage = advantage
		// Melee has to leave close combat earlier.
		if (h.hp < h.maxHp * (melee ? b.meleeRetreatHp : b.retreatHp)) healing = true
		if (h.hp >= h.maxHp * b.recoverHp) healing = false
		retreat = healing || advantage < -k.aggression - b.retreatDisadvantage
	}
	function returnShot(ctx) {
		const { frame, h, p, enemies, effective, shoot } = ctx

		// A caught shot is free damage with a short fuse: throw it back from any state.
		if (h.abilityState?.pocket && !ctx.skillsLocked) {
			const mark = enemies
				.filter((u) => distance(u.pos, p) <= h.abilityState.pocket.shot.range)
				.sort((a, c) => effective(a) - effective(c) || a.id.localeCompare(c.id))
				.find(shoot)
			if (mark) {
				state = 'return'
				return frame
			}
		}

		return null
	}
	function selectTarget(ctx) {
		const { h, p, now, b, k, own, enemies, effective, shotAbility, zoneAbility, near } = ctx

		// Easy opponents give an early human one duelist, not a firing squad.
		// Assignment uses delayed public positions and stable ids on equal distances.
		const canFocus = (enemy) => {
			if (difficulty !== 'easy' || !botIds || botIds.has(enemy.id) || now * STEP >= k.focusUntil)
				return true
			const duelists = own
				.filter((unit) => botIds.has(unit.id))
				.sort(
					(a, c) =>
						distance(a.pos, enemy.pos) - distance(c.pos, enemy.pos) || a.id.localeCompare(c.id),
				)
			return duelists.slice(0, k.humanAttackers).some((unit) => unit.id === id)
		}
		const rivals = near(
			enemies.filter(canFocus),
			p,
			Math.max(b.fightRange, shotAbility?.stats.range ?? 0, zoneAbility?.stats.range ?? 0),
		).sort((a, c) => effective(a) - effective(c) || a.id.localeCompare(c.id))
		const target =
			rivals.find((u) => ctx.preferredTargets.includes(u.id)) ??
			rivals.find((u) => u.id === targetId && now < stickyUntil) ??
			rivals[0]
		if (target?.id !== targetId) {
			targetId = target?.id ?? null
			stickyUntil = now + ticks(b.sticky)
			seenAt = now
		}
		const attackReach = (h.definition.basic?.range ?? 0) + (target?.radius ?? 0)
		const targetDistance = target ? distance(p, target.pos) : 0
		const attackSpot =
			targetDistance > attackReach
				? {
						x: target.pos.x + ((p.x - target.pos.x) / targetDistance) * attackReach,
						z: target.pos.z + ((p.z - target.pos.z) / targetDistance) * attackReach,
					}
				: p
		Object.assign(ctx, { target, attackReach, targetDistance, attackSpot, canFocus })
	}
	function fight(ctx) {
		const {
			sim,
			frame,
			h,
			p,
			now,
			b,
			k,
			enemies,
			effective,
			shotAbility,
			zoneAbility,
			zoneSlot,
			dashAbility,
			dashSlot,
			swapAbility,
			swapSlot,
			coverAbility,
			coverSlot,
			shotSlot,
			advantage,
			near,
			move,
			attack,
			cast,
			safe,
			shoot,
		} = ctx

		const { target, attackReach, targetDistance, attackSpot, canFocus } = ctx
		// Swap (trade places with your own Bank shot): out when hurt, in on a low target.
		const mark = swapAbility?.blinkTo({ hero: h, sim, tick: now })
		if (mark) {
			const threat = (at) => Math.min(...enemies.map((u) => distance(u.pos, at)))
			if (
				h.hp < h.maxHp * b.retreatHp &&
				enemies.length &&
				threat(mark) > threat(p) + b.stutter &&
				cast(swapSlot, mark)
			)
				return frame
			if (
				target &&
				target.hp < target.maxHp * b.chaseHp &&
				distance(p, target.pos) > attackReach &&
				distance(mark, target.pos) <= attackReach &&
				safe(mark, [target]) &&
				cast(swapSlot, mark)
			)
				return frame
		}
		if (target && advantage >= -k.aggression) {
			state = 'fight'
			holdUntil = now + ticks(b.hold)
			const rain = zoneAbility?.stats
			let predicted = {
				x: target.pos.x + target.vel.x * (rain?.delay ?? 0),
				z: target.pos.z + target.vel.z * (rain?.delay ?? 0),
			}
			const predictedHeroes = rain
				? enemies.map((u) => ({
						...u,
						pos: { x: u.pos.x + u.vel.x * rain.delay, z: u.pos.z + u.vel.z * rain.delay },
					}))
				: []
			const cluster =
				rain &&
				predictedHeroes
					.filter((u) => canFocus(u) && distance(p, u.pos) <= rain.range)
					.map((u) => ({ u, count: near(predictedHeroes, u.pos, rain.radius).length }))
					.sort(
						(a, c) =>
							c.count - a.count || effective(a.u) - effective(c.u) || a.u.id.localeCompare(c.u.id),
					)[0]
			if (cluster && cluster.count >= b.rainHeroes) predicted = cluster.u.pos
			// A hero on the slick: land Rain just inland of them, so its shove carries them out to sea.
			const mark =
				rain &&
				predictedHeroes
					.filter((u) => canFocus(u) && ctx.slick(u.pos) && distance(p, u.pos) <= rain.range)
					.sort((a, c) => effective(a) - effective(c) || a.id.localeCompare(c.id))[0]
			if (mark) {
				const out = ctx.slick(mark.pos)
				const inset = Math.min(b.dunkRain, rain.radius)
				predicted = { x: mark.pos.x, z: mark.pos.z - out * inset }
				if (distance(p, predicted) > rain.range) predicted = mark.pos
			}
			if (
				rain &&
				distance(p, predicted) <= rain.range &&
				safe(
					p,
					predictedHeroes.filter((u) => distance(u.pos, predicted) <= rain.radius + u.radius),
					rain.radius,
				) &&
				cast(zoneSlot, predicted)
			)
				return frame
			// Cushion: no cover near the target to bank off, so put a wall behind them before Bank.
			const bank = shotAbility?.stats.bounce && shotAbility.stats
			const reach = targetDistance || 1
			const behind = coverAbility && {
				x: target.pos.x + ((target.pos.x - p.x) / reach) * coverAbility.stats.radius,
				z: target.pos.z + ((target.pos.z - p.z) / reach) * coverAbility.stats.radius,
			}
			if (
				bank &&
				behind &&
				!h.cd[Number(shotSlot.slice(-1)) - 1] &&
				distance(p, target.pos) <= bank.range &&
				distance(p, behind) <= coverAbility.stats.range &&
				!sim.obstacles.some(
					(o) => !['tower', 'core'].includes(o.kind) && distance(o, target.pos) <= bank.range / 3,
				) &&
				cast(coverSlot, behind)
			)
				return frame
			if (now - seenAt >= ticks(k.reaction) && shoot(target)) return frame
			const dash = dashAbility
			if (
				dash?.kind === 'dash' &&
				target.hp < target.maxHp * b.chaseHp &&
				distance(p, target.pos) <= b.chaseRange &&
				distance(p, target.pos) > attackReach
			) {
				const d = distance(p, target.pos)
				const landing = clampWalkable(
					{
						x: p.x + ((target.pos.x - p.x) / d) * dash.stats.range,
						z: p.z + ((target.pos.z - p.z) / d) * dash.stats.range,
					},
					h.body.radius,
					tune.orders.clearance,
					sim.obstacles,
				)
				if (safe(landing, [target]) && cast(dashSlot, landing)) return frame
			}
			if (safe(attackSpot, [target])) {
				if (h.attack?.phase === 'backswing') move({ x: p.x + side * b.stutter, z: p.z })
				else attack(target)
				return frame
			}
		}
		if (target && !safe(attackSpot, [target])) {
			state = 'backoff'
			const reach = (shotAbility?.stats.range ?? b.fightRange) + b.stutter
			const d = targetDistance || 1
			move({
				x: target.pos.x + ((p.x - target.pos.x || side) / d) * reach,
				z: target.pos.z + ((p.z - target.pos.z) / d) * reach,
			})
			return frame
		}

		return null
	}
	function hold(ctx) {
		const { now, target, safe, attackSpot, attack, frame } = ctx
		if (state === 'fight' && now < holdUntil && target && safe(attackSpot, [target])) {
			attack(target)
			return frame
		}

		return null
	}
	function push(ctx) {
		const { h, p, b, route, move, frame } = ctx
		state = 'push'
		move(route ? route.point(route.progress(p) + b.fightRange) : { x: -h.spawn.x, z: file })
		return frame
	}
}
