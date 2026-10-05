import { HEROES, heroDefinition, freshAbilityState } from './heroes.js'
import { abilityOf, castAbility, slowFactor } from './ability.js'
import { sweepHit, sweepObstacles } from './obstacles.js'
import { dressHero } from './hero-view.js'
import { createBall } from './ball.js'
import { createBots } from './bots.js'
import { createScriptedHero } from './scripted.js'
import { createLane } from './lane.js'
import { createLaneView } from './lane-view.js'
import { createBody } from '../../core/body.js'
import { PALETTE } from '../../core/style.js'
import { STEP } from '../../core/app.js'
import { SCHEMES } from '../../core/intents.js'
import { tune, profile } from './tune.js'
import { OBSTACLES, SPAWN, FLOOR, clampWalkable, clampMap, segmentClear } from './obstacles.js'
import { createPathPlanner, pursue } from './path.js'
import { interceptShot, stepShot } from './skillshot.js'

const SLOTS = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5']
const ticks = (seconds) => Math.max(0, Math.round(seconds / STEP))
const q = (v) => Math.round(v * 1000) / 1000 || 0
const TAU = Math.PI * 2
// Yaw ↔ ground direction, matching body.face: yaw = atan2(x, z) + π.
const yawOf = (x, z) => Math.atan2(x, z) + Math.PI
const dirOf = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) })
const DUMMY_POSTS = tune.map.dummyPosts

