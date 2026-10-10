import { HEROES, heroDefinition, freshAbilityState } from './heroes.js'
import { abilityOf, castAbility } from './ability.js'
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
import { createSnapshot } from './sim-snapshot.js'
import { createControl } from './control.js'
import { SLOTS, dirOf } from './sim-kit.js'

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
	const laneView = lanePiece?.view(scene, smooth, layout) ?? null
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
				RAPIER.ColliderDesc.cylinder(tune[o.kind].height / 2, o.r).setTranslation(
					o.x,
					tune[o.kind].height / 2,
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
	// What the sim's systems share. Getters cover what changes after wiring; the systems
	// land on ctx in order, so each can call earlier ones directly and later ones through ctx.
	const ctx = {
		get t() {
			return t
		},
		get api() {
			return api
		},
		get planPath() {
			return planPath
		},
		shotIds: 0,
		lobby,
		layout,
		floor,
		field,
		walkingBounds,
		obstacles,
		gaps,
		gapAt,
		heroes,
		dummies,
		lane,
		lanePiece,
		ball,
		readySeats,
		matchStats,
		training,
		botIds,
		scripted,
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
		pick,
		nearestToClick,
	}
	for (const create of [
		createProjectiles,
		createCombat,
		createOrders,
		createCasting,
		createSnapshot,
		createControl,
	])
		Object.assign(ctx, create(ctx))
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
		respawn,
		basicAttack,
		hit,
		plan,
		face,
		release,
		traitContext,
		cancelChannel,
		stepHeroState,
		snapshot,
		control,
		strafe,
	} = ctx

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
