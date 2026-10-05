import { STEP } from '../../core/app.js'
import { neutralFrame } from '../../core/intents.js'
import { tune } from './tune.js'
import { abilityOf } from './ability.js'
import { clampWalkable, segmentClear, sweepHit, sweepObstacles, walkable } from './obstacles.js'

const ticks = (s) => Math.max(1, Math.round(s / STEP))
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const position = (u) => ({ x: u.body.position.x, z: u.body.position.z })

export function interceptTime(from, target, speed) {
	const dx = target.pos.x - from.x,
		dz = target.pos.z - from.z
	const a = target.vel.x ** 2 + target.vel.z ** 2 - speed ** 2
	const b = 2 * (dx * target.vel.x + dz * target.vel.z),
		c = dx ** 2 + dz ** 2
	if (Math.abs(a) < tune.collision.epsilon) return b < 0 ? -c / b : Math.sqrt(c) / speed
	const discriminant = b * b - 4 * a * c
	if (discriminant < 0) return Math.sqrt(c) / speed
	const roots = [
		(-b - Math.sqrt(discriminant)) / (2 * a),
		(-b + Math.sqrt(discriminant)) / (2 * a),
	].filter((t) => t >= 0)
	return roots.length ? Math.min(...roots) : Math.sqrt(c) / speed
}

export function practiceRoster(local = 'local', difficulty = 'easy', picks = {}) {
	const localTeam = picks[local]?.team ?? 'A'
	const claimed = [local, ...Object.keys(picks).filter((id) => id !== local)]
	return ['A', 'B'].flatMap((team) => {
		const ids = claimed.filter(
			(id) =>
				(picks[id]?.team ?? (id === local ? localTeam : id.startsWith('bot-B-') ? 'B' : 'A')) ===
				team,
		)
		if (ids.length > 3) throw new Error(`MOBA team ${team} has more than three picks`)
		for (let i = team === localTeam ? 1 : 0; ids.length < 3; i++) {
			const id = `bot-${team}-${i}`
			if (!claimed.includes(id)) ids.push(id)
		}
		return ids.map((id, i) => ({
			id,
			team,
			heroId: picks[id]?.heroId ?? 'fletcher',
			file: (i - 1) * tune.bots.fileSpacing,
			difficulty: team === localTeam ? 'normal' : difficulty,
		}))
	})
}

// Fork by participant, not roster order. No stream or mutable brain is shared by sims.
export function botRandom(seed, id) {
	let state = seed >>> 0
	for (const c of id) state = Math.imul(state ^ c.charCodeAt(0), 16777619) >>> 0
	return () => {
		state += 0x6d2b79f5
		let n = Math.imul(state ^ (state >>> 15), 1 | state)
		n ^= n + Math.imul(n ^ (n >>> 7), 61 | n)
		return ((n ^ (n >>> 14)) >>> 0) / 4294967296
	}
}

function view(sim, births) {
	const unit = (u) => ({
		id: u.id,
		team: u.team,
		kind: u.kind,
		structure: !!u.structure,
		dead: u.dead,
		hp: u.hp,
		maxHp: u.maxHp,
		level: u.level ?? 1,
		pos: position(u),
		radius: u.body.radius,
		vel: { x: u.body.velocity?.x ?? 0, z: u.body.velocity?.z ?? 0 },
		cast: u.cast && structuredClone(u.cast),
		dashing: !!u.body.dashing,
		target: u.target,
		vulnerable: !u.structure || sim.lane.vulnerable(u),
	})
	return {
		tick: sim.tick,
		heroes: sim.heroes.map(unit),
		minions: sim.lane.minions.filter((u) => !u.dead).map(unit),
		structures: sim.lane.structures.map(unit),
		shots: sim.shots
			.filter((s) => !s.target)
			.map((s) => {
				if (!births.has(s)) births.set(s, sim.tick)
				return { ...s, releaseTick: births.get(s) }
			}),
		ball: sim.ball.state ? structuredClone(sim.ball.state) : null,
		zones: sim.zones.map((z) => ({ ...z })),
		globes: sim.lane.globes.map((g) => ({ ...g, pos: { ...g.pos } })),
	}
}

