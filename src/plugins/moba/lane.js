import { STEP } from '../../core/app.js'
import { blocked, moveSpeed } from './statuses.js'
import { stepUnitDisplacement } from './displacement.js'
import { tune } from './tune.js'
import { clampWalkable } from './obstacles.js'
import { createPathPlanner } from './path.js'
import { createStructures, vulnerability } from './lane-structures.js'
import { createWaves, route } from './lane-waves.js'
import { createRewards } from './lane-rewards.js'
import { healInBase } from './base.js'

export { waveInterval } from './lane-waves.js'

const ticks = (s) => Math.max(1, Math.round(s / STEP))
export const inReach = (a, b, range) => {
	const dx = a.body.position.x - b.body.position.x,
		dz = a.body.position.z - b.body.position.z
	return dx * dx + dz * dz <= (range + b.body.radius) ** 2
}
// A lane's normal is authored A→B, so files keep their side on the reverse march.
const direction = (a, b) => {
	const length = Math.hypot(b.x - a.x, b.z - a.z) || 1
	return { x: (b.x - a.x) / length, z: (b.z - a.z) / length }
}

// Plain agents: lane routes and pursuit paths, no character controllers or render-time decisions.
// The lane: waves (lane-waves.js), structures (lane-structures.js), XP and globes (lane-rewards.js),
// and here the step order and the unit brain every minion and gun runs: targeting, calls for help,
// leash, attacks and the march.
export function createLane({
	layout,
	structures: withStructures = true,
	heroes,
	summons = [],
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
	const minions = []
	const teams = { A: { xp: 0, level: 1 }, B: { xp: 0, level: 1 } }
	const globes = []
	const reinforcements = {} // `${team}-${lane}` → extra minions, one per enemy fort taken in that lane
	const match = { winner: null, endedTick: null, phase: 'early' }
	const structures = createStructures({ layout, makeBody, enabled: withStructures })
	const vulnerable = vulnerability(structures)
	const shared = {
		layout,
		heroes,
		present,
		makeBody,
		removeTower,
		obstacles,
		wavesEnabled,
		minions,
		structures,
		teams,
		globes,
		reinforcements,
		match,
		nextSerial: () => ++serial,
	}
	const waves = createWaves(shared)
	const { addXp, reward, passiveXp, stepGlobes } = createRewards(shared)
	shared.addXp = addXp
	function step(t, dt) {
		time = t
		match.phase =
			t * STEP >= (layout.late ?? tune.match.late)
				? 'late'
				: t * STEP >= tune.match.objective
					? 'objective'
					: 'early'
		passiveXp(t)
		healInBase(layout, heroes, dt)
		stepGlobes(t)
		waves.step(t)
		units(t, dt)
		for (let i = minions.length - 1; i >= 0; i--)
			if (minions[i].dead) {
				minions[i].body.dispose()
				minions.splice(i, 1)
			}
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
		heroes.find((u) => u.id === id && !u.dead) ??
		summons.find((u) => u.id === id && !u.dead && u.hp != null)
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
	function units(t, dt) {
		const candidates = [
			...minions,
			...summons.filter((u) => u.hp != null),
			...structures,
			...heroes,
		]
		const enemies = new Map()
		const byId = new Map(candidates.map((u) => [u.id, u]))
		const liveTarget = (id) => {
			const unit = byId.get(id)
			return unit?.dead ? null : unit
		}
		for (const unit of [...structures, ...minions]) {
			if (match.winner) break
			if (unit.dead) continue
			if (stepUnitDisplacement(unit, t, dt)) continue
			const tower = unit.structure
			if (!tower && blocked(unit, 'move', t) && blocked(unit, 'cast', t)) {
				unit.attack = null
				continue
			}
			const stats = tower
				? {
						...tune[unit.kind],
						damage:
							tune[unit.kind].damage *
							(t * STEP >= (layout.late ?? tune.match.late) ? tune.match.lateGunDamage : 1),
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
			if (!unit.returning && !unit.passive && !target) {
				if (!enemies.has(unit.team))
					enemies.set(
						unit.team,
						candidates.filter((u) => u.team !== unit.team && u.team !== 'N'),
					)
				target = nearest(unit, range, enemies.get(unit.team))
			}
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
			const speed = stats.speed * moveSpeed(unit, t)
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
	}
	return {
		minions,
		structures,
		teams,
		route: (lane, team, file) => route(structures, lane, team, file),
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
			return waves.nextWave
		},
	}
}
