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
	let time = 0
	let serial = 0
	let nextWave = ticks(tune.waves.first)
	const minions = []
	const teams = { A: { xp: 0, level: 1 }, B: { xp: 0, level: 1 } }
	const globes = []
	const match = { winner: null, endedTick: null, phase: 'early' }
	const structures = ['tower', 'fort', 'core'].flatMap((kind) =>
		['A', 'B'].map((team) => ({
			id: `${kind}-${team}`,
			team,
			kind,
			structure: true,
			hp: tune[kind].hp,
			maxHp: tune[kind].hp,
			dead: false,
			body: makeBody(team === 'A' ? -tune[kind].x : tune[kind].x, 0, team, kind),
			target: null,
			forced: null,
			aggroUntil: 0,
			silentUntil: 0,
			attackTick: 0,
			attack: null,
		})),
	)
	const vulnerable = (unit) =>
		!unit.structure ||
		unit.kind === 'tower' ||
		structures.find(
			(s) => s.team === unit.team && s.kind === (unit.kind === 'fort' ? 'tower' : 'fort'),
		).dead
	const find = (id) =>
		minions.find((u) => u.id === id && !u.dead) ??
		structures.find((u) => u.id === id && !u.dead) ??
		heroes.find((u) => u.id === id && !u.dead)
	function nearest(unit, range, candidates) {
		let best = null,
			bestRank = Infinity,
			bestDistance = Infinity
		for (const candidate of candidates) {
			if (candidate.dead || candidate.team === unit.team || !vulnerable(candidate)) continue
			const dx = candidate.body.position.x - unit.body.position.x,
				dz = candidate.body.position.z - unit.body.position.z
			const d = dx * dx + dz * dz
			if (d > (range + candidate.body.radius) ** 2) continue
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
					const safe = clampWalkable(
						unit.body.position,
						unit.body.radius,
						tune.orders.clearance,
						obstacles,
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
	function addXp(team, amount, point, passive = false) {
		const state = teams[team]
		state.xp += amount
		present({ type: 'xp', team, amount, total: state.xp, passive, point: { ...point } })
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
	function reward(unit, killerTeam, t) {
		if (unit.structure) {
			removeTower(unit)
			addXp(killerTeam, tune.waves.structureXp, unit.body.position)
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
			)
		} else if (
			heroes.some((h) => !h.dead && h.team !== unit.team && distance(unit, h) <= tune.waves.soak)
		) {
			addXp(unit.team === 'A' ? 'B' : 'A', tune.minions[unit.kind].xp, unit.body.position)
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
						x: team === 'A' ? -tune.base.x : tune.base.x,
						y: 0,
						z: 0,
					},
					true,
				)
		}
		for (const h of heroes) {
			if (!h.dead && (h.team === 'A' ? -h.body.position.x : h.body.position.x) >= tune.base.x)
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
			if (match.winner) break
			if (unit.dead) continue
			const tower = unit.structure
			const stats = tower ? tune[unit.kind] : tune.minions[unit.kind]
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
			if (tower && t < unit.silentUntil) {
				unit.attack = null
				continue
			}
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
		globes,
		match,
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
