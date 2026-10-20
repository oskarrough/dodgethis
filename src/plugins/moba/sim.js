import { DEFAULT_HERO } from './heroes.js'
import { abilityOf } from './ability.js'
import { createReadySeats } from './lobby-state.js'
import { createScriptedHero } from './scripted.js'
import MECHANICS from './mechanics/all-mechanics.js'
import { createMatchStats } from './match-stats.js'
import { STEP } from '../../core/app.js'
import { tune, profile } from './tune.js'
import { mapLayout, clampWalkable, clampMap } from './obstacles.js'
import { holdGates } from './gates.js'
import { createPathPlanner } from './path.js'
import { createTargeting } from './targeting.js'
import { createProjectiles } from './projectiles.js'
import { createCombat } from './combat.js'
import { createStatuses } from './statuses.js'
import { createDisplacement } from './displacement.js'
import { createOrders } from './orders.js'
import { createCasting } from './casting.js'
import { createSnapshot } from './sim-snapshot.js'
import { createSummons } from './summons.js'
import { createControl } from './control.js'
import { createRecall } from './recall.js'
import { createHeroMaker, createRoster } from './sim-heroes.js'
import { layMechanicGround, plugMechanics } from './sim-mechanics.js'
import { dirOf } from './sim-kit.js'

// Heroes read intents; match mechanics share damage, shots and targeting. No DOM.
// `mechanics` chooses structures, minions, Ball, bots and dummies independently.
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
	mechanics = [{ id: 'dummies', ...MECHANICS.dummies }],
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
	// Mechanics lay their ground before any body is made; sim-mechanics.js wires the rest after the heroes.
	const ground = layMechanicGround({
		mechanics,
		scene,
		smooth,
		layout,
		mapObstacles,
		world,
		RAPIER,
		replan: () => {
			planPath = createPathPlanner({ radius: profile.radius, ...tune.orders }, obstacles, floor)
		},
	})
	const { laneView, obstacles, addCover, removeCover } = ground
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
	const matchStats = mechanics.some((mechanic) => mechanic.stats) ? createMatchStats() : null
	const present = (fact) => {
		const timed = { ...fact, tick: t }
		// Basic attacks and pocket returns also emit cast facts outside casting.js.
		if (timed.type === 'cast' && timed.lock === undefined) {
			const caster =
				heroes.find((unit) => unit.id === timed.hero) ??
				dummies.find((unit) => unit.id === timed.hero)
			const action = caster?.cast ?? caster?.attack
			timed.lock = (action?.total ?? action?.left ?? 0) * STEP
			timed.targetId = action?.targetId ?? caster?.attack?.target ?? null
		}
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
	const { bodyAt, makeHero } = createHeroMaker({
		scene,
		world,
		RAPIER,
		smooth,
		lobby,
		floor,
		walkingBounds,
	})

	const training = {
		local: null,
		noCooldowns: false,
		godMode: false,
		waves: true,
		botsEnabled: true,
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
						heroId: human?.heroId ?? participant.heroId ?? DEFAULT_HERO,
						joinOrder: human?.joinOrder ?? joinOrder + heroes.length,
						bot: !human,
					},
					t,
				)
		}
	const summons = []
	const { lane, camps, ball, dummies, flag, boss } = plugMechanics({
		mechanics,
		ground,
		layout,
		heroes,
		posts,
		training,
		summons,
		present,
		bodyAt,
		systems: () => ctx,
	})

	const { enemiesOf, find, pick, nearestToClick, stickAim } = createTargeting({
		summons,
		outOfPlay: (hero) => hero.definition.outOfPlay?.({ hero, sim: api }),
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
		...new Set(
			mechanics.flatMap((mechanic) =>
				[mechanic.lane?.botHabit ?? mechanic.botHabit].filter(Boolean),
			),
		),
	]
	const createControllers = mechanics.find((mechanic) => mechanic.controllers)?.controllers
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
		summons,
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
		ball,
		flag,
		boss,
		readySeats,
		matchStats,
		training,
		botIds,
		botSeats,
		rebuildBots,
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
		makeHero,
		walkGoal,
		enemiesOf,
		find,
		pick,
		nearestToClick,
	}
	for (const create of [
		createStatuses,
		createSummons,
		createProjectiles,
		createCombat,
		createOrders,
		createCasting,
		createDisplacement,
		createSnapshot,
		createControl,
		createRecall,
		createRoster,
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
		openCatch,
		launchShot,
		throwCaught,
		resolveInterception,
		basicAttack,
		plan,
		face,
		release,
		traitContext,
		stepHeroState,
		snapshot,
		control,
		strafe,
		swapHero,
		removeHero,
		releaseBot,
		adoptBot,
		setLevel,
		spawnHero,
		clearHeroes,
		respawnNow,
	} = ctx

	function step(dt = STEP) {
		if (lane?.match.winner) {
			ctx.removeSummons()
			return
		}
		if (driveBots && training.botsEnabled) botTeam?.step(api, intents)
		for (const brain of brains) brain({ heroes, lane, ball, tick: t }, intents)
		t++
		expireBoards()
		ball?.begin(t)
		camps?.step(t)
		flag?.step(t)
		boss?.step(t, dt)
		for (const unit of [...dummies, ...(lane?.minions ?? []), ...(lane?.structures ?? [])]) {
			ctx.expireStatuses(unit)
			ctx.stepStatuses(unit)
		}
		lane?.step(t, dt)
		if (lane?.match.winner) {
			ctx.removeSummons()
			return
		}
		const dashEnds = []
		const dashFrom = footprint ? new Map(heroes.map((h) => [h.id, { ...h.body.position }])) : null
		for (const h of heroes) {
			const dashing = h.body.dashing
			stepHeroState(h, dt)
			h.definition.traits.onTick?.(traitContext(h, { dt }))
			ctx.stepStatuses(h)
			for (const ability of Object.values(h.definition.abilities))
				ability?.watch?.(traitContext(h, { ability, dt }))
			ctx.stepRecall(h)
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
		if (lane) holdGates(lane.structures, [...heroes, ...lane.minions])
		for (const d of dummies) if (!d.dead) d.body.sync()
		for (const h of dashEnds) {
			const ability = abilityOf(h.dashAbility, h)
			ability?.onDashEnd?.(traitContext(h, { ability }))
			h.dashAbility = null
			if (h.order?.goal) h.order.path = plan(h, h.order.goal)
		}
		stepZones()
		stepShots(dt)
		if (lane?.match.winner) ctx.removeSummons()
		else ctx.stepSummons(dt)
		if (!lane?.match.winner) ball?.finish(dt, resolveInterception)
		if (lane?.match.winner) ctx.removeSummons()
		if (readySeats) {
			readySeats.step(t, STEP, heroes)
			for (const h of heroes) h.seatTeam = readySeats.seatOf(h.id)?.team ?? h.seatTeam
		}
		if (training.noCooldowns) heroes.find((h) => h.id === training.local)?.cd.fill(0)
	}
	function dispose() {
		ctx.removeSummons()
		ground.dispose()
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
		summons,
		summon: ctx.summon,
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
		hit: ctx.hit,
		heal: ctx.heal,
		apply: ctx.apply,
		remove: ctx.remove,
		cleanse: ctx.cleanse,
		displace: ctx.displace,
		enemiesOf,
		lane,
		laneView,
		camps,
		matchStats: matchStats?.rows,
		ball,
		flag,
		boss,
		obstacles,
		addCover,
		removeCover,
		bounds: field,
		layout,
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
		setLevel,
		spawnHero,
		removeHero,
		releaseBot,
		adoptBot,
		clearHeroes,
		step,
		stickAim,
		respawnNow,
		pick,
		snapshot,
		dispose,
		get tick() {
			return t
		},
	}
	return api
}
