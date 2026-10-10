import { tune } from './tune.js'
import { abilityOf } from './ability.js'
import { STEP } from '../../core/app.js'
import { clampMap, sweepHit, sweepObstacles } from './obstacles.js'
import { interceptShot, stepShot } from './skillshot.js'
import { SLOTS, ticks, yawOf, dirOf } from './sim-kit.js'

// Everything in flight or standing in the way of it: shots, delayed zones, boards and cutouts, and the catch windows that intercept them.
export function createProjectiles(ctx) {
	const {
		heroes,
		dummies,
		lane,
		ball,
		obstacles,
		field,
		footprint,
		intercept,
		present,
		trace,
		touch,
		enemiesOf,
	} = ctx
	const hit = (...args) => ctx.hit(...args)
	const traitContext = (...args) => ctx.traitContext(...args)
	const shots = []
	const zones = []
	const boards = []
	const cutouts = []

	function expireBoards() {
		for (let i = boards.length - 1; i >= 0; i--)
			if (boards[i].until <= ctx.t) {
				const board = boards.splice(i, 1)[0]
				present({
					type: 'boardExpired',
					hero: board.owner,
					board: board.id,
					point: { x: board.x, y: 0, z: board.z },
				})
			}
	}

	function stepZones() {
		for (let i = zones.length - 1; i >= 0; i--) {
			const zone = zones[i]
			if (--zone.left > 0) continue
			const skill = abilityOf(zone.ability ?? 'rain').stats
			touch(zone, { kind: 'zone', point: { x: zone.x, z: zone.z }, radius: skill.radius })
			const targets = enemiesOf(zone.team).filter(
				(e) => Math.hypot(e.x - zone.x, e.z - zone.z) <= skill.radius + e.radius,
			)
			present({
				type: 'impact',
				hero: zone.owner,
				ability: zone.ability ?? 'rain',
				hit: targets.length > 0,
				point: { x: zone.x, y: 0.05, z: zone.z },
			})
			for (const e of targets) {
				if (skill.slow)
					e.unit.slow = { until: ctx.t + ticks(skill.duration), factor: 1 - skill.slow }
				hit(
					{
						owner: zone.owner,
						team: zone.team,
						id: zone.id,
						slot: zone.slot ?? 'slot3',
						ability: zone.ability,
						dx: 0,
						dz: 0,
						from: { x: zone.x, z: zone.z },
					},
					e,
					{
						x: e.x,
						z: e.z,
					},
				)
			}
			zones.splice(i, 1)
		}
	}

	function stepShots(dt) {
		const shotTargets = new Map(['A', 'B'].map((team) => [team, enemiesOf(team)]))
		const shotTargetById = new Map([...shotTargets.values()].flat().map((unit) => [unit.id, unit]))
		for (let i = shots.length - 1; i >= 0; i--) {
			if (lane?.match.winner) break
			const shot = shots[i]
			const from = footprint ? { x: shot.x, z: shot.z } : null
			let targets
			if (shot.target) {
				const candidate = shotTargetById.get(shot.target)
				targets =
					candidate && !candidate.unit.dead && candidate.team !== shot.team ? [candidate] : []
				if (!targets.length) {
					present({
						type: 'expired',
						source: shot.owner,
						projectile: shot.id,
						reason: 'targetLost',
						point: { x: shot.x, y: tune.projectile.height, z: shot.z },
						direction: { x: shot.dx, y: 0, z: shot.dz },
					})
					shots.splice(i, 1)
					continue
				}
				const target = targets[0]
				const length = Math.hypot(target.x - shot.x, target.z - shot.z) || 1
				shot.dx = (target.x - shot.x) / length
				shot.dz = (target.z - shot.z) / length
			} else
				targets = (shotTargets.get(shot.team) ?? []).filter(
					(unit) => !unit.unit.dead && (!shot.heroOnly || unit.hero),
				)
			if (
				interceptShot(shot, dt, resolveInterception, {
					kind: 'projectile',
					tick: ctx.t,
					ball,
					obstacles,
					bounds: field,
					targets,
				})
			) {
				if (from)
					touch(shot, { kind: 'shot', from, to: { x: shot.x, z: shot.z }, radius: shot.radius })
				present({
					type: 'expired',
					source: shot.owner,
					projectile: shot.id,
					reason: 'intercepted',
					point: { x: shot.x, y: tune.projectile.height, z: shot.z },
					direction: { x: shot.dx, y: 0, z: shot.dz },
				})
				shots.splice(i, 1)
				continue
			}
			const r = stepShot(
				shot,
				dt,
				targets,
				shot.target ? -Infinity : tune.projectile.nearMiss,
				obstacles,
				field,
			)
			if (from)
				touch(shot, { kind: 'shot', from, to: { x: shot.x, z: shot.z }, radius: shot.radius })
			for (const n of r.nearMisses)
				present({
					type: 'nearMiss',
					source: shot.owner,
					target: n.target.id,
					projectile: shot.id,
					point: { x: n.point.x, y: tune.projectile.height, z: n.point.z },
					distance: n.distance,
				})
			if (r.blocked)
				present({
					type: 'blocked',
					reason: 'obstacle',
					ability: shot.ability,
					source: shot.owner,
					projectile: shot.id,
					slot: shot.slot,
					point: { ...r.point, y: tune.projectile.height },
					direction: { x: shot.dx, y: 0, z: shot.dz },
				})
			for (const entry of r.hits ?? []) hit(shot, entry.hit, entry.point)
			if (r.hit) hit(shot, r.hit, r.point)
			if (r.expired && !r.hit && !r.blocked)
				present({
					type: 'expired',
					source: shot.owner,
					projectile: shot.id,
					reason: 'range',
					point: { x: shot.x, y: tune.projectile.height, z: shot.z },
					direction: { x: shot.dx, y: 0, z: shot.dz },
				})
			if (r.hit || r.expired) shots.splice(i, 1)
		}
	}

	function towerShot(source, target, stats) {
		const p = source.body.position,
			tp = target.body.position
		const length = Math.hypot(tp.x - p.x, tp.z - p.z) || 1
		const shot = {
			id: ++ctx.shotIds,
			owner: source.id,
			team: source.team,
			slot: source.kind,
			target: target.id,
			x: p.x,
			z: p.z,
			dx: (tp.x - p.x) / length,
			dz: (tp.z - p.z) / length,
			speed: source.structure ? stats.speed : stats.shotSpeed,
			radius: tune.attack.radius,
			range: field.halfX * 4,
			travelled: 0,
			passed: [],
			damage: stats.damage,
		}
		shots.push(shot)
		present({
			type: 'projectile',
			id: shot.id,
			hero: source.id,
			slot: source.kind,
			point: { x: p.x, y: tune.projectile.height, z: p.z },
			direction: { x: shot.dx, z: shot.dz },
		})
	}

	function openCatch(id, window) {
		const hero = typeof id === 'string' ? heroes.find((h) => h.id === id) : id
		if (!hero || hero.dead) return false
		if (
			!Number.isFinite(window.duration) ||
			!Number.isFinite(window.radius) ||
			!['angle', 'limit', 'pocketLife', 'resetCooldown'].every(
				(key) => window[key] === undefined || Number.isFinite(window[key]),
			) ||
			window.duration < STEP ||
			window.radius < 0
		)
			throw new Error('Catch windows need a finite duration >= one step and nonnegative radius')
		const direction = window.dir ?? dirOf(hero.yaw)
		const length = Math.hypot(direction.x, direction.z)
		if (!Number.isFinite(length) || length === 0)
			throw new Error('Catch windows need a finite direction')
		hero.catchWindow = {
			...window,
			dir: { x: direction.x / length, z: direction.z / length },
			until: ctx.t + ticks(window.duration),
			radius: Math.max(0, window.radius),
			angle: Math.max(0, Math.min(360, window.angle ?? 360)),
			limit: Math.max(1, Math.floor(window.limit ?? tune.catching.bagLimit)),
		}
		return true
	}

	function launchShot(hero, dir, stats, origin = hero.body.position) {
		const p = origin
		const length = Math.hypot(dir.x, dir.z)
		if (
			!Number.isFinite(p.x) ||
			!Number.isFinite(p.z) ||
			!Number.isFinite(length) ||
			length === 0 ||
			!['damage', 'speed', 'radius', 'range'].every((key) => Number.isFinite(stats[key])) ||
			stats.damage < 0 ||
			stats.speed <= 0 ||
			stats.radius < 0 ||
			stats.range <= 0
		)
			throw new Error('Shots need a direction and finite nonnegative stats (positive speed/range)')
		const shot = {
			...structuredClone(stats),
			id: ++ctx.shotIds,
			owner: hero.id,
			team: hero.team,
			x: p.x,
			z: p.z,
			dx: dir.x / length,
			dz: dir.z / length,
			travelled: 0,
			passed: [hero.id],
		}
		shots.push(shot)
		if (stats.aim) trace(hero, shot, stats.aim, stats.ability)
		present({
			type: 'projectile',
			id: shot.id,
			hero: hero.id,
			ability: shot.ability,
			slot: shot.slot,
			point: { x: p.x, y: tune.projectile.height, z: p.z },
			direction: { x: shot.dx, z: shot.dz },
		})
		return shot
	}

	function throwCaught(id, direction, slot = 'slot1', aim = null) {
		const hero = typeof id === 'string' ? heroes.find((h) => h.id === id) : id
		const slotIndex = SLOTS.indexOf(slot)
		if (
			!hero ||
			hero.dead ||
			!hero.abilityState.pocket ||
			ctx.t < (hero.cancelUntil[slotIndex] ?? 0) ||
			hero.cast ||
			hero.channel ||
			hero.body.dashing ||
			ctx.t < Math.max(hero.stunUntil, hero.freezeUntil, hero.proneUntil)
		)
			return false
		const length = Math.hypot(direction.x, direction.z)
		if (!length) return false
		const dir = { x: direction.x / length, z: direction.z / length }
		const pocket = hero.abilityState.pocket
		const shot = pocket.shot
		hero.abilityState.pocket = null
		hero.attack = null
		const total = ticks(tune.catching.returnTell)
		hero.cast = {
			ability: 'return',
			slot,
			cooldownBefore: hero.cd[slotIndex] ?? 0,
			startedTick: ctx.t,
			shot,
			pocket,
			dir,
			target: clampMap(
				{
					x: hero.body.position.x + dir.x * shot.range,
					z: hero.body.position.z + dir.z * shot.range,
				},
				0,
				field,
			),
			yaw: yawOf(dir.x, dir.z),
			left: total,
			total,
		}
		trace(hero, hero.cast, aim ?? hero.cast.target, 'return')
		present({
			type: 'cast',
			hero: hero.id,
			ability: 'return',
			slot,
			point: { ...hero.body.position },
			direction: dir,
			target: { ...hero.cast.target },
		})
		return true
	}

	// Windows and walls share the ordinary shot's clipped collision segment.
	// Earliest contact wins, with ids breaking exact ties.
	function resolveInterception(context) {
		const { shot, from, to } = context
		const contacts = []
		for (const board of boards) {
			const normal = board.normal
			const local = (p) => ({
				x: (p.x - board.x) * normal.z - (p.z - board.z) * normal.x,
				z: (p.x - board.x) * normal.x + (p.z - board.z) * normal.z,
			})
			const at = sweepObstacles(local(from), local(to), shot.radius, [
				{ x: 0, z: 0, halfX: board.width / 2, halfZ: board.thickness / 2 },
			])
			if (at !== null) contacts.push({ at, id: board.id, board })
		}
		for (const hero of heroes) {
			const window = hero.catchWindow
			if (
				hero.dead ||
				shot.passed?.includes(hero.id) ||
				ctx.t < hero.stunUntil ||
				ctx.t < hero.freezeUntil ||
				hero.team === shot.team ||
				!window ||
				window.until <= ctx.t ||
				(window.mode === 'bag' && hero.abilityState.bag.length >= window.limit) ||
				(context.kind === 'ball'
					? !window.acceptBall
					: !context.catchable || ![...heroes, ...dummies].some((owner) => owner.id === shot.owner))
			)
				continue
			const p = hero.body.position
			const at = sweepHit(from.x, from.z, to.x, to.z, p.x, p.z, window.radius + shot.radius)
			if (at === null) continue
			const x = from.x + (to.x - from.x) * at - p.x,
				z = from.z + (to.z - from.z) * at - p.z
			const dir = window.dir,
				length = Math.hypot(x, z)
			if (
				window.angle < 360 &&
				(x * dir.x + z * dir.z) / (length || 1) < Math.cos((window.angle * Math.PI) / 360)
			)
				continue
			contacts.push({ at, id: hero.id, hero, window })
		}
		contacts.sort((a, b) => a.at - b.at || String(a.id).localeCompare(String(b.id)))
		const contact = contacts[0]
		if (!contact) return intercept?.({ ...context, heroes, boards, cutouts, launchShot }) === true
		// Bodies, gloves and boards use the same clipped segment. A glove behind
		// another body cannot erase its hit, even when both contacts fit one tick.
		const targets =
			context.targets ??
			enemiesOf(shot.team).filter(
				(unit) =>
					!unit.unit.dead &&
					(context.kind === 'ball'
						? unit.hero || unit.unit.structure
						: !shot.heroOnly || unit.hero),
			)
		const earlier = targets
			.filter((unit) => !shot.passed?.includes(unit.id))
			.map((target) => ({
				target,
				at: sweepHit(from.x, from.z, to.x, to.z, target.x, target.z, target.radius + shot.radius),
			}))
			.filter(
				(entry) =>
					entry.at !== null &&
					(entry.at < contact.at ||
						(entry.at === contact.at &&
							String(entry.target.id).localeCompare(String(contact.id)) < 0)),
			)
			.sort((a, b) => a.at - b.at || String(a.target.id).localeCompare(String(b.target.id)))
		if (earlier.length && !shot.pierce) return false
		for (const entry of earlier) {
			shot.passed.push(entry.target.id)
			hit(shot, entry.target, {
				x: from.x + (to.x - from.x) * entry.at,
				z: from.z + (to.z - from.z) * entry.at,
			})
		}
		const point = {
			x: from.x + (to.x - from.x) * contact.at,
			z: from.z + (to.z - from.z) * contact.at,
		}
		shot.x = point.x
		shot.z = point.z
		if (contact.board) {
			if (context.kind === 'ball') context.ball.drop('board', point)
			else
				present({
					type: 'blocked',
					reason: 'board',
					source: shot.owner,
					projectile: shot.id,
					ability: shot.ability,
					slot: shot.slot,
					point: { ...point, y: tune.projectile.height },
					direction: { x: shot.dx, z: shot.dz },
				})
			return true
		}
		const { hero, window } = contact
		if (context.kind === 'ball') {
			hero.abilityState.pocket = null
			context.ball.give(hero, 'catch')
		} else {
			const frozen = {
				damage: shot.damage,
				speed: shot.speed,
				radius: shot.radius,
				range: shot.range,
				pierce: !!shot.pierce,
			}
			if (window.mode === 'bag') {
				if (hero.abilityState.bag.length < window.limit) hero.abilityState.bag.push(frozen)
			} else
				hero.abilityState.pocket = {
					shot: frozen,
					until: ctx.t + ticks(window.pocketLife ?? tune.catching.pocketLife),
				}
		}
		hero.definition.traits.onCatch?.(traitContext(hero, { source: shot, window }))
		if (window.resetSlot) hero.cd[SLOTS.indexOf(window.resetSlot)] = ticks(window.resetCooldown)
		if (window.mode !== 'bag') hero.catchWindow = null
		present({
			type: 'caught',
			hero: hero.id,
			source: shot.owner,
			projectile: shot.id,
			ability: shot.ability,
			point: { ...point, y: tune.projectile.height },
		})
		return true
	}

	return {
		shots,
		zones,
		boards,
		cutouts,
		expireBoards,
		stepZones,
		stepShots,
		towerShot,
		openCatch,
		launchShot,
		throwCaught,
		resolveInterception,
	}
}
