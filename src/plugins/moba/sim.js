import { createBody } from '../../core/body.js'
import { PALETTE } from '../../core/style.js'
import { STEP } from '../../core/app.js'
import { SCHEMES } from '../../core/intents.js'
import { tune, profile } from './tune.js'
import { SPAWN, FLOOR, clampWalkable } from './map.js'
import { planPath, pursue } from './path.js'
import { stepShot } from './skillshot.js'

const SLOTS = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5']
const ticks = (seconds) => Math.max(0, Math.round(seconds / STEP))
const q = (v) => Math.round(v * 1000) / 1000
const TAU = Math.PI * 2
// Yaw ↔ ground direction, matching body.face: yaw = atan2(x, z) + π.
const yawOf = (x, z) => Math.atan2(x, z) + Math.PI
const dirOf = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) })
const DUMMY_POSTS = [
	{ x: -3, z: -7 },
	{ x: 5, z: -10 },
]
const ABILITIES = { slot1: 'loose', slot2: 'vault', slot3: 'rain' }

// The feel slice's simulation: heroes driven by intent frames, strafing dummies, swept skillshots. No DOM; presentation reads it and its facts.
// `heroes` is [{ id, team }], each id a participant in `intents`. `present(fact)` receives plain facts. `rng()` drives the dummies.
export function createSim({
	scene,
	world,
	RAPIER,
	intents,
	heroes: seats,
	smooth = null,
	present = () => {},
	rng = Math.random,
}) {
	let t = 0
	let shotIds = 0
	const shots = []
	const zones = []
	const bodyAt = (x, z, team) =>
		createBody(scene, world, RAPIER, {
			profile,
			position: [x, 0, z],
			color: team === 'A' ? PALETTE.teamA : PALETTE.teamB,
			bounds: (radius) => ({ x: FLOOR.half - radius, z: FLOOR.half - radius }),
			smooth,
		})

	const heroes = seats.map(({ id, team }, i) => {
		const body = bodyAt(SPAWN.x + i * 1.5, SPAWN.z, team)
		return {
			id,
			team,
			body,
			yaw: 0,
			spawn: { x: SPAWN.x + i * 1.5, z: SPAWN.z },
			hp: tune.hero.hp,
			maxHp: tune.hero.hp,
			level: tune.hero.level,
			dead: false,
			corpse: null,
			respawnTick: null,
			attack: null,
			attackTick: 0,
			order: null,
			cast: null,
			slowUntil: 0,
			cd: SLOTS.map(() => 0),
			judged: new WeakSet(), // slot edges already checked against the cooldown
			lastOrder: -Infinity,
			stall: 0,
			lastRemaining: null,
		}
	})
	for (const h of heroes) h.body.face(dirOf(h.yaw))
	const dummies = DUMMY_POSTS.map((post, i) => ({
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
		slowUntil: 0,
	}))

	// Everyone who can be shot, targeted or picked, as plain circles.
	const units = () => [
		...heroes.filter((h) => !h.dead).map((h) => ({ id: h.id, team: h.team, unit: h, hero: true })),
		...dummies.filter((d) => !d.dead).map((d) => ({ id: d.id, team: d.team, unit: d, hero: true })),
	]
	const enemiesOf = (team) =>
		units()
			.filter((u) => u.team !== team)
			.map((u) => ({
				...u,
				x: u.unit.body.position.x,
				z: u.unit.body.position.z,
				radius: profile.radius,
			}))
	const find = (id) =>
		heroes.find((h) => h.id === id && !h.dead) ?? dummies.find((d) => d.id === id && !d.dead)

	// The enemy an order point lands on: the unit's silhouette on the ground, its axis projected along the view, so a click on a torso counts.
	function pick(team, p) {
		const lean = tune.follow.back / tune.follow.height
		const tall = 2 * (profile.halfHeight + profile.radius)
		let best = null
		let bestD = Infinity
		for (const e of enemiesOf(team)) {
			const sz = e.z - tall * lean
			const s = Math.max(0, Math.min(1, (e.z - p.z) / (e.z - sz || 1)))
			const d = Math.hypot(p.x - e.x, p.z - (e.z + (sz - e.z) * s)) - e.radius
			if (d <= tune.orders.pick && d < bestD) {
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
			points: [
				{ x: p.x, z: p.z },
				...planPath(p, goal, { radius: profile.radius, ...tune.orders }),
			],
			leg: 0,
		}
	}

	function issue(h, point) {
		const target = pick(h.team, point)
		const repeat = t - h.lastOrder <= ticks(0.15)
		h.lastOrder = t
		if (target) {
			h.order = { kind: 'attack', target: target.id, goal: null, path: null, replanIn: 0 }
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
		const goal = clampWalkable(point, profile.radius, tune.orders.clearance)
		h.order = { kind: 'move', target: null, goal, path: plan(h, goal) }
		present({ type: 'order', hero: h.id, kind: 'move', target: null, point: goal, repeat })
	}

	// Pad A: the best target in a 45° cone around the aim, within 1.5 × attack range, nearest first.
	function attackAhead(h, at) {
		const p = h.body.position
		const f = at ? { x: at.x - p.x, z: at.z - p.z } : dirOf(h.yaw)
		const fl = Math.hypot(f.x, f.z) || 1
		let best = null
		let bestD = Infinity
		for (const e of enemiesOf(h.team)) {
			const dx = e.x - p.x
			const dz = e.z - p.z
			const d = Math.hypot(dx, dz)
			if (d > tune.orders.attackRange * 1.5 || d >= bestD) continue
			if ((dx * f.x + dz * f.z) / (d * fl || 1) < Math.cos(Math.PI / 8)) continue
			best = e
			bestD = d
		}
		if (best) issue(h, { x: best.x, z: best.z })
	}

	// Walk the path: pursue a carrot, and in the last metre cap speed at distance / dt so arrival lands exactly with no easing.
	function steer(h, goal, arrive, dt) {
		const p = h.body.position
		const top = profile.speed * h.body.speedMul
		const dist = Math.hypot(goal.x - p.x, goal.z - p.z)
		if (arrive && dist <= tune.orders.arrival) return null
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
		if (h.cast || h.attack) return body.update({ x: 0, z: 0 }, dt, 0) // rooted for the cast point, stopped dead
		const stick = Math.hypot(frame.move.x, frame.move.z)
		if (stick > 0.01) return body.update(frame.move, dt)
		const o = h.order
		let s = null
		if (o?.kind === 'move') {
			s = steer(h, o.goal, true, dt)
			if (!s) h.order = null
		} else if (o?.kind === 'attack') {
			const target = find(o.target)
			if (!target) h.order = null
			else {
				const tp = target.body.position
				const p = body.position
				if (Math.hypot(tp.x - p.x, tp.z - p.z) <= tune.orders.attackRange) {
					o.path = null
					if (t >= h.attackTick - ticks(tune.attack.windup) + 1 && !body.dashing) {
						h.attack = { target: target.id, phase: 'windup', left: ticks(tune.attack.windup) }
						h.yaw = yawOf(tp.x - p.x, tp.z - p.z)
						present({
							type: 'cast',
							hero: h.id,
							slot: 'primary',
							point: { x: p.x, y: p.y, z: p.z },
							direction: dirOf(h.yaw),
							target: { x: tp.x, z: tp.z },
						})
					}
				} else {
					o.replanIn -= dt
					if (!o.path || o.replanIn <= 0) {
						o.goal = clampWalkable(tp, profile.radius, tune.orders.clearance)
						o.path = plan(h, o.goal)
						o.replanIn = 0.25
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
		if (h.cast) want = h.cast.yaw
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
			h.yaw = h.cast ? want : h.yaw + Math.max(-turn, Math.min(turn, diff))
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
		const ability = ABILITIES[slot]
		if (!ability) return intents.consume(h.id, slot)
		const i = SLOTS.indexOf(slot)
		if (!h.judged.has(latest)) {
			h.judged.add(latest)
			if (h.cd[i] * STEP >= SCHEMES.pointClick.windows[slot] - 1e-9) {
				intents.consume(h.id, slot)
				present({ type: 'denied', hero: h.id, slot })
				return
			}
		}
		if (h.cast || h.attack?.phase === 'windup' || h.body.dashing || h.cd[i] > 0) return
		h.attack = null // abilities cut the backswing, not the windup
		intents.consume(h.id, slot)
		const p = h.body.position
		const at = latest.at
		const dx = at ? at.x - p.x : dirOf(h.yaw).x
		const dz = at ? at.z - p.z : dirOf(h.yaw).z
		const len = Math.hypot(dx, dz)
		const dir = len > 1e-4 ? { x: dx / len, z: dz / len } : dirOf(h.yaw)
		const skill = tune[ability]
		const reach = Math.min(len, skill.range)
		const target = { x: p.x + dir.x * reach, z: p.z + dir.z * reach }
		h.cast = { slot, dir, target, yaw: yawOf(dir.x, dir.z), left: ticks(skill.castPoint) }
		h.yaw = h.cast.yaw
		h.cd[i] = ticks(skill.cooldown)
		present({
			type: 'cast',
			hero: h.id,
			slot,
			point: { x: p.x, y: p.y, z: p.z },
			direction: { ...dir },
			target: { ...target },
		})
	}

	function release(h) {
		const { slot, dir, target } = h.cast
		h.cast = null
		h.lastRemaining = null
		const p = h.body.position
		if (slot === 'slot2') {
			// Whole fixed steps avoid overshooting the advertised distance on the final dash tick.
			const time = Math.max(1, Math.ceil(tune.vault.time / STEP)) * STEP - 1e-9
			h.body.dash(dir, { distance: tune.vault.range, time })
			return
		}
		if (slot === 'slot3') {
			zones.push({
				id: ++shotIds,
				owner: h.id,
				team: h.team,
				x: target.x,
				z: target.z,
				left: ticks(tune.rain.delay),
				total: ticks(tune.rain.delay),
			})
			return
		}
		const shot = {
			id: ++shotIds,
			owner: h.id,
			team: h.team,
			slot,
			x: p.x,
			z: p.z,
			dx: dir.x,
			dz: dir.z,
			speed: tune.loose.speed,
			radius: tune.loose.radius,
			range: tune.loose.range,
			travelled: 0,
			passed: [h.id],
		}
		shots.push(shot)
		present({
			type: 'projectile',
			id: shot.id,
			hero: h.id,
			slot,
			point: { x: p.x, y: tune.loose.height, z: p.z },
			direction: { x: dir.x, z: dir.z },
		})
	}

	function control(h, dt) {
		for (let i = 0; i < h.cd.length; i++) if (h.cd[i] > 0) h.cd[i]--
		if (h.dead) {
			intents.cancel(h.id)
			if (t >= h.respawnTick) respawn(h)
			return
		}
		const frame = intents.get(h.id)
		if (
			h.attack?.phase === 'backswing' &&
			(Math.hypot(frame.move.x, frame.move.z) > 0.01 ||
				frame.pressed.some((e) => e.action === 'stop'))
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
				attackAhead(h, e.at)
				intents.consume(h.id, 'primary')
			}
		}
		if (frame.order) issue(h, frame.order)
		if (Math.hypot(frame.move.x, frame.move.z) > 0.01) h.order = null
		if (h.attack?.phase === 'backswing' && h.order?.kind === 'move') h.attack = null
		casts(h, frame)
		if (h.cast?.left === 0) release(h)
		h.body.speedMul = t < h.slowUntil ? 1 - tune.rain.slow : 1
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
				slot: 'slot1',
				dir: { x: dx / length, z: dz / length },
				target: { x: target.x, z: target.z },
				yaw: yawOf(dx, dz),
				left: ticks(tune.loose.castPoint),
			}
			d.castTick = t + ticks(tune.dummies.castEvery)
			present({
				type: 'cast',
				hero: d.id,
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
		d.body.speedMul =
			(tune.dummies.speed / profile.speed) * (t < d.slowUntil ? 1 - tune.rain.slow : 1)
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
		unit.body = bodyAt(spawn.x, spawn.z, unit.team)
		unit.body.face(dirOf(unit.yaw))
		unit.dead = false
		unit.hp = unit.maxHp
		unit.respawnTick = null
		unit.slowUntil = 0
		if (unit.post) unit.castTick = t + ticks(tune.dummies.castEvery)
		present({ type: 'spawn', target: unit.id, point: { x: spawn.x, y: 0, z: spawn.z } })
	}

	function basicAttack(h) {
		const attack = h.attack
		if (!attack || --attack.left > 0) return
		if (attack.phase === 'backswing') {
			h.attack = null
			return
		}
		const target = find(attack.target)
		if (!target) {
			h.attack = null
			return
		}
		const p = h.body.position,
			tp = target.body.position
		const length = Math.hypot(tp.x - p.x, tp.z - p.z) || 1
		const shot = {
			id: ++shotIds,
			owner: h.id,
			team: h.team,
			slot: 'primary',
			target: target.id,
			x: p.x,
			z: p.z,
			dx: (tp.x - p.x) / length,
			dz: (tp.z - p.z) / length,
			speed: tune.attack.speed,
			radius: tune.attack.radius,
			range: FLOOR.half * 4,
			travelled: 0,
			passed: [],
			damage: tune.attack.damage,
		}
		shots.push(shot)
		h.attackTick = t + ticks(1 / tune.attack.rate)
		h.attack = { target: target.id, phase: 'backswing', left: ticks(tune.attack.backswing) }
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
		const direction = { x: shot.dx, y: 0, z: shot.dz }
		const at = { x: point.x, y: tune.loose.height, z: point.z }
		const damage = shot.damage ?? (shot.slot === 'slot3' ? tune.rain.damage : tune.loose.damage)
		unit.hp = Math.max(0, unit.hp - damage)
		const lethal = unit.hp === 0
		if (shot.slot === 'slot1' && target.hero) {
			const source = heroes.find((h) => h.id === shot.owner)
			// Momentum follows Vault, which the feel slice moved from E to W.
			if (source && !source.dead)
				source.cd[1] = Math.max(0, source.cd[1] - ticks(tune.momentum.reduction))
		}
		present({
			type: 'hit',
			source: shot.owner,
			target: target.id,
			projectile: shot.id,
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
		unit.corpse = unit.body
		unit.body.retire()
		unit.respawnTick =
			t +
			ticks(
				unit.post ? tune.dummies.respawn : tune.respawn.base + tune.respawn.perLevel * unit.level,
			)
		unit.cast = null
		if (!unit.post) {
			unit.order = null
			unit.attack = null
			intents.cancel(unit.id)
		}
		present({ type: 'death', source: shot.owner, target: target.id, point: at, direction })
	}

	function step(dt = STEP) {
		t++
		const dashEnds = []
		for (const h of heroes) {
			const dashing = h.body.dashing
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
			face(h, dt)
		}
		for (const d of dummies) if (!d.dead) d.body.sync()
		for (const h of dashEnds) if (h.order?.goal) h.order.path = plan(h, h.order.goal)
		for (let i = zones.length - 1; i >= 0; i--) {
			const zone = zones[i]
			if (--zone.left > 0) continue
			const targets = enemiesOf(zone.team).filter(
				(e) => Math.hypot(e.x - zone.x, e.z - zone.z) <= tune.rain.radius + e.radius,
			)
			present({
				type: 'impact',
				hero: zone.owner,
				hit: targets.length > 0,
				point: { x: zone.x, y: 0.05, z: zone.z },
			})
			for (const e of targets) {
				e.unit.slowUntil = t + ticks(tune.rain.duration)
				hit({ owner: zone.owner, id: zone.id, slot: 'slot3', dx: 0, dz: 0 }, e, { x: e.x, z: e.z })
			}
			zones.splice(i, 1)
		}
		for (let i = shots.length - 1; i >= 0; i--) {
			const shot = shots[i]
			let targets = enemiesOf(shot.team)
			if (shot.target) {
				targets = targets.filter((e) => e.id === shot.target)
				if (!targets.length) {
					shots.splice(i, 1)
					continue
				}
				const target = targets[0]
				const length = Math.hypot(target.x - shot.x, target.z - shot.z) || 1
				shot.dx = (target.x - shot.x) / length
				shot.dz = (target.z - shot.z) / length
			}
			const r = stepShot(shot, dt, targets, shot.target ? -Infinity : tune.loose.nearMiss)
			for (const n of r.nearMisses)
				present({
					type: 'nearMiss',
					source: shot.owner,
					target: n.target.id,
					projectile: shot.id,
					point: { x: n.point.x, y: tune.loose.height, z: n.point.z },
					distance: n.distance,
				})
			if (r.hit) hit(shot, r.hit, r.point)
			if (r.hit || r.expired) shots.splice(i, 1)
		}
	}

	// The pad's right stick for hero `id` (docs/moba-plan.md, "Controls"): range × remap, a 10° assist toward enemy heroes on Q,
	// and with the stick at rest the nearest enemy hero in range, then the facing.
	function stickAim(id, dir, magnitude, slot) {
		const h = heroes.find((x) => x.id === id)
		if (!h) return null
		const p = h.body.position
		const range = tune[ABILITIES[slot] ?? 'loose'].range
		const a = tune.stickAim
		if (!dir) {
			let best = null
			let bestD = range
			for (const e of enemiesOf(h.team)) {
				const d = Math.hypot(e.x - p.x, e.z - p.z)
				if (d <= bestD) {
					best = e
					bestD = d
				}
			}
			if (best) return { x: best.x, z: best.z }
			const f = dirOf(h.yaw)
			return { x: p.x + f.x * range, z: p.z + f.z * range }
		}
		let angle = Math.atan2(dir.x, dir.z)
		if (slot === 'slot1') {
			let bend = null
			for (const e of enemiesOf(h.team)) {
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
		return { x: p.x + Math.sin(angle) * reach, z: p.z + Math.cos(angle) * reach }
	}

	function snapshot() {
		const pos = (b) => ({ x: q(b.position.x), z: q(b.position.z) })
		return {
			t,
			map: 'feel',
			heroes: heroes.map((h) => ({
				id: h.id,
				team: h.team,
				hp: h.hp,
				maxHp: h.maxHp,
				level: h.level,
				dead: h.dead,
				respawnTick: h.respawnTick,
				attack: h.attack && { ...h.attack },
				attackTick: h.attackTick,
				pos: pos(h.body),
				vel: { x: q(h.body.velocity.x), z: q(h.body.velocity.z) },
				yaw: q(h.yaw),
				order: h.order && {
					kind: h.order.kind,
					target: h.order.target,
					goal: h.order.goal && { x: q(h.order.goal.x), z: q(h.order.goal.z) },
				},
				cast: h.cast && { slot: h.cast.slot, left: h.cast.left, yaw: q(h.cast.yaw) },
				cd: h.cd.slice(),
				slowUntil: h.slowUntil,
			})),
			dummies: dummies.map((d) => ({
				id: d.id,
				pos: d.dead ? null : pos(d.body),
				yaw: q(d.yaw),
				hp: d.hp,
				maxHp: d.maxHp,
				cast: d.cast && { slot: d.cast.slot, left: d.cast.left, yaw: q(d.cast.yaw) },
				castTick: d.castTick,
				slowUntil: d.slowUntil,
				dead: d.dead,
				respawnTick: d.respawnTick,
			})),
			zones: zones.map((z) => ({
				id: z.id,
				owner: z.owner,
				pos: { x: q(z.x), z: q(z.z) },
				left: z.left,
				total: z.total,
			})),
			projectiles: shots.map((s) => ({
				id: s.id,
				owner: s.owner,
				slot: s.slot,
				target: s.target ?? null,
				damage: s.damage ?? tune.loose.damage,
				pos: { x: q(s.x), z: q(s.z) },
				dir: { x: q(s.dx), z: q(s.dz) },
				travelled: q(s.travelled),
			})),
		}
	}

	function dispose() {
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
	}

	return {
		heroes,
		dummies,
		shots,
		zones,
		step,
		stickAim,
		pick,
		snapshot,
		dispose,
		get tick() {
			return t
		},
	}
}
