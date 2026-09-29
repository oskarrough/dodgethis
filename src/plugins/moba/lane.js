import { STEP } from '../../core/app.js'
import { tune } from './tune.js'
import { clampWalkable } from './obstacles.js'
import { createPathPlanner } from './path.js'

const ticks = (s) => Math.max(1, Math.round(s / STEP))
const distance = (a, b) =>
	Math.hypot(a.body.position.x - b.body.position.x, a.body.position.z - b.body.position.z)
export const inReach = (a, b, range) => {
	const dx = a.body.position.x - b.body.position.x,
		dz = a.body.position.z - b.body.position.z
	return dx * dx + dz * dz <= (range + b.body.radius) ** 2
}

// Plain agents: no character controllers, paths or render-time decisions.
export function createLane({
	heroes,
	present,
	damage,
	projectile,
	makeBody,
	removeTower,
	obstacles,
}) {
	const pathOptions = () => ({ radius: tune.waves.radius, ...tune.orders })
	const plan = createPathPlanner(pathOptions(), obstacles)
	let serial = 0
	let nextWave = ticks(tune.waves.first)
	const minions = []
	const teams = { A: { xp: 0, level: 1 }, B: { xp: 0, level: 1 } }
	const structures = ['A', 'B'].map((team) => ({
		id: `tower-${team}`,
		team,
		kind: 'tower',
		hp: tune.tower.hp,
		maxHp: tune.tower.hp,
		dead: false,
		body: makeBody(team === 'A' ? -tune.tower.x : tune.tower.x, 0, team, 'tower'),
		target: null,
		forced: null,
		aggroUntil: 0,
		attackTick: 0,
		attack: null,
	}))
	const find = (id) =>
		minions.find((u) => u.id === id && !u.dead) ??
		structures.find((u) => u.id === id && !u.dead) ??
		heroes.find((u) => u.id === id && !u.dead)
	function nearest(unit, range, candidates) {
		let best = null,
			bestRank = Infinity,
			bestDistance = Infinity
		for (const candidate of candidates) {
			if (candidate.dead || candidate.team === unit.team) continue
			const dx = candidate.body.position.x - unit.body.position.x,
				dz = candidate.body.position.z - unit.body.position.z
			const d = dx * dx + dz * dz
			if (d > (range + candidate.body.radius) ** 2) continue
			const rank = candidate.kind === 'tower' ? 1 : candidate.kind ? 0 : 2
			if (rank < bestRank || (rank === bestRank && d < bestDistance)) {
				best = candidate
				bestRank = rank
				bestDistance = d
			}
		}
		return best
	}
	function spawn(t) {
		for (const team of ['A', 'B']) {
			const side = team === 'A' ? -1 : 1
			for (const [row, kind] of ['melee', 'ranged', 'wizard'].entries()) {
				const stats = tune.minions[kind]
				for (let file = 0; file < stats.count; file++) {
					const z =
						(stats.count === 2 ? file * 2 - 1 : file - (stats.count - 1) / 2) *
						tune.waves.fileSpacing
					const unit = {
						id: `minion-${++serial}`,
						team,
						kind,
						hp: stats.hp,
						maxHp: stats.hp,
						dead: false,
						body: makeBody(side * (tune.waves.spawnX + row * tune.waves.rowSpacing), z, team, kind),
						file: z,
						target: null,
						forced: null,
						aggroUntil: 0,
						attackTick: t,
						attack: null,
						slowUntil: 0,
					}
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
			const range = guard.kind === 'tower' ? tune.tower.range : tune.waves.aggro
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
	function reward(unit, killerTeam) {
		if (unit.kind === 'tower') {
			removeTower(unit)
			teams[killerTeam].xp += tune.waves.structureXp
			present({
				type: 'xp',
				team: killerTeam,
				amount: tune.waves.structureXp,
				total: teams[killerTeam].xp,
				point: { ...unit.body.position },
			})
			present({
				type: 'structureDown',
				target: unit.id,
				team: killerTeam,
				point: { ...unit.body.position },
			})
		} else if (
			heroes.some((h) => !h.dead && h.team !== unit.team && distance(unit, h) <= tune.waves.soak)
		) {
			const team = unit.team === 'A' ? 'B' : 'A'
			teams[team].xp += tune.minions[unit.kind].xp
			present({
				type: 'xp',
				team,
				amount: tune.minions[unit.kind].xp,
				total: teams[team].xp,
				point: { ...unit.body.position },
			})
		}
	}
	function step(t, dt) {
		if (t >= nextWave) {
			spawn(t)
			nextWave += ticks(tune.waves.interval)
		}
		const candidates = [...minions, ...structures, ...heroes]
		const byId = new Map(candidates.map((u) => [u.id, u]))
		const liveTarget = (id) => {
			const unit = byId.get(id)
			return unit?.dead ? null : unit
		}
		for (const unit of [...structures, ...minions]) {
			if (unit.dead) continue
			const tower = unit.kind === 'tower'
			const stats = tower ? tune.tower : tune.minions[unit.kind]
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
						{ x: origin?.x ?? p.x, z: unit.file },
						unit.body.radius,
						tune.orders.clearance,
						obstacles,
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
			if (!unit.returning) target ??= nearest(unit, range, candidates)
			if (unit.target !== (target?.id ?? null)) {
				unit.attack = null
				unit.path = null
				if (target && !tower && !old) unit.aggroOrigin = { x: p.x, z: p.z }
			}
			unit.target = target?.id ?? null
			if (!tower && !target && !unit.returning) unit.aggroOrigin = null
			if (unit.attack) {
				if (!target || !inReach(unit, target, stats.range)) unit.attack = null
				else if (--unit.attack.left <= 0) {
					unit.attack = null
					unit.attackTick = t + Math.max(1, ticks(1 / stats.rate) - ticks(stats.tell))
					if (tower || unit.kind !== 'melee') projectile(unit, target, stats)
					else damage(unit, target, stats.damage)
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
			const goal = target?.body.position ??
				unit.returnGoal ?? {
					x: unit.team === 'A' ? tune.waves.spawnX : -tune.waves.spawnX,
					z: unit.file,
				}
			if (
				!unit.path ||
				Math.hypot(goal.x - unit.pathGoal.x, goal.z - unit.pathGoal.z) > tune.orders.replanDistance
			) {
				unit.pathGoal = { x: goal.x, z: goal.z }
				const destination = clampWalkable(goal, unit.body.radius, tune.orders.clearance, obstacles)
				unit.path = plan(p, destination, pathOptions())
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
			const speed = stats.speed * (t < unit.slowUntil ? 1 - tune.rain.slow : 1)
			const travel = Math.min(length, speed * dt)
			if (length > 0) {
				const next = clampWalkable(
					{ x: p.x + (dx / length) * travel, z: p.z + (dz / length) * travel },
					unit.body.radius,
					0,
					obstacles,
				)
				p.x = next.x
				p.z = Math.max(-tune.waves.laneZ, Math.min(tune.waves.laneZ, next.z))
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
		find,
		help,
		reward,
		step,
		get nextWave() {
			return nextWave
		},
	}
}
