import { HEROES, heroDefinition, freshAbilityState } from './heroes.js'
import { abilityOf, castAbility, slowFactor } from './ability.js'
import { dressHero } from './hero-view.js'
import { createReadySeats } from './lobby-state.js'
import { createScriptedHero } from './scripted.js'
import { dummies as dummiesPiece } from './match.js'
import { createMatchStats } from './match-stats.js'
import { createBody } from '../../core/body.js'
import { PALETTE } from '../../core/style.js'
import { styleId } from '../../core/stylepass.js'
import { STEP } from '../../core/app.js'
import { tune, profile } from './tune.js'
import { mapLayout, clampWalkable, clampMap } from './obstacles.js'
import { createPathPlanner } from './path.js'
import { createTargeting } from './targeting.js'
import { createProjectiles } from './projectiles.js'
import { createCombat } from './combat.js'
import { createOrders } from './orders.js'
import { createCasting } from './casting.js'
import { SLOTS, ticks, yawOf, dirOf } from './sim-kit.js'

const q = (v) => Math.round(v * 1000) / 1000 || 0

// Heroes read intents; match pieces share damage, shots and targeting. No DOM.
// `pieces` chooses structures, minions, Ball, bots and dummies independently.
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
	pieces = [dummiesPiece],
	lobby = false, // Combat allegiance A for heroes, B for dummies; seatTeam retains the pick.
	layout = mapLayout(lobby ? 'lobby' : undefined),
	spawns = null, // Participant-specific spawn overrides, copied for death/recovery.
	bounds = null, // Optional footprint override for training fixtures.
	obstacles: mapObstacles = layout.obstacles,
	posts = layout.dummyPosts,
	respawn: respawnSeconds = null, // Hero recovery override, in seconds; dummies keep their timer.
	readyRoster = [], // Full lobby seats; humans are the hero participants, the rest are cardboard bots.
	scripted = [],
	bots = [],
	seed = tune.bots.seed,
	driveBots = true, // Replay retains controller identity (and its tells), but supplies recorded frames.
	intercept = null,
	footprint = null, // Lobby observer: aimed props and real, clipped cast footprints.
}) {
	const lanePiece = pieces.find((piece) => piece.lane)?.lane
	const laneView = lanePiece?.view(scene, smooth) ?? null
	const towerObstacles = pieces.flatMap((piece) => piece.obstacles?.(layout) ?? [])
	const obstacles = [...mapObstacles, ...towerObstacles]
	// Lobby orders and dashes may aim past the floor's open edges, so you can walk off it.
	const floor =
		bounds ??
		(lobby
			? {
					halfX: tune.lobby.floor.halfX + tune.lobby.fall.reach,
					halfZ: tune.lobby.floor.halfZ + tune.lobby.fall.reach,
				}
			: layout.bounds)
	// Soft walking limits are separate from the terrain walls and dash bounds.
	const walkingBounds = bounds ?? layout.walkingBounds
	const field = layout.fieldBounds ?? floor
	// Flagfall's broken shore fence: inside a gap the court is slick, and a shove out through it dunks.
	const gaps = lobby || bounds ? [] : (layout.gaps ?? [])
	const gapAt = (x, flank) => gaps.find((g) => g.flank === flank && x >= g.x0 && x <= g.x1)
	const towerColliders = new Map(
		towerObstacles.map((o) => [
			o.id,
			world.createCollider(
				RAPIER.ColliderDesc.cylinder(tune.laneView[`${o.kind}Height`] / 2, o.r).setTranslation(
					o.x,
					tune.laneView[`${o.kind}Height`] / 2,
					o.z,
				),
			),
		]),
	)
	const clampBounds = (point, margin = 0) => clampMap(point, margin, floor)
	const walkGoal = (point, radius = profile.radius) =>
		clampWalkable(
			clampBounds(point, radius + tune.orders.clearance + tune.collision.separation),
			radius,
			tune.orders.clearance,
			obstacles,
			floor,
		)
	let planPath = createPathPlanner({ radius: profile.radius, ...tune.orders }, obstacles, floor)
	let t = 0
	const matchStats = pieces.some((piece) => piece.stats) ? createMatchStats() : null
	const present = (fact) => {
		const timed = { ...fact, tick: t }
		matchStats?.present(timed, heroes, lane?.structures ?? [], botIds)
		emit(timed)
	}
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
	const bodyAt = (x, z, team, definition = heroDefinition(), dress = dressHero) => {
		const point = walkingBounds
			? clampMap({ x, z }, definition.base.radius, walkingBounds)
			: { x, z }
		const body = createBody(scene, world, RAPIER, {
			profile: definition.base,
			position: [point.x, 0, point.z],
			color: team === 'A' ? PALETTE.teamA : PALETTE.teamB,
			bounds: (radius) => ({
				x: floor.halfX - radius,
				z: floor.halfZ - radius,
			}),
			smooth,
		})
		// The lobby floor has open edges instead: walking off drops you (see `dropIn`).
		if (walkingBounds && !lobby) {
			// Clamp the pending physics step, not the synced/rendered pose: interpolation stays intact.
			const update = body.update
			body.update = (...args) => {
				update(...args)
				if (body.retired) return
				const next = body.rigidBody.nextTranslation()
				const point = clampMap(next, body.radius, walkingBounds)
				body.rigidBody.setNextKinematicTranslation({ ...point, y: next.y })
			}
		}
		let undress = dress(body, definition.id, team)
		// Lobby allegiance stays friendly; the claimed seat owns the costume's colour.
		body.setTeam = (next) => {
			if (team === next) return
			team = next
			undress()
			body.visual.material.uniforms.uStyleId.value = styleId(next === 'A' ? 'teamA' : 'teamB')
			undress = dress(body, definition.id, next)
		}
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
	function makeHero({ id, team: seatTeam, heroId = 'fletcher', joinOrder = 0 }, spawn) {
		const team = lobby ? 'A' : seatTeam
		const definition = heroDefinition(heroId)
		const body = bodyAt(spawn.x, spawn.z, team, definition)
		return {
			id,
			team,
			...(lobby && { seatTeam, joinOrder, readyWalk: false }),
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
			buffered: null, // the newest slot press waiting for its first legal tick: { edge, until }
			lastOrder: -Infinity,
			stall: 0,
			lastRemaining: null,
		}
	}
	const heroes = seats.map((seat, i) => {
		const teamSeats = seats.filter((s) => s.team === seat.team)
		const index = seats.slice(0, i).filter((s) => s.team === seat.team).length
		return makeHero(
			{ ...seat, joinOrder: seat.joinOrder ?? i },
			{
				...(spawns?.[seat.id] ?? {
					x: layout.spawns[seat.team].x,
					z:
						layout.spawns[seat.team].z + (index - (teamSeats.length - 1) / 2) * layout.spawnSpacing,
				}),
			},
		)
	})
	for (const h of heroes) h.body.face(dirOf(h.yaw))
	const readySeats = lobby ? createReadySeats({ present }) : null
	if (readySeats)
		for (const [joinOrder, participant] of (readyRoster.length ? readyRoster : seats).entries()) {
			const box = readySeats.seats.find((s) => s.team === participant.team && !s.occupant)
			const human = heroes.find((h) => h.id === participant.id)
			if (box)
				readySeats.claim(
					box.id,
					{
						...participant,
						heroId: human?.heroId ?? participant.heroId ?? 'fletcher',
						joinOrder: human?.joinOrder ?? joinOrder + heroes.length,
						bot: !human,
					},
					t,
				)
		}
	const lane = laneView
		? lanePiece.create({
				layout,
				structures: pieces.some((piece) => piece.structures),
				heroes,
				wavesEnabled: () => pieces.some((piece) => piece.waves) && training.waves,
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
					planPath = createPathPlanner({ radius: profile.radius, ...tune.orders }, obstacles, floor)
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
							id: ++ctx.shotIds,
						},
						{ id: target.id, unit: target, hero: !target.kind },
						target.body.position,
					)
				},
				projectile: (...args) => towerShot(...args),
			})
		: null

	const populations = { ball: null, dummies: [] }
	for (const piece of pieces) {
		if (!piece.create) continue
		populations[piece.population] = piece.create({
			heroes,
			posts,
			makeBody: bodyAt,
			targets: () => [...heroes, ...(lane?.structures ?? [])],
			vulnerable: (unit) => lane?.vulnerable(unit) ?? true,
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
	}
	const { ball, dummies } = populations

	const { enemiesOf, find, pick, nearestToClick, stickAim } = createTargeting({
		heroes,
		dummies,
		lane,
		ball,
		field,
	})
	const brains = scripted.map(createScriptedHero)
	const botSeats = bots.map((seat) =>
		typeof seat === 'string' ? { ...seats.find((s) => s.id === seat) } : seat,
	)
	const botIds = new Set(botSeats.map((s) => s.id))
	const botModules = [
		...new Set(pieces.flatMap((piece) => [piece.lane?.botHabit ?? piece.botHabit].filter(Boolean))),
	]
	const createControllers = pieces.find((piece) => piece.controllers)?.controllers
	let botTeam =
		botSeats.length && createControllers ? createControllers(botSeats, seed, botModules) : null
	const rebuildBots = () => {
		botIds.clear()
		for (const seat of botSeats) botIds.add(seat.id)
		botTeam =
			botSeats.length && createControllers ? createControllers(botSeats, seed, botModules) : null
	}
	const ctx = {
		get planPath() {
			return planPath
		},
		botIds,
		scripted,
		pick,
		nearestToClick,
		shotIds: 0,
		get t() {
			return t
		},
		get api() {
			return api
		},
		heroes,
		dummies,
		lane,
		ball,
		layout,
		obstacles,
		field,
		gaps,
		gapAt,
		walkingBounds,
		training,
		readySeats,
		intents,
		rng,
		respawnSeconds,
		footprint,
		footprints,
		intercept,
		present,
		trace,
		touch,
		bodyAt,
		walkGoal,
		enemiesOf,
		find,
		lobby,
	}
	Object.assign(ctx, createProjectiles(ctx))
	Object.assign(ctx, createCombat(ctx))
	Object.assign(ctx, createOrders(ctx))
	Object.assign(ctx, createCasting(ctx))
	const {
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
		dropIn,
		respawn,
		basicAttack,
		hit,
		dunk,
		plan,
		issue,
		attackAhead,
		move,
		face,
		casts,
		release,
		aimBasic,
		traitContext,
		cancelChannel,
		stepHeroState,
	} = ctx

	function control(h, dt) {
		for (let i = 0; i < h.cd.length; i++)
			if (training.noCooldowns && h.id === training.local) h.cd[i] = 0
			else if (h.cd[i] > 0) h.cd[i]--
		if (h.dead) {
			if (readySeats) {
				readySeats.cancel(h.id, t)
				h.readyWalk = false
			}
			intents.cancel(h.id)
			h.buffered = null
			if (t >= h.respawnTick) respawn(h)
			return
		}
		if (lobby && h.body.position.y < -tune.lobby.fall.depth) dropIn(h)
		if (h.shove) {
			// The slide is committed; orders and presses wait for it rather than being swallowed.
			if (t < h.shove.until) return h.body.update({ x: 0, z: 0 }, dt, 0)
			const shoved = h.shove
			h.shove = null
			if (shoved.dunk) return dunk(h, shoved)
			if (h.order?.goal) h.order.path = plan(h, h.order.goal)
		}
		const frame = intents.get(h.id)
		if (readySeats) {
			const box = readySeats.seatOf(h.id)
			const cancel = frame.pressed.some((e) => ['cancel', 'stop'].includes(e.action))
			const movement =
				Math.hypot(frame.move.x, frame.move.z) > 0 ||
				(frame.order &&
					(!box || Math.hypot(frame.order.x - box.x, frame.order.z - box.z) > tune.orders.arrival))
			if (cancel || (h.readyWalk && movement)) {
				if (h.readyWalk || box?.enteredAt != null) present({ type: 'readyCancel', hero: h.id })
				if (h.readyWalk) h.order = null
				h.readyWalk = false
				readySeats.cancel(h.id, t)
			}
			if (frame.pressed.some((e) => e.action === 'ready')) {
				intents.consume(h.id, 'ready')
				if (box && !cancel) {
					readySeats.resume(h.id)
					if (!h.readyWalk) {
						h.readyWalk = true
						issue(h, { x: box.x, z: box.z, kind: 'move' })
						present({
							type: 'readyWalk',
							hero: h.id,
							seat: box.id,
							point: { x: box.x, y: 0, z: box.z },
						})
					}
				}
			}
			// Occupancy may have claimed a different box in the preceding physics step.
			if (
				h.readyWalk &&
				!movement &&
				!cancel &&
				box &&
				h.order?.goal &&
				Math.hypot(h.order.goal.x - box.x, h.order.goal.z - box.z) > tune.orders.arrival
			)
				issue(h, { x: box.x, z: box.z, kind: 'move' })
		}
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
			if (h.buffered) {
				present({ type: 'denied', hero: h.id, slot: h.buffered.edge.action, reason: 'disabled' })
				h.buffered = null
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
				h.buffered = null
				for (const s of frame.pressed.slice())
					if (SLOTS.includes(s.action)) intents.consume(h.id, s.action)
				intents.consume(h.id, 'stop')
			} else if (e.action === 'cancel') {
				h.buffered = null
				intents.consume(h.id, 'cancel') // channels arrive with mount and R
			} else if (e.action === 'primary') {
				if (!heldBall && !aimBasic(h, e.at)) attackAhead(h, e.at)
				intents.consume(h.id, 'primary')
			}
		}
		if (frame.order) issue(h, frame.order)
		if (Math.hypot(frame.move.x, frame.move.z) > 0.01) h.order = null
		if (frame.order && ['move', 'attack-move'].includes(h.order?.kind)) h.attack = null
		if (!heldBall) casts(h, frame)
		else h.buffered = null
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
			!lobby &&
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
				left: ticks(lobby ? tune.lobby.practice.tell : tune.dummies.tell),
				total: ticks(lobby ? tune.lobby.practice.tell : tune.dummies.tell),
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
		for (const edge of frame.pressed.slice())
			if (edge.action !== 'ready') intents.consume(id, edge.action)
		frame.aim = null
		frame.held = {}
		hero.swapAim = heldSlots.size ? { blocked: heldSlots, sample: frame.held } : null
		// The same fact is available to frame-driven views without requiring a second event bus.
		hero.swapFact = { type: 'swap', hero: id, from, heroId, point: position, tick: t }
		const box = readySeats?.seatOf(id)
		if (box) readySeats.claim(box.id, { ...box.occupant, heroId }, t)
		present(hero.swapFact)
		return true
	}
	function step(dt = STEP) {
		if (lane?.match.winner) return
		if (driveBots && training.botsEnabled) botTeam?.step(api, intents)
		for (const brain of brains) brain({ heroes, lane, ball, tick: t }, intents)
		t++
		expireBoards()
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
		stepZones()
		stepShots(dt)
		if (!lane?.match.winner) ball?.finish(dt, resolveInterception)
		if (readySeats) {
			readySeats.step(t, STEP, heroes)
			for (const h of heroes) h.seatTeam = readySeats.seatOf(h.id)?.team ?? h.seatTeam
		}
		if (training.noCooldowns) heroes.find((h) => h.id === training.local)?.cd.fill(0)
	}
	function snapshot({ wire = false } = {}) {
		matchStats?.sync(heroes, botIds)
		const pos = (b) => ({ x: q(b.position.x), z: q(b.position.z) })
		const ballState = ball?.snapshot()
		const state = {
			t,
			...((lane || ball) && {
				match: { ...(lane && { ...lane.match, nextWave: lane.nextWave }), ...ballState?.match },
			}),
			...(ballState && { ball: ballState.ball }),
			...(matchStats && { matchStats: structuredClone(matchStats.rows) }),
			...(lane
				? {
						globes: structuredClone(lane.globes),
						teams: structuredClone(lane.teams),
						minions: lane.minions.map((u) => ({
							id: u.id,
							kind: u.kind,
							team: u.team,
							hp: u.hp,
							maxHp: u.maxHp,
							dead: u.dead,
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
							maxHp: u.maxHp,
							dead: u.dead,
							target: u.target,
							attackTick: u.attackTick,
							attack: u.attack && { ...u.attack },
							aggroUntil: u.aggroUntil,
							forced: u.forced,
						})),
					}
				: {}),
			map: floor.id ?? layout.bounds.id ?? field.id,
			...(readySeats && { readySeats: structuredClone(readySeats.seats) }),
			heroes: heroes.map((h) => ({
				id: h.id,
				team: h.team,
				...(lobby && { seatTeam: h.seatTeam, joinOrder: h.joinOrder, readyWalk: h.readyWalk }),
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
		return wire && lane ? lanePiece.snapshot(state) : state
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

	function removeHero(id) {
		const index = heroes.findIndex((hero) => hero.id === id)
		if (index < 0) return false
		const hero = heroes[index]
		ball?.hurt(hero)
		cancelChannel(hero, 'clear')
		intents.cancel(id)
		readySeats?.release(id, t)
		hero.corpse?.dispose()
		if (!hero.dead) hero.body.dispose()
		heroes.splice(index, 1)
		const bot = botSeats.findIndex((seat) => seat.id === id)
		if (bot >= 0) botSeats.splice(bot, 1)
		for (const population of [boards, zones, shots])
			for (let i = population.length - 1; i >= 0; i--)
				if (population[i].owner === id || population[i].target === id) population.splice(i, 1)
		rebuildBots()
		return true
	}

	// A late human takes a bot's hero as it stands (spot, HP, cooldowns); only the brain leaves.
	function releaseBot(id) {
		const index = botSeats.findIndex((seat) => seat.id === id)
		if (index < 0) return false
		botSeats.splice(index, 1)
		intents.cancel(id)
		const hero = heroes.find((h) => h.id === id)
		if (hero) hero.order = null
		rebuildBots()
		return true
	}
	// The reverse: a departed human's hero plays on as a bot from where it stands.
	function adoptBot(seat) {
		if (!heroes.some((h) => h.id === seat.id) || botSeats.some((s) => s.id === seat.id))
			return false
		intents.cancel(seat.id)
		botSeats.push(seat)
		rebuildBots()
		return true
	}

	const api = {
		heroes,
		dummies,
		shots,
		zones,
		boards,
		cutouts,
		openCatch,
		readySeats,
		swapHero,
		throwCaught,
		launchShot,
		lane,
		laneView,
		matchStats: matchStats?.rows,
		ball,
		obstacles,
		bounds: field,
		lanes: layout.lanes,
		gaps,
		shore: layout.bounds.halfZ,
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
					x: origin.x + (team === local?.team ? -1 : 1) * layout.spawnSpacing,
					z: origin.z + count * layout.spawnSpacing,
				},
				profile.radius,
				tune.orders.clearance,
				obstacles,
				floor,
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
		removeHero,
		releaseBot,
		adoptBot,
		clearHeroes(team, exceptId) {
			for (const hero of heroes.slice())
				if (hero.team === team && hero.id !== exceptId) removeHero(hero.id)
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