// Heroes read intents; optional lane agents share damage, shots and targeting. No DOM.
// Training fixtures retain the dummies; the browser opts into `lane: true`.
// `heroes` is [{ id, team }], each id a participant in `intents`. `present(fact)` receives plain facts. `rng()` drives the dummies.
export function createSim({
	scene,
	world,
	RAPIER,
	intents,
	heroes: seats,
	smooth = null,
	present: emit = () => {},
	rng = Math.random,
	lane: withLane = false,
	spawns = null, // { participantId: { x, z } }; copied for death/recovery.
	bounds = null, // { halfX, halfZ }; body centres stay one radius inside.
	respawn: respawnSeconds = null, // Hero recovery override, in seconds; dummies keep their timer.
	lobby = false, // Combat allegiance A for heroes, B for dummies; seatTeam retains the pick.
	scripted = [],
	bots = [],
	seed = tune.bots.seed,
	driveBots = true, // Replay retains controller identity (and its tells), but supplies recorded frames.
	intercept = null,
	footprint = null, // Lobby observer: aimed props and real, clipped cast footprints.
}) {
	const laneView = withLane ? createLaneView(scene, smooth) : null
	const towerObstacles = withLane
		? ['tower', 'fort', 'core'].flatMap((kind) =>
				['A', 'B'].map((team) => ({
					id: `${kind}-${team}`,
					kind,
					x: team === 'A' ? -tune[kind].x : tune[kind].x,
					z: 0,
					r: tune[kind].radius,
				})),
			)
		: []
	const obstacles = [...OBSTACLES, ...towerObstacles]
	const towerColliders = new Map(
		towerObstacles.map((o) => [
			o.id,
			world.createCollider(
				RAPIER.ColliderDesc.cylinder(tune.laneView[`${o.kind}Height`] / 2, o.r).setTranslation(
					o.x,
					tune.laneView[`${o.kind}Height`] / 2,
					0,
				),
			),
		]),
	)
	// Planner-only walls keep paths inside the optional plaza without changing shot collisions.
	const pathObstacles = bounds
		? [
				...obstacles,
				...['x', 'z'].flatMap((axis) => {
					const other = axis === 'x' ? 'z' : 'x'
					const half = bounds[axis === 'x' ? 'halfX' : 'halfZ']
					const edge = FLOOR[axis === 'x' ? 'halfX' : 'halfZ']
					return [-1, 1].map((side) => ({
						[axis]: (side * (half + edge)) / 2,
						[other]: 0,
						[axis === 'x' ? 'halfX' : 'halfZ']: (edge - half) / 2,
						[other === 'x' ? 'halfX' : 'halfZ']: FLOOR[other === 'x' ? 'halfX' : 'halfZ'],
					}))
				}),
			]
		: obstacles
	const clampBounds = (point, margin = 0) =>
		bounds
			? clampMap(
					{
						x: Math.max(-bounds.halfX + margin, Math.min(bounds.halfX - margin, point.x)),
						z: Math.max(-bounds.halfZ + margin, Math.min(bounds.halfZ - margin, point.z)),
					},
					margin,
				)
			: clampMap(point, margin)
	const walkGoal = (point, radius = profile.radius) =>
		clampWalkable(
			clampBounds(point, radius + tune.orders.clearance + tune.collision.separation),
			radius,
			tune.orders.clearance,
			pathObstacles,
		)
	let planPath = createPathPlanner({ radius: profile.radius, ...tune.orders }, pathObstacles)
	let t = 0
	const present = (fact) => emit({ ...fact, tick: t })
	const footprints = new WeakMap()
	let castIds = 0
	function trace(h, action, aim, ability) {
		if (footprint && aim)
			footprints.set(action, { cast: ++castIds, hero: h.id, aim: { ...aim }, ability, started: t })
	}
	function touch(action, shape) {
		const cast = footprints.get(action)
		if (!cast || cast.picked) return
		cast.picked = footprint({ ...cast, ...shape, phase: 'touch', tick: t, step: STEP }) === true
	}
	let shotIds = 0
	const shots = []
	const zones = []
	const boards = []
	const cutouts = []
	const bodyAt = (x, z, team, definition = heroDefinition()) => {
		const body = createBody(scene, world, RAPIER, {
			profile: definition.base,
			position: [x, 0, z],
			color: team === 'A' ? PALETTE.teamA : PALETTE.teamB,
			bounds: (radius) => ({
				x: (bounds?.halfX ?? FLOOR.halfX) - radius,
				z: (bounds?.halfZ ?? FLOOR.halfZ) - radius,
			}),
			smooth,
		})
		if (bounds) {
			// Clamp the pending physics step, not the synced/rendered pose: interpolation stays intact.
			const update = body.update
			body.update = (...args) => {
				update(...args)
				if (body.retired) return
				const next = body.rigidBody.nextTranslation()
				const point = clampBounds(next, body.radius)
				body.rigidBody.setNextKinematicTranslation({ ...point, y: next.y })
			}
		}
		const undress = dressHero(body, definition.id, team)
		const retire = body.retire
		body.retire = () => {
			for (const part of body.mesh.children) if (part !== body.visual) part.visible = false
			retire()
		}
		const dispose = body.dispose
		body.dispose = () => {
			undress()
			dispose()
		}
		return body
	}

	const training = {
		local: null,
		noCooldowns: false,
		godMode: false,
		waves: true,
		botsEnabled: true,
	}
	let trainingSerial = 0
	function makeHero({ id, team: seatTeam, heroId = 'fletcher' }, spawn) {
		const team = lobby ? 'A' : seatTeam
		const definition = heroDefinition(heroId)
		const body = bodyAt(spawn.x, spawn.z, team, definition)
		return {
			id,
			team,
			...(lobby && { seatTeam }),
			heroId,
			definition,
			abilityState: freshAbilityState(),
			body,
			yaw: 0,
			spawn,
			hp: definition.base.hp,
			maxHp: definition.base.hp,
			level: definition.base.level,
			dead: false,
			corpse: null,
			respawnTick: null,
			attack: null,
			attackTick: 0,
			order: null,
			cast: null,
			slow: { until: 0, factor: 1 },
			freezeUntil: 0,
			proneUntil: 0,
			stance: null,
			channel: null,
			catchWindow: null,
			stunUntil: 0,
			ballThrow: null,
			cd: SLOTS.map(() => 0),
			cancelUntil: SLOTS.map(() => 0),
			judged: new WeakSet(), // slot edges already checked against the cooldown
			lastOrder: -Infinity,
			stall: 0,
			lastRemaining: null,
		}
	}
	const heroes = seats.map((seat, i) => {
		const teamSeats = seats.filter((s) => s.team === seat.team)
		const index = seats.slice(0, i).filter((s) => s.team === seat.team).length
		return makeHero(seat, {
			...(spawns?.[seat.id] ?? {
				x: seat.team === 'A' ? SPAWN.x : -SPAWN.x,
				z: SPAWN.z + (index - (teamSeats.length - 1) / 2) * tune.map.spawnSpacing,
			}),
		})
	})
	for (const h of heroes) h.body.face(dirOf(h.yaw))
	const dummies = (withLane ? [] : DUMMY_POSTS).map((post, i) => ({
		id: `dummy${i + 1}`,
		team: 'B',
		post,
		body: bodyAt(post.x, post.z, 'B'),
		yaw: 0,
		dir: i % 2 ? -1 : 1,
		flipIn: tune.dummies.flipMax,
		hp: tune.dummies.hp,
		maxHp: tune.dummies.hp,
		cast: null,
		castTick: ticks(tune.dummies.castEvery),
		sparring: i === 0,
		dead: false,
		corpse: null,
		respawnTick: null,
		slow: { until: 0, factor: 1 },
	}))

	const lane = withLane
		? createLane({
				heroes,
				wavesEnabled: () => training.waves,
				present,
				makeBody: laneView.makeBody,
				obstacles,
				removeTower(unit) {
					const obstacle = towerObstacles.find((o) => o.id === unit.id)
					const index = obstacles.indexOf(obstacle)
					if (index >= 0) obstacles.splice(index, 1)
					const collider = towerColliders.get(unit.id)
					if (collider) world.removeCollider(collider, true)
					towerColliders.delete(unit.id)
					planPath = createPathPlanner({ radius: profile.radius, ...tune.orders }, pathObstacles)
				},
				damage(source, target, damage) {
					hit(
						{
							owner: source.id,
							team: source.team,
							slot: source.kind,
							damage,
							dx: 0,
							dz: 0,
							id: ++shotIds,
						},
						{ id: target.id, unit: target, hero: !target.kind },
						target.body.position,
					)
				},
				projectile(source, target, stats) {
					const p = source.body.position,
						tp = target.body.position
					const length = Math.hypot(tp.x - p.x, tp.z - p.z) || 1
					const shot = {
						id: ++shotIds,
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
						range: FLOOR.halfX * 4,
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
						point: { x: p.x, y: tune.loose.height, z: p.z },
						direction: { x: shot.dx, z: shot.dz },
					})
				},
			})
		: null

	const ball = lane
		? createBall({
				heroes,
				lane,
				obstacles,
				present,
				damage(shot, unit, damage) {
					hit(
						{ ...shot, id: -1, owner: shot.owner, slot: 'ball', damage },
						{ id: unit.id, unit, hero: !unit.kind },
						unit.body.position,
					)
				},
			})
		: null

	// Everyone who can be shot, targeted or picked, as plain circles.
	const units = () => [
		...heroes.filter((h) => !h.dead).map((h) => ({ id: h.id, team: h.team, unit: h, hero: true })),
		...dummies.filter((d) => !d.dead).map((d) => ({ id: d.id, team: d.team, unit: d, hero: true })),
		...(lane
			? [...lane.minions, ...lane.structures]
					.filter((u) => !u.dead)
					.map((u) => ({ id: u.id, team: u.team, unit: u, hero: false }))
			: []),
	]
	const enemiesOf = (team) =>
		units()
			.filter((u) => u.team !== team)
			.map((u) => ({
				...u,
				x: u.unit.body.position.x,
				z: u.unit.body.position.z,
				radius: u.unit.body.radius,
			}))
	const find = (id) =>
		heroes.find((h) => h.id === id && !h.dead) ??
		dummies.find((d) => d.id === id && !d.dead) ??
		lane?.find(id)

	// The enemy an order point lands on: the unit's silhouette on the ground, its axis projected along the view, so a click on a torso counts.
	function pick(team, p) {
		const lean = tune.follow.back / tune.follow.height
		const tall = 2 * (profile.halfHeight + profile.radius)
		let best = null
		let bestD = Infinity
		for (const e of enemiesOf(team)) {
			if (lane && !lane.vulnerable(e.unit)) continue
			const sz = e.z - tall * lean
			const s = Math.max(0, Math.min(1, (e.z - p.z) / (e.z - sz || 1)))
			const d = Math.hypot(p.x - e.x, p.z - (e.z + (sz - e.z) * s)) - e.radius
			if (
				d <= tune.orders.pick &&
				(!best || (e.hero && !best.hero) || (e.hero === best.hero && d < bestD))
			) {
				best = e
				bestD = d
			}
		}
		return best
	}

	function plan(h, goal) {
		const p = h.body.position
		h.stall = 0
		h.lastRemaining = null
		return {
			points: [{ x: p.x, z: p.z }, ...planPath(p, goal, { radius: h.body.radius, ...tune.orders })],
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
		const target = ball?.carrying(h) || point.kind ? null : pick(h.team, point)
		const repeat = t - h.lastOrder <= ticks(0.15)
		h.lastOrder = t
		if (target) {
			if (
				h.order?.kind !== 'attack' ||
				h.order.target !== target.id ||
				h.order.resume ||
				offPath(h)
			)
				h.order = { kind: 'attack', target: target.id, goal: null, path: null }
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
			t < h.stunUntil ||
			t < h.freezeUntil ||
			t < h.proneUntil
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
					)
				) {
					o.path = null
					if (
						t >=
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

	// Latest slot press wins; it fires on the first legal tick inside the core's buffer, and a press that cannot become legal in time is denied at once.
	function casts(h, frame) {
		const edges = frame.pressed.filter((e) => SLOTS.includes(e.action))
		if (!edges.length) return
		for (const e of edges.slice(0, -1)) intents.consume(h.id, e.action)
		const latest = edges.at(-1)
		const slot = latest.action
		const ability = h.definition.abilities[slot]
		if (!ability) {
			intents.consume(h.id, slot)
			present({ type: 'denied', hero: h.id, slot, reason: 'no-ability' })
			return
		}
		const returning = ability.returnsPocket && h.abilityState.pocket
		const i = SLOTS.indexOf(slot)
		if (!h.judged.has(latest)) {
			h.judged.add(latest)
			const wait = Math.max(
				returning ? 0 : h.cd[i],
				h.cancelUntil[i] - t,
				h.cast?.left ?? 0,
				h.attack?.phase === 'windup' ? h.attack.left - 1 : 0,
				ticks(h.body.dashTime),
			)
			if (wait * STEP >= SCHEMES.pointClick.windows[slot] - 1e-9) {
				intents.consume(h.id, slot)
				present({
					type: 'denied',
					hero: h.id,
					slot,
					reason:
						h.cd[i] > 0 || h.cancelUntil[i] > t
							? 'cooldown'
							: h.cast
								? 'casting'
								: h.attack?.phase === 'windup'
									? 'windup'
									: 'dashing',
				})
				return
			}
		}
		if (h.attack?.phase === 'windup' && h.attack.left <= 1) basicAttack(h)
		if (
			h.cast ||
			h.attack?.phase === 'windup' ||
			h.body.dashing ||
			h.cancelUntil[i] > t ||
			(!returning && h.cd[i] > 0)
		)
			return
		h.attack = null // abilities cut the backswing, not the windup
		intents.consume(h.id, slot)
		const p = h.body.position
		const at = latest.at
		const dx = at ? at.x - p.x : dirOf(h.yaw).x
		const dz = at ? at.z - p.z : dirOf(h.yaw).z
		const len = Math.hypot(dx, dz)
		const dir = len > 1e-4 ? { x: dx / len, z: dz / len } : dirOf(h.yaw)
		if (returning) {
			throwCaught(h, dir, slot, at)
			return
		}
		const skill = ability.stats
		cancelChannel(h, 'cast')
		const reach = Math.min(len, skill.range ?? 0)
		const target = clampMap({ x: p.x + dir.x * reach, z: p.z + dir.z * reach })
		h.cast = {
			ability: ability.id,
			slot,
			cooldownBefore: h.cd[i],
			startedTick: t,
			dir,
			target,
			yaw: yawOf(dir.x, dir.z),
			left: ticks(
				(scripted.includes(h.id) || botIds.has(h.id)) && ability.kind === 'shot'
					? Math.max(skill.castPoint, tune.scripted.tell)
					: skill.castPoint,
			),
			total: ticks(
				(scripted.includes(h.id) || botIds.has(h.id)) && ability.kind === 'shot'
					? Math.max(skill.castPoint, tune.scripted.tell)
					: skill.castPoint,
			),
		}
		trace(h, h.cast, at ?? target, ability.id)
		h.yaw = h.cast.yaw
		h.cd[i] = ticks(skill.cooldown)
		present({
			type: 'cast',
			hero: h.id,
			ability: ability.id,
			slot,
			point: { x: p.x, y: p.y, z: p.z },
			direction: { ...dir },
			target: { ...target },
		})
	}

	function release(h) {
		const castFootprint = footprints.get(h.cast)
		const { slot, dir, target, shot: frozen } = h.cast
		const ability = castAbility(h) ?? heroDefinition().abilities[slot]
		const skill = ability.stats
		h.cast = null
		h.lastRemaining = null
		if (frozen) {
			const shot = launchShot(h, dir, {
				...frozen,
				ability: 'return',
				slot,
				bounce: false,
				traitProcs: false,
				catchable: true,
				isAbility: true,
			})
			if (castFootprint) footprints.set(shot, castFootprint)
			return
		}
		const context = traitContext(h, { ability, dir, target, slot })
		if (ability.kind === 'stance') {
			h.stance = {
				ability: ability.id,
				until: t + ticks(skill.duration),
				dir: { ...dir },
				factor: skill.speedFactor ?? 1,
			}
			ability.onStart?.(context)
			if (castFootprint && h.catchWindow) footprints.set(h.catchWindow, castFootprint)
			return
		}
		if (ability.kind === 'channel') {
			h.channel = {
				ability: ability.id,
				slot,
				dir,
				target,
				left: ticks(skill.duration),
				total: ticks(skill.duration),
			}
			ability.onStart?.(context)
			return
		}
		ability.onRelease?.(context)
		if (castFootprint && h.catchWindow) footprints.set(h.catchWindow, castFootprint)
		if (ability.kind === 'dash') {
			// Whole fixed steps avoid overshooting the advertised distance on the final dash tick.
			const time = Math.max(1, Math.ceil(skill.time / STEP)) * STEP - 1e-9
			h.dashAbility = ability.id
			h.body.dash(dir, { distance: skill.range, time })
			if (castFootprint) footprints.set(h.body, castFootprint)
			return
		}
		if (ability.kind === 'zone') {
			zones.push({
				id: ++shotIds,
				owner: h.id,
				team: h.team,
				x: target.x,
				z: target.z,
				left: ticks(skill.delay),
				total: ticks(skill.delay),
				ability: ability.id,
				slot,
			})
			if (castFootprint) footprints.set(zones.at(-1), castFootprint)
			return
		}
		const shot = launchShot(h, dir, {
			ability: ability.id,
			slot,
			pierce: ability.pierce,
			heal: ability.heal,
			bounce: ability.bounce,
			catchable: ability.catchable,
			isAbility: true,
			slow: skill.slow ? { factor: 1 - skill.slow, duration: skill.duration } : null,
			speed: skill.speed,
			radius: skill.radius,
			range: skill.range,
			damage: skill.damage * (1 + tune.levels.growth * ((h.level ?? tune.hero.level) - 1)),
		})
		if (castFootprint) footprints.set(shot, castFootprint)
	}

	// A prop is an aim point, never an enemy or a unit in the target database.
	function aimBasic(h, at) {
		if (!at || !footprint?.({ phase: 'aim', hero: h.id, aim: at })) return false
		if (h.attack?.phase === 'windup') return true
		const p = h.body.position,
			basic = h.definition.basic
		const reason =
			h.cast || h.channel || h.body.dashing
				? 'casting'
				: t < h.attackTick
					? 'cooldown'
					: !basic || Math.hypot(at.x - p.x, at.z - p.z) > basic.range
						? 'range'
						: !segmentClear(p, at, basic.radius, obstacles)
							? 'blocked'
							: null
		if (reason) {
			present({ type: 'denied', hero: h.id, slot: 'primary', reason })
			return true
		}
		h.order = null
		h.attack = {
			point: { ...at },
			phase: 'windup',
			left: ticks(basic.windup),
			total: ticks(basic.windup),
		}
		h.yaw = yawOf(at.x - p.x, at.z - p.z)
		trace(h, h.attack, at, basic.id)
		present({
			type: 'cast',
			hero: h.id,
			ability: basic.id,
			slot: 'primary',
			point: { ...p },
			direction: dirOf(h.yaw),
			target: { ...at },
		})
		return true
	}

	function control(h, dt) {
		for (let i = 0; i < h.cd.length; i++)
			if (training.noCooldowns && h.id === training.local) h.cd[i] = 0
			else if (h.cd[i] > 0) h.cd[i]--
		if (h.dead) {
			intents.cancel(h.id)
			if (t >= h.respawnTick) respawn(h)
			return
		}
		const frame = intents.get(h.id)
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
		if (t < h.stunUntil || t < h.freezeUntil || t < h.proneUntil) {
			cancelChannel(h, 'disabled')
			h.body.cancelDash()
			if (t < h.stunUntil || t < h.freezeUntil) {
				h.catchWindow = null
				h.abilityState.bag = []
			}
			if (frame.order) present({ type: 'denied', hero: h.id, slot: 'primary', reason: 'disabled' })
			for (const e of frame.pressed.slice()) {
				intents.consume(h.id, e.action)
				present({ type: 'denied', hero: h.id, slot: e.action, reason: 'disabled' })
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
				h.cancelUntil[slotIndex] = t + lockout
				h.cd[slotIndex] = Math.max(
					lockout,
					(cast.cooldownBefore ?? 0) - (t - (cast.startedTick ?? t)),
				)
			}
			if (cast.pocket) {
				if (cast.pocket.until > t) h.abilityState.pocket = cast.pocket
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
				for (const s of frame.pressed.slice())
					if (SLOTS.includes(s.action)) intents.consume(h.id, s.action)
				intents.consume(h.id, 'stop')
			} else if (e.action === 'cancel') intents.consume(h.id, 'cancel') // channels arrive with mount and R
			else if (e.action === 'primary') {
				if (!heldBall && !aimBasic(h, e.at)) attackAhead(h, e.at)
				intents.consume(h.id, 'primary')
			}
		}
		if (frame.order) issue(h, frame.order)
		if (Math.hypot(frame.move.x, frame.move.z) > 0.01) h.order = null
		if (frame.order && ['move', 'attack-move'].includes(h.order?.kind)) h.attack = null
		if (!heldBall) casts(h, frame)
		if (h.cast?.left === 0) release(h)
		h.body.speedMul =
			slowFactor(h, t) * (h.stance?.factor ?? 1) * (ball?.carrying(h) ? tune.ball.carrySpeed : 1)
		move(h, frame, dt)
	}

	function strafe(d, dt) {
		if (d.dead) {
			if (t >= d.respawnTick) respawn(d)
			return
		}
		const target = enemiesOf(d.team).sort(
			(a, b) =>
				Math.hypot(a.x - d.body.position.x, a.z - d.body.position.z) -
				Math.hypot(b.x - d.body.position.x, b.z - d.body.position.z),
		)[0]
		if (
			d.sparring &&
			!d.cast &&
			t >= d.castTick &&
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
				left: ticks(tune.dummies.tell),
				total: ticks(tune.dummies.tell),
			}
			d.castTick = t + ticks(tune.dummies.castEvery)
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
		d.body.speedMul = (tune.dummies.speed / profile.speed) * slowFactor(d, t)
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

	function respawn(unit) {
		unit.corpse?.dispose()
		unit.corpse = null
		const spawn = unit.post ?? unit.spawn
		unit.body = bodyAt(spawn.x, spawn.z, unit.team, unit.definition)
		if (unit.definition) unit.abilityState = freshAbilityState()
		unit.body.face(dirOf(unit.yaw))
		if (unit.definition) unit.cancelUntil = SLOTS.map(() => 0)
		unit.dead = false
		if (unit.post) unit.maxHp = tune.dummies.hp
		unit.hp = unit.maxHp
		unit.respawnTick = null
		unit.slow = { until: 0, factor: 1 }
		unit.freezeUntil = 0
		unit.proneUntil = 0
		unit.stance = null
		unit.channel = null
		unit.catchWindow = null
		for (let i = cutouts.length - 1; i >= 0; i--)
			if (cutouts[i].owner === unit.id) cutouts.splice(i, 1)
		unit.stunUntil = 0
		unit.ballThrow = null
		if (unit.post) unit.castTick = t + ticks(tune.dummies.castEvery)
		present({ type: 'spawn', target: unit.id, point: { x: spawn.x, y: 0, z: spawn.z } })
	}

	function basicAttack(h) {
		const attack = h.attack
		if (!attack || attack.startedTick === t || --attack.left > 0) return
		if (attack.phase === 'backswing') {
			h.attack = null
			return
		}
		const target = find(attack.target)
		if (!target && !attack.point) {
			h.attack = null
			return
		}
		const p = h.body.position,
			tp = attack.point ?? target.body.position
		const length = Math.hypot(tp.x - p.x, tp.z - p.z) || 1
		const shot = {
			id: ++shotIds,
			owner: h.id,
			team: h.team,
			...(h.definition.basic.id && { ability: h.definition.basic.id }),
			slot: 'primary',
			...(target && { target: target.id }),
			x: p.x,
			z: p.z,
			dx: (tp.x - p.x) / length,
			dz: (tp.z - p.z) / length,
			speed: h.definition.basic.speed,
			radius: h.definition.basic.radius,
			range: attack.point ? h.definition.basic.range : FLOOR.halfX * 4,
			travelled: 0,
			passed: [],
			damage: h.definition.basic.damage * (1 + tune.levels.growth * (h.level - 1)),
		}
		const castFootprint = footprints.get(attack)
		if (castFootprint) footprints.set(shot, castFootprint)
		if (h.definition.basic.kind === 'melee') {
			const inReach =
				!(target?.dead ?? false) &&
				Math.hypot(tp.x - p.x, tp.z - p.z) <=
					h.definition.basic.range + (target?.kind ? target.body.radius : 0) &&
				segmentClear(
					p,
					tp,
					h.definition.basic.radius,
					obstacles.filter((o) => o.id !== target?.id),
				)
			if (inReach)
				touch(shot, {
					kind: 'basic',
					from: { ...p },
					to: { ...tp },
					radius: h.definition.basic.radius,
				})
			present({
				type: 'impact',
				hero: h.id,
				ability: shot.ability,
				hit: inReach,
				point: { x: tp.x, y: tune.loose.height, z: tp.z },
			})
			if (inReach && target) hit(shot, { id: target.id, unit: target, hero: !target.kind }, tp)
		} else shots.push(shot)
		h.attackTick = t + ticks(1 / h.definition.basic.rate)
		h.attack = {
			target: target?.id ?? null,
			phase: 'backswing',
			left: ticks(h.definition.basic.backswing),
			startedTick: t,
		}
		if (h.definition.basic.kind === 'melee') return
		present({
			type: 'projectile',
			id: shot.id,
			hero: h.id,
			slot: 'primary',
			point: { x: p.x, y: tune.loose.height, z: p.z },
			direction: { x: shot.dx, z: shot.dz },
		})
	}

	function hit(shot, target, point) {
		const unit = target.unit
		if (training.godMode && unit.id === training.local) {
			present({
				type: 'shielded',
				source: shot.owner,
				target: unit.id,
				projectile: shot.id,
				point: { x: point.x, y: tune.loose.height, z: point.z },
			})
			return
		}
		if (shot.slot === 'ball' && target.hero) unit.body.cancelDash()
		const direction = { x: shot.dx, y: 0, z: shot.dz }
		const at = { x: point.x, y: tune.loose.height, z: point.z }
		if (unit.structure && !lane.vulnerable(unit)) {
			present({
				type: 'shielded',
				source: shot.owner,
				target: unit.id,
				projectile: shot.id,
				point: at,
			})
			return
		}
		const source = heroes.find((h) => h.id === shot.owner)
		const ability = source?.definition.abilities[shot.slot]
		const rawDamage =
			shot.damage ??
			(tune[shot.ability]?.damage ?? ability?.stats.damage ?? tune.loose.damage) *
				(1 + tune.levels.growth * ((source?.level ?? 1) - 1))
		const damage = Math.min(
			unit.hp,
			rawDamage *
				(unit.structure && (shot.isAbility || shot.slot.startsWith('slot'))
					? tune.waves.abilityStructure
					: 1),
		)
		lane?.help(find(shot.owner), unit, t)
		if (shot.slow) unit.slow = { until: t + ticks(shot.slow.duration), factor: shot.slow.factor }
		unit.hp = Math.max(0, unit.hp - damage)
		const lethal = unit.hp === 0
		if (!unit.kind && damage > 0) ball?.hurt(unit)
		if (source && shot.traitProcs !== false)
			source.definition.traits.onHit?.({
				...traitContext(source),
				source,
				target,
				ticks,
				shot: { ...shot, ability: shot.ability ?? source.definition.abilities[shot.slot]?.id },
			})
		present({
			type: 'hit',
			source: shot.owner,
			target: target.id,
			projectile: shot.id,
			ability: shot.ability ?? ability?.id ?? null,
			slot: shot.slot,
			point: at,
			direction,
			lethal,
			damage,
			hp: unit.hp,
			maxHp: unit.maxHp,
		})
		if (!lethal) return
		unit.dead = true
		if (!unit.kind) ball?.hurt(unit)
		unit.corpse = unit.body
		unit.body.retire()
		if (unit.kind) {
			unit.attack = null
			lane.reward(unit, shot.team ?? (unit.team === 'A' ? 'B' : 'A'), t, shot.owner)
			present({ type: 'death', source: shot.owner, target: unit.id, point: at, direction })
			return
		}
		if (lane && !unit.post)
			lane.reward(unit, shot.team ?? (unit.team === 'A' ? 'B' : 'A'), t, shot.owner)
		unit.respawnTick =
			t +
			ticks(
				unit.post
					? tune.dummies.respawn
					: (respawnSeconds ?? tune.respawn.base + tune.respawn.perLevel * unit.level),
			)
		unit.cast = null
		if (!unit.post) {
			unit.abilityState = freshAbilityState()
			unit.stance = null
			unit.catchWindow = null
			unit.freezeUntil = 0
			unit.proneUntil = 0
			cancelChannel(unit, 'death')
			unit.definition.traits.onDeath?.(traitContext(unit, { shot }))
			unit.order = null
			unit.attack = null
			intents.cancel(unit.id)
		}
		present({ type: 'death', source: shot.owner, target: target.id, point: at, direction })
	}

	function swapHero(id, heroId) {
		const hero = heroes.find((h) => h.id === id)
		const definition = HEROES[heroId]
		if (!lobby || !hero || hero.dead || !definition?.playable || lane?.match.winner) {
			present({
				type: 'denied',
				hero: id,
				slot: 'swap',
				reason: lobby ? 'unavailable' : 'not-lobby',
			})
			return false
		}
		const from = hero.heroId
		const heldSlots = new Set([
			...(hero.swapAim?.blocked ?? []),
			...Object.keys(intents.get(id).held).filter((slot) => SLOTS.includes(slot)),
		])
		const moveOrder = ['move', 'attack-move'].includes(hero.order?.kind) ? hero.order : null
		const position = { ...hero.body.position }
		// Read before stopping: cancelDash clears walking velocity too. Dash momentum is not walking.
		const velocity = hero.body.dashing ? { x: 0, y: 0, z: 0 } : hero.body.velocity
		const speed = Math.hypot(velocity.x, velocity.z)
		const scale = speed ? Math.min(1, definition.base.speed / speed) : 1
		const fraction = hero.hp / hero.maxHp
		if (hero.cast)
			castAbility(hero)?.onCancel?.(traitContext(hero, { ...hero.cast, reason: 'swap' }))
		cancelChannel(hero, 'swap')
		hero.body.cancelDash()
		hero.body.dispose()
		hero.heroId = heroId
		hero.definition = definition
		hero.body = bodyAt(position.x, position.z, hero.team, definition)
		hero.body.place(position.x, position.y, position.z)
		hero.body.setVelocity({ x: velocity.x * scale, y: velocity.y, z: velocity.z * scale })
		hero.body.face(dirOf(hero.yaw))
		hero.maxHp = definition.base.hp * (1 + tune.levels.growth * (hero.level - 1))
		hero.hp = hero.maxHp * fraction
		hero.abilityState = freshAbilityState()
		hero.attack = null
		hero.attackTick = 0
		hero.order = null
		hero.cast = null
		hero.stance = null
		hero.channel = null
		hero.catchWindow = null
		hero.dashAbility = null
		hero.ballThrow = null
		hero.slow = { until: 0, factor: 1 }
		hero.freezeUntil = 0
		hero.proneUntil = 0
		hero.stunUntil = 0
		hero.cd.fill(0)
		hero.cancelUntil.fill(0)
		hero.judged = new WeakSet()
		hero.lastOrder = -Infinity
		hero.stall = 0
		hero.lastRemaining = null
		if (moveOrder) {
			const goal = walkGoal(moveOrder.goal, hero.body.radius)
			hero.order = { kind: moveOrder.kind, target: null, goal, path: plan(hero, goal) }
		}
		// Cancel only queued actions, not the device: held RMB and pad movement must survive the cut.
		const frame = intents.get(id)
		for (const edge of frame.pressed.slice()) intents.consume(id, edge.action)
		frame.aim = null
		frame.held = {}
		hero.swapAim = heldSlots.size ? { blocked: heldSlots, sample: frame.held } : null
		// The same fact is available to frame-driven views without requiring a second event bus.
		hero.swapFact = { type: 'swap', hero: id, from, heroId, point: position, tick: t }
		present(hero.swapFact)
		return true
	}

	function traitContext(hero, extra = {}) {
		return { hero, sim: api, tick: t, ticks, intents, present, ...extra }
	}

	function cancelChannel(hero, reason) {
		if (!hero.channel) return
		const channel = hero.channel
		hero.channel = null
		abilityOf(channel.ability, hero)?.onCancel?.(traitContext(hero, { ...channel, reason }))
		present({
			type: 'channelCancelled',
			hero: hero.id,
			ability: channel.ability,
			reason,
			point: { ...hero.body.position },
		})
	}

	function stepHeroState(hero, dt) {
		const frame = intents.get(hero.id)
		if (hero.stance) {
			const stance = hero.stance
			const ability = abilityOf(stance.ability, hero)
			const cancelled = frame.pressed.some((e) => e.action === 'cancel')
			if (stance.until <= t || cancelled) {
				hero.stance = null
				ability?.onEnd?.(traitContext(hero, { stance }))
				if (cancelled && hero.catchWindow) {
					hero.catchWindow = null
					present({ type: 'catchExpired', hero: hero.id, point: { ...hero.body.position } })
				}
			} else ability?.onTick?.(traitContext(hero, { stance, dt }))
		}
		if (hero.catchWindow && hero.catchWindow.until <= t) hero.catchWindow = null
		if (hero.abilityState.pocket && hero.abilityState.pocket.until <= t) {
			hero.abilityState.pocket = null
			present({ type: 'catchExpired', hero: hero.id, point: { ...hero.body.position } })
		}
		if (!hero.channel || hero.dead) return
		const channel = hero.channel
		if (
			(abilityOf(channel.ability, hero)?.cancelOnMove &&
				(frame.order || Math.hypot(frame.move.x, frame.move.z) > 0.01)) ||
			frame.pressed.some((e) => ['stop', 'cancel'].includes(e.action))
		)
			return cancelChannel(hero, 'input')
		if (t < hero.stunUntil || t < hero.freezeUntil || t < hero.proneUntil)
			return cancelChannel(hero, 'disabled')
		const ability = abilityOf(channel.ability, hero)
		ability?.onTick?.(traitContext(hero, { ...channel, dt }))
		if (--channel.left > 0) return
		hero.channel = null
		ability?.onRelease?.(traitContext(hero, channel))
		present({
			type: 'channelEnd',
			hero: hero.id,
			ability: channel.ability,
			point: { ...hero.body.position },
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
			until: t + ticks(window.duration),
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
			id: ++shotIds,
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
			point: { x: p.x, y: tune.loose.height, z: p.z },
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
			t < (hero.cancelUntil[slotIndex] ?? 0) ||
			hero.cast ||
			hero.channel ||
			hero.body.dashing ||
			t < Math.max(hero.stunUntil, hero.freezeUntil, hero.proneUntil)
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
			startedTick: t,
			shot,
			pocket,
			dir,
			target: clampMap({
				x: hero.body.position.x + dir.x * shot.range,
				z: hero.body.position.z + dir.z * shot.range,
			}),
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
				t < hero.stunUntil ||
				t < hero.freezeUntil ||
				hero.team === shot.team ||
				!window ||
				window.until <= t ||
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
					point: { ...point, y: tune.loose.height },
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
					until: t + ticks(window.pocketLife ?? tune.catching.pocketLife),
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
			point: { ...point, y: tune.loose.height },
		})
		return true
	}

	const brains = scripted.map(createScriptedHero)
	const botSeats = bots.map((seat) =>
		typeof seat === 'string' ? { ...seats.find((s) => s.id === seat) } : seat,
	)
	const botIds = new Set(botSeats.map((s) => s.id))
	let botTeam = botSeats.length && withLane ? createBots(botSeats, seed) : null
	const rebuildBots = () => {
		botIds.clear()
		for (const seat of botSeats) botIds.add(seat.id)
		botTeam = botSeats.length && withLane ? createBots(botSeats, seed) : null
	}
	function step(dt = STEP) {
		if (lane?.match.winner) return
		if (driveBots && training.botsEnabled) botTeam?.step(api, intents)
		for (const brain of brains) brain({ heroes, lane, ball, tick: t }, intents)
		t++
		for (let i = boards.length - 1; i >= 0; i--)
			if (boards[i].until <= t) {
				const board = boards.splice(i, 1)[0]
				present({
					type: 'boardExpired',
					hero: board.owner,
					board: board.id,
					point: { x: board.x, y: 0, z: board.z },
				})
			}
		ball?.begin(t)
		lane?.step(t, dt)
		if (lane?.match.winner) return
		const dashEnds = []
		const dashFrom = footprint ? new Map(heroes.map((h) => [h.id, { ...h.body.position }])) : null
		for (const h of heroes) {
			const dashing = h.body.dashing
			stepHeroState(h, dt)
			h.definition.traits.onTick?.(traitContext(h, { dt }))
			control(h, dt)
			if (dashing && !h.body.dashing) dashEnds.push(h)
			if (h.cast && --h.cast.left <= 0) release(h)
			if (!h.dead) basicAttack(h)
		}
		for (const d of dummies) strafe(d, dt)
		world.step()
		for (const h of heroes) {
			if (h.dead) continue
			h.body.sync()
			const dashCast = footprints.get(h.body)
			if (
				dashFrom &&
				dashCast &&
				(h.body.dashing || dashEnds.includes(h) || dashCast.started === t)
			)
				touch(h.body, {
					kind: h.body.dashing ? 'path' : 'landing',
					from: dashFrom.get(h.id),
					to: { ...h.body.position },
					radius: abilityOf(h.dashAbility, h)?.stats.radius ?? h.body.radius,
				})
			if (!h.body.dashing) footprints.delete(h.body)
			if (footprint && h.catchWindow)
				touch(h.catchWindow, {
					kind: 'catch',
					point: { ...h.body.position },
					radius: h.catchWindow.radius,
					dir: h.catchWindow.dir,
					angle: h.catchWindow.angle,
				})
			face(h, dt)
		}
		for (const d of dummies) if (!d.dead) d.body.sync()
		for (const h of dashEnds) {
			abilityOf(h.dashAbility, h)?.onDashEnd?.(traitContext(h))
			h.dashAbility = null
			if (h.order?.goal) h.order.path = plan(h, h.order.goal)
		}
		for (let i = zones.length - 1; i >= 0; i--) {
			const zone = zones[i]
			if (--zone.left > 0) continue
			const skill = tune[zone.ability ?? 'rain']
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
				if (skill.slow) e.unit.slow = { until: t + ticks(skill.duration), factor: 1 - skill.slow }
				hit(
					{
						owner: zone.owner,
						team: zone.team,
						id: zone.id,
						slot: zone.slot ?? 'slot3',
						ability: zone.ability,
						dx: 0,
						dz: 0,
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
						point: { x: shot.x, y: tune.loose.height, z: shot.z },
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
					tick: t,
					ball,
					obstacles,
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
					point: { x: shot.x, y: tune.loose.height, z: shot.z },
					direction: { x: shot.dx, y: 0, z: shot.dz },
				})
				shots.splice(i, 1)
				continue
			}
			const r = stepShot(
				shot,
				dt,
				targets,
				shot.target ? -Infinity : tune.loose.nearMiss,
				obstacles,
			)
			if (from)
				touch(shot, { kind: 'shot', from, to: { x: shot.x, z: shot.z }, radius: shot.radius })
			for (const n of r.nearMisses)
				present({
					type: 'nearMiss',
					source: shot.owner,
					target: n.target.id,
					projectile: shot.id,
					point: { x: n.point.x, y: tune.loose.height, z: n.point.z },
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
					point: { ...r.point, y: tune.loose.height },
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
					point: { x: shot.x, y: tune.loose.height, z: shot.z },
					direction: { x: shot.dx, y: 0, z: shot.dz },
				})
			if (r.hit || r.expired) shots.splice(i, 1)
		}
		if (!lane?.match.winner) ball?.finish(dt, resolveInterception)
		if (training.noCooldowns) heroes.find((h) => h.id === training.local)?.cd.fill(0)
	}

	// The pad's right stick for hero `id` (docs/moba-plan.md, "Controls"): range × remap, a 10° assist toward enemy heroes on Q,
	// and with the stick at rest the nearest enemy hero in range, then the facing.
	function stickAim(id, dir, magnitude, slot) {
		const h = heroes.find((x) => x.id === id)
		if (!h) return null
		const p = h.body.position
		const ability = h.definition.abilities[slot ?? 'slot1']
		const range = ball?.carrying(h)
			? tune.ball.range
			: (ability?.stats.range ?? h.definition.basic?.range ?? 0)
		const a = tune.stickAim
		if (!dir) {
			let best = null
			let bestD = range
			for (const e of enemiesOf(h.team).filter((e) => e.hero)) {
				const d = Math.hypot(e.x - p.x, e.z - p.z)
				if (d <= bestD) {
					best = e
					bestD = d
				}
			}
			if (best) return { x: best.x, z: best.z }
			const f = dirOf(h.yaw)
			return clampMap({ x: p.x + f.x * range, z: p.z + f.z * range })
		}
		let angle = Math.atan2(dir.x, dir.z)
		if (ability?.aimAssist) {
			let bend = null
			for (const e of enemiesOf(h.team).filter((e) => e.hero)) {
				const d = Math.hypot(e.x - p.x, e.z - p.z)
				if (d > range + e.radius) continue
				const gap =
					((((Math.atan2(e.x - p.x, e.z - p.z) - angle) % TAU) + TAU * 1.5) % TAU) - Math.PI
				if (
					Math.abs(gap) <= (a.assistAngle * Math.PI) / 180 &&
					(bend === null || Math.abs(gap) < Math.abs(bend))
				)
					bend = gap
			}
			if (bend !== null) angle += bend * a.assistBend
		}
		const u = Math.max(0, Math.min(1, (magnitude - a.inMin) / Math.max(1e-6, a.inMax - a.inMin)))
		const reach = range * (a.outMin + (1 - a.outMin) * u)
		return clampMap({ x: p.x + Math.sin(angle) * reach, z: p.z + Math.cos(angle) * reach })
	}

	function snapshot() {
		const pos = (b) => ({ x: q(b.position.x), z: q(b.position.z) })
		return {
			t,
			...(lane
				? {
						match: { ...lane.match, nextWave: lane.nextWave, nextBall: ball.nextBall },
						ball:
							ball.state &&
							structuredClone({
								...ball.state,
								shot: ball.state.shot && {
									pos: { x: ball.state.shot.x, z: ball.state.shot.z },
									dir: { x: ball.state.shot.dx, z: ball.state.shot.dz },
									travelled: ball.state.shot.travelled,
								},
							}),
						globes: structuredClone(lane.globes),
						teams: structuredClone(lane.teams),
						minions: lane.minions.map((u) => ({
							id: u.id,
							kind: u.kind,
							team: u.team,
							hp: u.hp,
							damageScale: u.damageScale,
							pos: pos(u.body),
							yaw: q(u.yaw ?? 0),
							target: u.target,
							attackTick: u.attackTick,
							attack: u.attack && { ...u.attack },
							aggroUntil: u.aggroUntil,
							forced: u.forced,
							returning: !!u.returning,
							aggroOrigin: u.aggroOrigin ? { x: q(u.aggroOrigin.x), z: q(u.aggroOrigin.z) } : null,
							returnGoal: u.returnGoal ? { x: q(u.returnGoal.x), z: q(u.returnGoal.z) } : null,
							slow: { ...u.slow },
						})),
						structures: lane.structures.map((u) => ({
							id: u.id,
							team: u.team,
							kind: u.kind,
							vulnerable: lane.vulnerable(u),
							silentUntil: u.silentUntil,
							hp: u.hp,
							dead: u.dead,
							target: u.target,
							attackTick: u.attackTick,
							attack: u.attack && { ...u.attack },
							aggroUntil: u.aggroUntil,
							forced: u.forced,
						})),
					}
				: {}),
			map: FLOOR.id,
			heroes: heroes.map((h) => ({
				id: h.id,
				team: h.team,
				...(lobby && { seatTeam: h.seatTeam }),
				heroId: h.heroId,
				abilityState: structuredClone(h.abilityState),
				hp: h.hp,
				maxHp: h.maxHp,
				level: h.level,
				dead: h.dead,
				respawnTick: h.respawnTick,
				stunUntil: h.stunUntil,
				ballThrow: h.ballThrow && structuredClone(h.ballThrow),
				attack: h.attack && { ...h.attack },
				attackTick: h.attackTick,
				pos: pos(h.body),
				vel: { x: q(h.body.velocity.x), z: q(h.body.velocity.z) },
				yaw: q(h.yaw),
				order: h.order && {
					kind: h.order.kind,
					target: h.order.target,
					goal: h.order.goal && { x: q(h.order.goal.x), z: q(h.order.goal.z) },
					...(h.order.resume ? { resume: { ...h.order.resume } } : {}),
				},
				cast: h.cast && { ...structuredClone(h.cast), yaw: q(h.cast.yaw) },
				cd: h.cd.slice(),
				cancelUntil: h.cancelUntil.slice(),
				slow: { ...h.slow },
				freezeUntil: h.freezeUntil,
				proneUntil: h.proneUntil,
				stance: h.stance && { ...h.stance },
				channel: h.channel && structuredClone(h.channel),
				catchWindow: h.catchWindow && { ...h.catchWindow },
			})),
			dummies: dummies.map((d) => ({
				id: d.id,
				pos: d.dead ? null : pos(d.body),
				yaw: q(d.yaw),
				hp: d.hp,
				maxHp: d.maxHp,
				cast: d.cast && {
					ability: d.cast.ability,
					slot: d.cast.slot,
					left: d.cast.left,
					total: d.cast.total,
					yaw: q(d.cast.yaw),
					target: { x: q(d.cast.target.x), z: q(d.cast.target.z) },
				},
				castTick: d.castTick,
				slow: { ...d.slow },
				dead: d.dead,
				respawnTick: d.respawnTick,
			})),
			boards: structuredClone(boards),
			cutouts: structuredClone(cutouts),
			zones: zones.map((z) => ({
				...structuredClone(z),
				pos: { x: q(z.x), z: q(z.z) },
				left: z.left,
				total: z.total,
			})),
			projectiles: shots.map((s) => ({
				...structuredClone(s),
				x: q(s.x),
				z: q(s.z),
				target: s.target ?? null,
				damage: s.damage,
				pos: { x: q(s.x), z: q(s.z) },
				dir: { x: q(s.dx), z: q(s.dz) },
				travelled: q(s.travelled),
			})),
		}
	}

	function dispose() {
		laneView?.dispose()
		for (const collider of towerColliders.values()) world.removeCollider(collider, true)
		for (const h of heroes) {
			h.corpse?.dispose()
			if (!h.dead) h.body.dispose()
		}
		for (const d of dummies) {
			d.corpse?.dispose()
			if (!d.dead) d.body.dispose()
		}
		shots.length = 0
		zones.length = 0
		boards.length = 0
		cutouts.length = 0
	}

	const api = {
		heroes,
		dummies,
		shots,
		zones,
		boards,
		cutouts,
		openCatch,
		swapHero,
		throwCaught,
		launchShot,
		lane,
		laneView,
		ball,
		obstacles,
		find,
		get bots() {
			return botTeam
		},
		training,
		setTraining(values) {
			Object.assign(training, values)
			const local = heroes.find((h) => h.id === training.local)
			if (training.noCooldowns && local) local.cd.fill(0)
			if (!training.botsEnabled)
				for (const id of botIds) {
					intents.cancel(id)
					const hero = heroes.find((h) => h.id === id)
					if (hero) hero.order = null
				}
		},
		setLevel(id, level) {
			const hero = heroes.find((h) => h.id === id)
			if (!hero || !Number.isInteger(level) || level < tune.hero.level || level > tune.levels.cap)
				return false
			const team = lane?.teams[hero.team]
			if (team) {
				team.level = level
				team.xp = 0
				for (let n = 1; n < level; n++)
					team.xp += tune.levels.first + tune.levels.increment * (n - 1)
			}
			for (const unit of heroes.filter((h) => h.team === hero.team)) {
				const fraction = unit.hp / unit.maxHp
				unit.level = level
				unit.maxHp = unit.definition.base.hp * (1 + tune.levels.growth * (level - 1))
				unit.hp = unit.dead ? 0 : unit.maxHp * fraction
			}
			present({ type: 'levelUp', team: hero.team, level, point: { ...hero.body.position } })
			return true
		},
		spawnHero({ team, heroId, bot = false, difficulty = 'normal' }, nearId) {
			if (
				!['A', 'B'].includes(team) ||
				!heroDefinition(heroId).playable ||
				heroes.length >= tune.testing.rosterMax
			)
				return false
			const local = heroes.find((h) => h.id === nearId)
			const origin = local?.body.position ?? { x: 0, z: 0 }
			const count = heroes.filter((h) => h.team === team).length
			const spawn = clampWalkable(
				{
					x: origin.x + (team === local?.team ? -1 : 1) * tune.map.spawnSpacing,
					z: origin.z + count * tune.map.spawnSpacing,
				},
				profile.radius,
				tune.orders.clearance,
				obstacles,
			)
			const seat = { id: `try-${++trainingSerial}`, team, heroId, difficulty }
			const hero = makeHero(seat, spawn)
			const level = lane?.teams[team].level ?? tune.hero.level
			hero.level = level
			hero.maxHp = hero.hp = hero.definition.base.hp * (1 + tune.levels.growth * (level - 1))
			hero.body.face(dirOf(hero.yaw))
			heroes.push(hero)
			if (bot) {
				botSeats.push(seat)
				rebuildBots()
			}
			present({ type: 'spawn', hero: hero.id, point: { ...hero.body.position } })
			return hero
		},
		clearHeroes(team, exceptId) {
			for (let i = heroes.length - 1; i >= 0; i--) {
				const hero = heroes[i]
				if (hero.team !== team || hero.id === exceptId) continue
				ball?.hurt(hero)
				cancelChannel(hero, 'clear')
				intents.cancel(hero.id)
				hero.corpse?.dispose()
				if (!hero.dead) hero.body.dispose()
				heroes.splice(i, 1)
				const index = botSeats.findIndex((s) => s.id === hero.id)
				if (index >= 0) botSeats.splice(index, 1)
				for (let j = boards.length - 1; j >= 0; j--)
					if (boards[j].owner === hero.id) boards.splice(j, 1)
				for (let j = zones.length - 1; j >= 0; j--)
					if (zones[j].owner === hero.id) zones.splice(j, 1)
				for (let j = shots.length - 1; j >= 0; j--)
					if (shots[j].owner === hero.id || shots[j].target === hero.id) shots.splice(j, 1)
			}
			rebuildBots()
		},
		step,
		stickAim,
		respawnNow(id) {
			const hero = heroes.find((h) => h.id === id)
			if (!hero?.dead || lane?.match.winner) return false
			respawn(hero)
			return true
		},
		pick,
		snapshot,
		dispose,
		get tick() {
			return t
		},
	}
	return api
}
