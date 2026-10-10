import { STEP } from '../../core/app.js'
import { slowFactor } from './ability.js'
import { tune } from './tune.js'
import { clampWalkable } from './obstacles.js'
import { createPathPlanner } from './path.js'

const ticks = (s) => Math.max(1, Math.round(s / STEP))
// A lane's normal is authored A→B, so files keep their side on the reverse march.
const direction = (a, b) => {
	const length = Math.hypot(b.x - a.x, b.z - a.z) || 1
	return { x: (b.x - a.x) / length, z: (b.z - a.z) / length }
}
const offset = (point, forward, file) => ({
	x: point.x - forward.z * file,
	z: point.z + forward.x * file,
})
const distance = (a, b) =>
	Math.hypot(a.body.position.x - b.body.position.x, a.body.position.z - b.body.position.z)
export const inReach = (a, b, range) => {
	const dx = a.body.position.x - b.body.position.x,
		dz = a.body.position.z - b.body.position.z
	return dx * dx + dz * dz <= (range + b.body.radius) ** 2
}

// Plain agents: lane routes and pursuit paths, no character controllers or render-time decisions.
export function createLane({
	layout,
	structures: withStructures = true,
	heroes,
	present,
	damage,
	projectile,
	makeBody,
	removeTower,
	obstacles,
	wavesEnabled = () => true,
}) {
	const pathOptions = (radius = tune.waves.radius) => ({ radius, ...tune.orders })
	const planners = new Map()
	const planner = (radius) => {
		if (!planners.has(radius))
			planners.set(radius, createPathPlanner(pathOptions(radius), obstacles, layout.bounds))
		return planners.get(radius)
	}
	let time = 0
	let serial = 0
	let nextWave = ticks(tune.waves.first)
	const minions = []
	const teams = { A: { xp: 0, level: 1 }, B: { xp: 0, level: 1 } }
	const globes = []
	// Each enemy tower a team takes adds one minion to every later wave of theirs.
	const reinforcements = { A: 0, B: 0 }
	const match = { winner: null, endedTick: null, phase: 'early' }
	const structures = (withStructures ? layout.structures : []).map(
		({ id, kind, team, x, z, lane, after = [] }) => ({
			id,
			team,
			kind,
			structure: true,
			lane,
			after,
			hp: tune[kind].hp,
			maxHp: tune[kind].hp,
			dead: false,
			body: makeBody(x, z, team, kind),
			target: null,
			forced: null,
			aggroUntil: 0,
			silentUntil: 0,
			attackTick: 0,
			attack: null,
		}),
	)
	const vulnerable = (unit) => {
		if (!unit.structure) return true
		const after = unit.after
		const fallen = (id) => structures.find((s) => s.id === id)?.dead === true
		return Array.isArray(after)
			? after.every(fallen)
			: (after.all ?? []).every(fallen) && (!after.any?.length || after.any.some(fallen))
	}
	function route(lane, team, file) {
		const path = team === 'A' ? lane.path : [...lane.path].reverse()
		const points = path.map((point, i) => {
			const forward = direction(path[Math.max(0, i - 1)], path[Math.max(1, i)])
			return offset(point, team === 'A' ? forward : { x: -forward.x, z: -forward.z }, file)
		})
		const core = structures.find((s) => s.kind === 'core' && s.team !== team)
		if (core) {
			const end = path.at(-1)
			const forward = direction(path.at(-2), end)
			const towardCore = direction(end, core.body.position)
			const goal = offset(
				{
					x:
						core.body.position.x - towardCore.x * (core.body.radius + tune.waves.structureStandoff),
					z:
						core.body.position.z - towardCore.z * (core.body.radius + tune.waves.structureStandoff),
				},
				team === 'A' ? towardCore : { x: -towardCore.x, z: -towardCore.z },
				file,
			)
			// A collinear core extends the final leg; an off-lane core needs the courtyard turn.
			if (forward.x * towardCore.z - forward.z * towardCore.x === 0)
				points[points.length - 1] = goal
			else points.push(goal)
		}
		return points
	}
	function lanePoint(unit, point, width = null) {
		const a = unit.route[unit.routeLeg - 1],
			b = unit.route[unit.routeLeg]
		const forward = direction(a, b)
		const file = unit.team === 'A' ? unit.file : -unit.file
		// Axis-aligned lanes retain their exact clamp arithmetic (and seeded outcomes).
		if (forward.z === 0) {
			const centre = a.z - forward.x * file
			return {
				x: point.x,
				z: width === null ? a.z : Math.max(centre - width, Math.min(centre + width, point.z)),
			}
		}
		if (forward.x === 0) {
			const centre = a.x + forward.z * file
			return {
				x: width === null ? a.x : Math.max(centre - width, Math.min(centre + width, point.x)),
				z: point.z,
			}
		}
		const normal = (point.z - a.z) * forward.x - (point.x - a.x) * forward.z
		const excess =
			normal - (width === null ? 0 : Math.max(-width - file, Math.min(width - file, normal)))
		return { x: point.x + forward.z * excess, z: point.z - forward.x * excess }
	}
	const find = (id) =>
		minions.find((u) => u.id === id && !u.dead) ??
		structures.find((u) => u.id === id && !u.dead) ??
		heroes.find((u) => u.id === id && !u.dead)
	function nearest(unit, range, candidates) {
		let best = null,
			bestRank = Infinity,
			bestDistance = Infinity
		for (const candidate of candidates) {
			// Camp guards (team 'N') are left to heroes; lanes and guns ignore them.
			if (candidate.dead || candidate.team === unit.team || candidate.team === 'N') continue
			const dx = candidate.body.position.x - unit.body.position.x,
				dz = candidate.body.position.z - unit.body.position.z
			const d = dx * dx + dz * dz
			if (d > (range + candidate.body.radius) ** 2 || !vulnerable(candidate)) continue
			const rank = candidate.structure ? 1 : candidate.kind ? 0 : 2
			if (rank < bestRank || (rank === bestRank && d < bestDistance)) {
				best = candidate
				bestRank = rank
				bestDistance = d
			}
		}
		return best
	}
	function spawn(t) {
		for (const lane of layout.lanes)
			for (const team of ['A', 'B']) {
				const path = team === 'A' ? lane.path : [...lane.path].reverse()
				const forward = direction(path[0], path[1])
				for (const [row, kind] of (t * STEP >= tune.match.late
					? ['melee', 'ranged', 'wizard', 'brute']
					: ['melee', 'ranged', 'wizard']
				).entries()) {
					const stats = tune.minions[kind]
					const count = stats.count + (kind === tune.waves.reinforcement ? reinforcements[team] : 0)
					const growth = 1 + tune.waves.growth * Math.floor((t * STEP) / tune.waves.growthPeriod)
					for (let file = 0; file < count; file++) {
						const spacing =
							(count === 2 ? file * 2 - 1 : file - (count - 1) / 2) * tune.waves.fileSpacing
						const start = offset(
							{
								x: path[0].x - forward.x * row * tune.waves.rowSpacing,
								z: path[0].z - forward.z * row * tune.waves.rowSpacing,
							},
							team === 'A' ? forward : { x: -forward.x, z: -forward.z },
							spacing,
						)
						const unit = {
							id: `minion-${++serial}`,
							team,
							kind,
							hp: stats.hp * growth,
							maxHp: stats.hp * growth,
							damageScale: growth,
							dead: false,
							body: makeBody(start.x, start.z, team, kind),
							lane: lane.id,
							route: route(lane, team, spacing),
							routeLeg: 1,
							halfWidth: lane.halfWidth,
							file: spacing,
							target: null,
							forced: null,
							aggroUntil: 0,
							attackTick: t,
							attack: null,
							slow: { until: 0, factor: 1 },
						}
						const safe = clampWalkable(
							unit.body.position,
							unit.body.radius,
							tune.orders.clearance,
							obstacles,
							layout.bounds,
						)
						unit.body.position.x = safe.x
						unit.body.position.z = safe.z
						minions.push(unit)
						present({ type: 'spawn', target: unit.id, point: { ...unit.body.position } })
					}
				}
			}
	}
	function help(source, victim, t) {
		if (source?.kind || victim.kind || source?.team === victim.team || !source || source.dead)
			return
		for (const guard of [...structures, ...minions]) {
			const range = guard.structure ? tune[guard.kind].range : tune.waves.aggro
			if (
				guard.dead ||
				guard.team !== victim.team ||
				!inReach(guard, victim, range) ||
				!inReach(guard, source, range)
			)
				continue
			guard.forced = source.id
			guard.aggroUntil = t + ticks(tune.waves.helpHold)
			if (guard.target === source.id) continue
			guard.target = source.id
			guard.aggroOrigin = { x: guard.body.position.x, z: guard.body.position.z }
			guard.returning = false
			guard.returnGoal = null
			guard.path = null
			guard.attack = null
			present({
				type: 'aggro',
				source: guard.id,
				target: source.id,
				point: { ...guard.body.position },
			})
		}
	}
	function addXp(team, amount, point, passive = false, contributions = {}) {
		const state = teams[team]
		state.xp += amount
		present({
			type: 'xp',
			team,
			amount,
			total: state.xp,
			passive,
			contributions,
			point: { ...point },
		})
		let threshold = 0
		for (let level = 1; level < tune.levels.cap; level++) {
			threshold += tune.levels.first + tune.levels.increment * (level - 1)
			if (state.xp < threshold || state.level > level) continue
			state.level = level + 1
			for (const h of heroes.filter((h) => h.team === team)) {
				const previous = h.maxHp
				h.level = state.level
				h.maxHp = (h.definition?.base.hp ?? tune.hero.hp) * (1 + tune.levels.growth * (h.level - 1))
				if (!h.dead) h.hp = Math.min(h.maxHp, h.hp + h.maxHp - previous)
			}
			present({ type: 'levelUp', team, level: state.level, point: { ...point } })
		}
	}
	function reward(unit, killerTeam, t, source) {
		// A last-hit earns siege/takedown credit; minion soak is shared equally
		// by the heroes who earned it. Passive and lane-only kills have no hero credit.
		const killer = heroes.find((hero) => hero.id === source && hero.team === killerTeam)
		const credit = (amount) => (killer ? { [killer.id]: amount } : {})
		unit.killedBy = killerTeam
		if (unit.structure) {
			removeTower(unit)
			if (unit.kind === 'tower') reinforcements[unit.team === 'A' ? 'B' : 'A']++
			const xp = tune[unit.kind].xp ?? tune.waves.structureXp
			addXp(killerTeam, xp, unit.body.position, false, credit(xp))
			present({
				type: 'structureDown',
				target: unit.id,
				team: killerTeam,
				point: { ...unit.body.position },
			})
			if (unit.kind === 'core' && !match.winner) {
				match.winner = killerTeam
				match.endedTick = t
				present({
					type: 'matchOver',
					team: killerTeam,
					target: unit.id,
					point: { ...unit.body.position },
				})
			}
		} else if (!unit.kind) {
			addXp(
				killerTeam,
				tune.levels.takedown + tune.levels.victimLevel * unit.level,
				unit.body.position,
				false,
				credit(tune.levels.takedown + tune.levels.victimLevel * unit.level),
			)
		} else {
			const soaking = heroes.filter(
				(h) =>
					!h.dead &&
					h.team !== unit.team &&
					(unit.team !== 'N' || h.team === killerTeam) &&
					distance(unit, h) <= tune.waves.soak,
			)
			if (soaking.length) {
				const amount = tune.minions[unit.kind].xp
				addXp(
					unit.team === 'N' ? killerTeam : unit.team === 'A' ? 'B' : 'A',
					amount,
					unit.body.position,
					false,
					Object.fromEntries(soaking.map((h) => [h.id, amount / soaking.length])),
				)
			}
		}
		if (unit.kind === 'wizard') {
			const globe = {
				id: ++serial,
				team: killerTeam,
				pos: { x: unit.body.position.x, y: tune.globes.height, z: unit.body.position.z },
				expires: t + ticks(tune.globes.life),
			}
			globes.push(globe)
			present({ type: 'globe', state: 'spawn', team: killerTeam, point: { ...globe.pos } })
		}
	}
	function step(t, dt) {
		time = t
		match.phase =
			t * STEP >= tune.match.late
				? 'late'
				: t * STEP >= tune.match.objective
					? 'objective'
					: 'early'
		if (t >= ticks(tune.levels.passiveStart) && t % ticks(1) === 0) {
			for (const team of ['A', 'B'])
				addXp(
					team,
					tune.levels.passive,
					{
						x: layout.bases[team].x,
						y: 0,
						z: 0,
					},
					true,
				)
		}
		for (const h of heroes) {
			if (!h.dead && (h.team === 'A' ? -1 : 1) * (h.body.position.x - layout.bases[h.team].x) >= 0)
				h.hp = Math.min(h.maxHp, h.hp + h.maxHp * tune.base.heal * dt)
		}
		for (let i = globes.length - 1; i >= 0; i--) {
			const globe = globes[i]
			const hero = heroes.find(
				(h) =>
					!h.dead &&
					t < globe.expires &&
					h.team === globe.team &&
					Math.hypot(h.body.position.x - globe.pos.x, h.body.position.z - globe.pos.z) <=
						tune.globes.pickup,
			)
			if (hero) {
				const heal = Math.min(hero.maxHp - hero.hp, hero.maxHp * tune.globes.heal)
				hero.hp += heal
				present({
					type: 'globe',
					state: 'pickup',
					target: hero.id,
					team: globe.team,
					heal,
					point: { ...globe.pos },
				})
			}
			if (hero || t >= globe.expires) {
				if (!hero)
					present({ type: 'globe', state: 'expired', team: globe.team, point: { ...globe.pos } })
				globes.splice(i, 1)
			}
		}
		if (t >= nextWave) {
			if (wavesEnabled()) spawn(t)
			nextWave += ticks(t * STEP >= tune.match.late ? tune.waves.lateInterval : tune.waves.interval)
		}
		const candidates = [...minions, ...structures, ...heroes]
		const byId = new Map(candidates.map((u) => [u.id, u]))
		const liveTarget = (id) => {
			const unit = byId.get(id)
			return unit?.dead ? null : unit
		}
		for (const unit of [...structures, ...minions]) {
			if (match.winner) break
			if (unit.dead) continue
			const tower = unit.structure
			const stats = tower
				? {
						...tune[unit.kind],
						damage:
							tune[unit.kind].damage * (t * STEP >= tune.match.late ? tune.match.lateGunDamage : 1),
					}
				: { ...tune.minions[unit.kind], damage: tune.minions[unit.kind].damage * unit.damageScale }
			if (tower && !stats.damage) continue // a gate has no gun
			const range = tower ? stats.range : tune.waves.aggro
			let target = t < unit.aggroUntil ? liveTarget(unit.forced) : null
			if (target && !inReach(unit, target, range)) target = null
			const old = liveTarget(unit.target)
			const p = unit.body.position
			if (!tower) {
				const origin = unit.aggroOrigin
				const leashed = origin && Math.hypot(p.x - origin.x, p.z - origin.z) > tune.waves.leash
				if (leashed || (unit.target && !old)) {
					unit.returning = true
					unit.returnGoal = clampWalkable(
						lanePoint(unit, origin ?? p),
						unit.body.radius,
						tune.orders.clearance,
						obstacles,
						layout.bounds,
					)
					unit.path = null
					unit.forced = null
					unit.aggroUntil = 0
					target = null
				}
				if (
					unit.returning &&
					Math.hypot(p.x - unit.returnGoal.x, p.z - unit.returnGoal.z) <= tune.orders.arrival
				) {
					unit.returning = false
					unit.returnGoal = null
					unit.aggroOrigin = null
					unit.path = null
				}
				// A fresh call for help wins over the return leg, but not an exhausted leash.
				if (target) {
					unit.returning = false
					unit.returnGoal = null
				}
			}
			if (!unit.returning && !unit.passive) target ??= nearest(unit, range, candidates)
			if (unit.target !== (target?.id ?? null)) {
				unit.attack = null
				unit.path = null
				if (target && !tower && !old) unit.aggroOrigin = { x: p.x, z: p.z }
			}
			unit.target = target?.id ?? null
			if (!tower && !target && !unit.returning) unit.aggroOrigin = null
			if (tower && t < unit.silentUntil) {
				unit.attack = null
				continue
			}
			if (unit.attack) {
				if (!target || !inReach(unit, target, stats.range)) unit.attack = null
				else if (--unit.attack.left <= 0) {
					unit.attack = null
					unit.attackTick = t + Math.max(1, ticks(1 / stats.rate) - ticks(stats.tell))
					if (tower || (unit.kind !== 'melee' && unit.kind !== 'brute'))
						projectile(unit, target, stats)
					else
						damage(
							unit,
							target,
							stats.damage * (target.structure ? (stats.structureDamage ?? 1) : 1),
						)
				}
				continue
			}
			if (target && inReach(unit, target, stats.range)) {
				if (t >= unit.attackTick) {
					unit.yaw =
						Math.atan2(
							target.body.position.x - unit.body.position.x,
							target.body.position.z - unit.body.position.z,
						) + Math.PI
					unit.body.face(unit.yaw)
					unit.attack = { left: ticks(stats.tell), total: ticks(stats.tell), target: target.id }
					present({
						type: 'cast',
						hero: unit.id,
						slot: unit.kind,
						point: { ...unit.body.position },
						target: { ...target.body.position },
					})
				}
				continue
			}
			if (tower) continue
			if (
				!target &&
				!unit.returning &&
				unit.routeLeg < unit.route.length - 1 &&
				Math.hypot(p.x - unit.route[unit.routeLeg].x, p.z - unit.route[unit.routeLeg].z) <=
					tune.orders.arrival
			) {
				unit.routeLeg++
				unit.path = null
			}
			const goal = target?.body.position ?? unit.returnGoal ?? unit.route[unit.routeLeg]
			if (
				!unit.path ||
				Math.hypot(goal.x - unit.pathGoal.x, goal.z - unit.pathGoal.z) > tune.orders.replanDistance
			) {
				unit.pathGoal = { x: goal.x, z: goal.z }
				const destination = clampWalkable(
					goal,
					unit.body.radius,
					tune.orders.clearance,
					obstacles,
					layout.bounds,
				)
				unit.path = planner(unit.body.radius)(p, destination, pathOptions(unit.body.radius))
				unit.leg = 0
			}
			while (
				unit.leg < unit.path.length - 1 &&
				Math.hypot(unit.path[unit.leg].x - p.x, unit.path[unit.leg].z - p.z) <= tune.orders.arrival
			)
				unit.leg++
			const waypoint = unit.path[unit.leg]
			if (!waypoint) continue
			const dx = waypoint.x - p.x,
				dz = waypoint.z - p.z,
				length = Math.hypot(dx, dz)
			const speed = stats.speed * slowFactor(unit, t)
			const travel = Math.min(length, speed * dt)
			if (length > 0) {
				let next = { x: p.x + (dx / length) * travel, z: p.z + (dz / length) * travel }
				if (unit.kind === 'brute' && unit.halfWidth !== undefined)
					next = lanePoint(unit, next, unit.halfWidth + unit.body.radius)
				next = clampWalkable(next, unit.body.radius, 0, obstacles, layout.bounds)
				// Brutes need the pillar's escape leg; don't undo depenetration.
				if (unit.kind !== 'brute' && unit.halfWidth !== undefined)
					next = lanePoint(unit, next, unit.halfWidth)
				p.x = next.x
				p.z = next.z
				unit.yaw = Math.atan2(dx, dz) + Math.PI
				unit.body.face(unit.yaw)
			}
		}
		for (let i = minions.length - 1; i >= 0; i--)
			if (minions[i].dead) {
				minions[i].body.dispose()
				minions.splice(i, 1)
			}
	}
	return {
		minions,
		structures,
		teams,
		route,
		globes,
		match,
		reinforcements,
		vulnerable,
		addXp,
		find,
		help,
		reward,
		step,
		get time() {
			return time
		},
		get nextWave() {
			return nextWave
		},
	}
}