// The sole perception boundary. Only own state is live; every threat and
// objective, including the Ball, comes from this ring.
export function createBots(seats, seed = tune.bots.seed) {
	const history = []
	const births = new WeakMap()
	const botIds = new Set(seats.map((seat) => seat.id))
	const brains = seats.map((seat) => createBot(seat, seed, botIds))
	return {
		brains,
		step(sim, intents) {
			history.push(view(sim, births))
			const retention = ticks(tune.bots.history)
			while (history.length > retention) history.shift()
			for (const brain of brains) {
				const lag = ticks(brain.knobs().reaction)
				const perceived = history[Math.max(0, history.length - 1 - lag)]
				intents.feed(brain.id, brain.frame(sim, perceived))
			}
		},
	}
}

export function createBot({ id, team, file = 0, difficulty = 'normal' }, seed, botIds = null) {
	const random = botRandom(seed, id)
	const normal = () =>
		Math.sqrt(-2 * Math.log(Math.max(Number.EPSILON, random()))) * Math.cos(2 * Math.PI * random())
	const knobs = () => tune.bots[difficulty] ?? tune.bots.normal
	let retreat = false,
		healing = false,
		state = 'lane',
		holdUntil = 0,
		targetId = null,
		stickyUntil = 0,
		seenAt = 0
	let nextThink = Math.floor(random() * tune.bots.thinkTicks)
	let dodgeGoal = null,
		dodgeUntil = 0
	let flankGoal = null,
		flankedBall = null
	const judged = new Map()
	const side = team === 'A' ? -1 : 1
	return {
		id,
		knobs,
		get state() {
			return state
		},
		get retreating() {
			return retreat
		},
		frame(sim, perceived) {
			const frame = neutralFrame()
			const h = sim.heroes.find((u) => u.id === id)
			if (!h || h.dead) {
				retreat = false
				healing = false
				dodgeGoal = null
				targetId = null
				state = 'lane'
				return frame
			}
			if (sim.tick < nextThink) return frame
			nextThink = sim.tick + tune.bots.thinkTicks
			if (!sim.ball.carrying(h)) {
				flankGoal = null
				flankedBall = null
			}
			const b = tune.bots,
				k = knobs(),
				p = position(h),
				now = sim.tick
			const abilities = Object.entries(h.definition.abilities).filter(([, a]) => a)
			const [shotSlot, shotAbility] = abilities.find(([, a]) => a.kind === 'shot') ?? []
			const [zoneSlot, zoneAbility] = abilities.find(([, a]) => a.kind === 'zone') ?? []
			const [dashSlot, dashAbility] = abilities.find(([, a]) => a.kind === 'dash') ?? []
			const catchAbility = abilities.find(([, a]) => a.kind === 'stance' && a.catchesShots)
			const own = perceived.heroes.filter((u) => !u.dead && u.team === team)
			const enemies = perceived.heroes.filter((u) => !u.dead && u.team !== team)
			const minions = perceived.minions
			const guards = perceived.structures.filter((u) => !u.dead && u.team !== team)
			const structures = guards.filter((u) => u.vulnerable)
			const wave = minions.filter((u) => u.team === team)
			const near = (units, at, range) => units.filter((u) => distance(u.pos, at) <= range)
			const effective = (u) => u.hp * (1 + tune.levels.growth * u.level)
			const advantage =
				(near(own, p, b.supportRange).reduce((s, u) => s + effective(u), 0) -
					near(enemies, p, b.supportRange).reduce((s, u) => s + effective(u), 0)) /
					h.maxHp -
				guards.filter((u) => distance(u.pos, p) <= tune[u.kind].range + h.body.radius).length
			const move = (goal) => {
				const at = clampWalkable(goal, h.body.radius, tune.orders.clearance, sim.obstacles)
				if (h.order?.kind !== 'move' || distance(h.order.goal, at) > b.goalTolerance)
					frame.order = at
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
					h.ballThrow
				)
					return false
				frame.aim = { ...at }
				frame.pressed = [{ action: slot, at: { ...at } }]
				return true
			}
			const safe = (at, victims = [], radius = 0) =>
				guards.every((g) => {
					const range = tune[g.kind].range
					if (
						distance(g.pos, at) > range + h.body.radius ||
						!victims.some((u) => distance(g.pos, u.pos) <= range + u.radius + radius)
					)
						return true
					const scale = 1 + tune.levels.growth * (h.level - 1)
					const burst =
						scale *
						((h.definition.basic?.damage ?? 0) * b.burstWindow +
							abilities
								.filter(
									([slot, a]) =>
										['shot', 'zone'].includes(a.kind) && !h.cd[Number(slot.slice(-1)) - 1],
								)
								.reduce((damage, [, a]) => damage + (a.stats.damage ?? 0), 0))
					return (
						victims.some((u) => u.hp <= burst) &&
						h.hp -
							b.towerExposure *
								tune[g.kind].damage *
								(perceived.tick * STEP >= tune.match.late ? tune.match.lateGunDamage : 1) >
							h.maxHp * b.retreatHp
					)
				})
			if (h.hp < h.maxHp * b.retreatHp) healing = true
			if (h.hp >= h.maxHp * b.recoverHp) healing = false
			retreat = healing || advantage < -k.aggression - b.retreatDisadvantage

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
			const ball = perceived.ball
			if (perceived.ball?.state === 'flying' && perceived.ball.team !== team) {
				const s = perceived.ball.shot
				threats.push({
					key: `ball:${perceived.ball.id}`,
					from: { x: s.x, z: s.z },
					dir: { x: s.dx, z: s.dz },
					range: s.range - s.travelled,
					radius: s.radius,
					speed: s.speed,
					delay: 0,
					ball: true,
				})
			}
			for (const z of perceived.zones.filter((z) => z.team !== team))
				threats.push({
					key: `zone:${z.id}`,
					centre: { x: z.x, z: z.z },
					radius: tune[z.ability ?? 'rain'].radius,
					delay: z.left * STEP,
				})
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
				if (window && !threat.centre && (threat.catchable || (threat.ball && window.acceptBall))) {
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
					!sim.ball.carrying(h) &&
					!h.catchWindow &&
					(threat.catchable || (threat.ball && catchAbility[1].acceptBall))
				) {
					const [slot, ability] = catchAbility
					const atArc = impact - ability.stats.radius / threat.speed
					if (atArc >= 0 && atArc < ability.stats.duration && cast(slot, threat.from)) {
						state = 'catch'
						return frame
					}
				}
				if (!judged.has(threat.key))
					judged.set(threat.key, { try: random() < k.dodge, at: now + ticks(k.dodgeReaction) })
				const roll = judged.get(threat.key)
				if (!roll.try || now < roll.at || !goal) continue
				goal = clampWalkable(goal, h.body.radius, tune.orders.clearance, sim.obstacles)
				const travel = distance(p, goal)
				if (
					travel / (h.definition.base.speed * (sim.ball.carrying(h) ? tune.ball.carrySpeed : 1)) <=
					impact
				) {
					dodgeGoal = goal
					dodgeUntil = now + ticks(impact)
					move(goal)
				} else if (
					!sim.ball.carrying(h) &&
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
				state = 'dodge'
				return frame
			}
			if (dodgeGoal && now < dodgeUntil && distance(p, dodgeGoal) > tune.orders.arrival) {
				move(dodgeGoal)
				return frame
			}
			dodgeGoal = null
			if (retreat) {
				state = 'retreat'
				const globe = perceived.globes.find(
					(g) =>
						g.team === team &&
						distance(g.pos, p) <= b.globeRange &&
						side * (g.pos.x - p.x) >= 0 &&
						walkable(g.pos.x, g.pos.z, h.body.radius, 0, sim.obstacles),
				)
				move(globe?.pos ?? h.spawn)
				return frame
			}
			if (sim.ball.carrying(h)) {
				state = 'carrier'
				const structure = structures[0]
				const close = enemies
					.filter(
						(u) =>
							distance(u.pos, p) <= b.throwHeroRange &&
							(h.hp < h.maxHp * b.ballHp || u.hp <= tune.ball.heroDamage) &&
							safe(p, [u]),
					)
					.sort((a, c) => a.hp - c.hp || a.id.localeCompare(c.id))[0]
				const structureReach = structure
					? tune.ball.range + tune.ball.radius + structure.radius - b.throwMargin
					: 0
				const target =
					structure && distance(p, structure.pos) <= structureReach
						? structure
						: (close ?? structure)
				if (!target) return frame
				const reach = tune.ball.range + tune.ball.radius + target.radius - b.throwMargin
				if (
					distance(p, target.pos) <= reach &&
					!h.ballThrow &&
					safe(p, target === close ? [close] : [])
				) {
					frame.aim = { ...target.pos }
					frame.pressed = [{ action: 'primary', at: { ...target.pos } }]
				} else {
					const d = distance(p, target.pos) || 1
					if (
						target.structure &&
						flankedBall !== ball.id &&
						near(enemies, p, b.carrierDanger).length &&
						Math.abs(p.x) < tune.map.baseWallX &&
						distance(p, target.pos) > reach + b.carrierDanger
					) {
						const margin = h.body.radius + tune.orders.clearance
						const x =
							target.kind === 'tower'
								? tune.map.hedgeInnerX - margin
								: target.kind === 'fort'
									? tune.map.hedgeOuterX + margin
									: tune.map.baseWallX - margin
						flankGoal = {
							x: Math.sign(target.pos.x) * x,
							z: file < 0 ? -b.carrierFlank : b.carrierFlank,
						}
						flankedBall = ball.id
					}
					if (flankGoal) {
						if (distance(p, flankGoal) > b.goalTolerance) {
							move(flankGoal)
							return frame
						}
						flankGoal = null
					}
					move({
						x: target.pos.x + ((p.x - target.pos.x) / d) * (reach - tune.orders.arrival * 2),
						z: target.pos.z + ((p.z - target.pos.z) / d) * (reach - tune.orders.arrival * 2),
					})
				}
				return frame
			}
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
			let target =
				(ball?.state === 'carried' && ball.team !== team
					? rivals.find((u) => u.id === ball.carrier)
					: null) ??
				rivals.find((u) => u.id === targetId && now < stickyUntil) ??
				rivals[0]
			if (target?.id !== targetId) {
				targetId = target?.id ?? null
				stickyUntil = now + ticks(b.sticky)
				seenAt = now
			}
			// Spend an already-paid minion screen before staging for a future Ball.
			// Otherwise late warnings can repeatedly pull the sieger off an open core.
			const opening = structures[0]
			const screen = opening ? near(wave, opening.pos, tune[opening.kind].range) : []
			const screenStrength = screen.reduce(
				(n, u) => n + (u.kind === 'brute' ? b.bruteEscort : 1),
				0,
			)
			if (
				file === b.siegeFile &&
				opening &&
				screenStrength >= b.siegeMinions &&
				minions.some((u) => u.id === opening.target && u.team === team) &&
				!(ball?.state === 'carried' && ball.team !== team && target?.id === ball.carrier)
			) {
				state = 'push'
				attack(opening)
				return frame
			}
			const preparing = ball?.state === 'warning' && ball.spawnAt - now <= ticks(b.ballPrepare)
			const objective = ball && ['loose', 'channel'].includes(ball.state)
			if (
				(preparing || objective) &&
				h.hp > h.maxHp * b.ballHp &&
				(!preparing || !target || distance(p, target.pos) > b.fightRange)
			) {
				const allies = near(own, ball.pos, b.supportRange),
					foes = near(enemies, ball.pos, b.supportRange)
				const contest =
					allies.length >= foes.length &&
					allies.reduce((s, u) => s + u.hp, 0) >
						foes.reduce((s, u) => s + u.hp, 0) * b.ballContestHp
				const nearest = [...own].sort(
					(a, c) =>
						distance(a.pos, ball.pos) - distance(c.pos, ball.pos) || a.id.localeCompare(c.id),
				)[0]
				if (
					(preparing && nearest?.id === id) ||
					(contest &&
						nearest?.id === id &&
						!near(enemies, ball.pos, tune.ball.pickup + h.body.radius).length)
				) {
					state = 'ball'
					if (objective && distance(p, ball.pos) <= tune.ball.pickup) {
						// Preserve the committed tell; ordinary orders may still replan.
						if (!h.cast && !h.ballThrow && (h.order || h.attack))
							frame.pressed = [{ action: 'stop', at: null }]
					} else move(preparing ? { x: ball.pos.x + side * b.shadowRange, z: file } : ball.pos)
					return frame
				}
				if (objective && !target) {
					state = 'ball'
					move({ x: ball.pos.x + side * b.shadowRange, z: file })
					return frame
				}
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
			const homeGuard = perceived.structures.find((u) => !u.dead && u.team === team)
			const invaders = minions.filter(
				(u) =>
					u.team !== team &&
					homeGuard &&
					distance(u.pos, homeGuard.pos) <= tune[homeGuard.kind].range &&
					distance(u.pos, p) <= (zoneAbility?.stats.range ?? 0),
			)
			if (invaders.length && (!target || advantage < -k.aggression)) {
				state = 'defend'
				const focus = invaders.sort((a, c) => a.hp - c.hp || a.id.localeCompare(c.id))[0]
				if (
					invaders.length >= b.clearMinions &&
					distance(p, focus.pos) <= (zoneAbility?.stats.range ?? 0) &&
					cast(zoneSlot, focus.pos)
				)
					return frame
				attack(focus)
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
								c.count - a.count ||
								effective(a.u) - effective(c.u) ||
								a.u.id.localeCompare(c.u.id),
						)[0]
				if (cluster && cluster.count >= b.rainHeroes) predicted = cluster.u.pos
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
				const loose =
					shotAbility?.returnsPocket && h.abilityState?.pocket
						? h.abilityState.pocket.shot
						: shotAbility?.stats
				if (
					loose &&
					distance(p, target.pos) <= loose.range &&
					now - seenAt >= ticks(k.reaction) &&
					!target.dashing
				) {
					const lead = interceptTime(p, target, loose.speed) * (1 + normal() * k.leadError)
					const dx = target.pos.x + target.vel.x * lead - p.x,
						dz = target.pos.z + target.vel.z * lead - p.z,
						angle = normal() * k.jitter
					const aim = {
						x: p.x + dx * Math.cos(angle) - dz * Math.sin(angle),
						z: p.z + dx * Math.sin(angle) + dz * Math.cos(angle),
					}
					const candidates = [...enemies, ...minions.filter((u) => u.team !== team), ...guards]
					const first = candidates
						.map((u) => ({
							u,
							t: sweepHit(p.x, p.z, aim.x, aim.z, u.pos.x, u.pos.z, u.radius + loose.radius),
						}))
						.filter((hit) => hit.t !== null)
						.sort((a, c) => a.t - c.t || a.u.id.localeCompare(c.u.id))[0]
					const cover = sweepObstacles(p, aim, loose.radius, sim.obstacles)
					if (
						first &&
						!first.u.kind &&
						(cover === null || first.t < cover) &&
						safe(p, [first.u]) &&
						cast(shotSlot, aim)
					)
						return frame
				}
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
			if (ball?.state === 'carried' && ball.team === team) {
				state = 'escort'
				move({ x: ball.pos.x - side * b.escortAhead, z: ball.pos.z + file })
				return frame
			}
			const siege = structures[0]
			const escort = siege ? near(wave, siege.pos, tune[siege.kind].range) : []
			const escortStrength = escort.reduce(
				(count, u) => count + (u.kind === 'brute' ? b.bruteEscort : 1),
				0,
			)
			if (
				siege &&
				escortStrength >= b.siegeMinions &&
				minions.some((u) => u.id === siege.target && u.team === team)
			) {
				state = 'push'
				attack(siege)
				return frame
			}
			if (state === 'fight' && now < holdUntil && target && safe(attackSpot, [target])) {
				attack(target)
				return frame
			}
			state = 'lane'
			if (
				siege &&
				distance(p, siege.pos) <= tune[siege.kind].range + h.body.radius &&
				escortStrength < b.siegeMinions
			) {
				move({
					x: siege.pos.x + side * (tune[siege.kind].range + h.body.radius + b.siegeBackoff),
					z: file,
				})
				return frame
			}
			const front = [...wave].sort(
				(a, c) => side * (a.pos.x - c.pos.x) || a.id.localeCompare(c.id),
			)[0]
			const guard = perceived.structures.find((u) => !u.dead && u.team === team)
			const goal = { x: (front?.pos.x ?? guard?.pos.x ?? h.spawn.x) + side * b.laneBehind, z: file }
			const creep = minions
				.filter(
					(u) =>
						u.team !== team && distance(u.pos, p) <= (h.definition.basic?.range ?? 0) + u.radius,
				)
				.sort((a, c) => a.hp - c.hp || a.id.localeCompare(c.id))[0]
			if (creep && safe(p)) attack(creep)
			else move(goal)
			return frame
		},
	}
}
