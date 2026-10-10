import { STEP } from '../../core/app.js'
import { neutralFrame } from '../../core/intents.js'
import { tune } from './tune.js'
import { copyData } from './agents.js'
import { createFightBot } from './fight-bots.js'
import { createDodgeBot } from './dodge-bots.js'
import { laneRoute } from './maps/paths.js'

import { DEFAULT_HERO, listed } from './heroes.js'

const ticks = (s) => Math.max(1, Math.round(s / STEP))
const position = (u) => ({ x: u.body.position.x, z: u.body.position.z })

export function interceptTime(from, target, speed) {
	const dx = target.pos.x - from.x,
		dz = target.pos.z - from.z
	const a = target.vel.x ** 2 + target.vel.z ** 2 - speed ** 2
	const b = 2 * (dx * target.vel.x + dz * target.vel.z),
		c = dx ** 2 + dz ** 2
	if (Math.abs(a) < tune.collision.epsilon) return b < 0 ? -c / b : Math.sqrt(c) / speed
	const discriminant = b * b - 4 * a * c
	if (discriminant < 0) return Math.sqrt(c) / speed
	const roots = [
		(-b - Math.sqrt(discriminant)) / (2 * a),
		(-b + Math.sqrt(discriminant)) / (2 * a),
	].filter((t) => t >= 0)
	return roots.length ? Math.min(...roots) : Math.sqrt(c) / speed
}

// Bots fill a team with Mitts and Fletcher; the enemy's third seat is a seeded random listed hero.
export function practiceRoster(
	local = 'local',
	difficulty = 'easy',
	picks = {},
	seed = tune.bots.seed,
	humans = [local],
) {
	const localTeam = picks[local]?.team ?? 'A'
	const humanTeams = new Set(humans.map((id) => picks[id]?.team ?? localTeam))
	const random = botRandom(seed, 'practice-roster')
	const claimed = [local, ...Object.keys(picks).filter((id) => id !== local)]
	return ['A', 'B'].flatMap((team) => {
		const ids = claimed.filter(
			(id) =>
				(picks[id]?.team ?? (id === local ? localTeam : id.startsWith('bot-B-') ? 'B' : 'A')) ===
				team,
		)
		if (ids.length > 3) throw new Error(`MOBA team ${team} has more than three picks`)
		for (let i = team === localTeam ? 1 : 0; ids.length < 3; i++) {
			const id = `bot-${team}-${i}`
			if (!claimed.includes(id)) ids.push(id)
		}
		const lineup = ['mitts', 'fletcher', listed[Math.floor(random() * listed.length)]]
		let next = 0
		return ids.map((id, i) => ({
			id,
			team,
			heroId: picks[id]?.heroId ?? (picks[id] || id === local ? DEFAULT_HERO : lineup[next++]),
			file: (i - 1) * tune.bots.fileSpacing,
			difficulty: humanTeams.has(team) ? 'normal' : difficulty,
		}))
	})
}

// Fork by participant, not roster order. No stream or mutable brain is shared by sims.
export function botRandom(seed, id) {
	let state = seed >>> 0
	for (const c of id) state = Math.imul(state ^ c.charCodeAt(0), 16777619) >>> 0
	return () => {
		state += 0x6d2b79f5
		let n = Math.imul(state ^ (state >>> 15), 1 | state)
		n ^= n + Math.imul(n ^ (n >>> 7), 61 | n)
		return ((n ^ (n >>> 14)) >>> 0) / 4294967296
	}
}

function view(sim, births, modules) {
	const unit = (u) => ({
		id: u.id,
		team: u.team,
		kind: u.kind,
		dead: u.dead,
		hp: u.hp,
		maxHp: u.maxHp,
		level: u.level ?? 1,
		pos: position(u),
		radius: u.body.radius,
		vel: { x: u.body.velocity?.x ?? 0, z: u.body.velocity?.z ?? 0 },
		cast: u.cast && copyData(u.cast),
		dashing: !!u.body.dashing,
		target: u.target,
	})
	return {
		tick: sim.tick,
		lanes: copyData(sim.lanes ?? []),
		heroes: sim.heroes.map(unit),
		shots: sim.shots
			.filter((s) => !s.target)
			.map((s) => {
				if (!births.has(s)) births.set(s, sim.tick)
				return { ...s, releaseTick: births.get(s) }
			}),
		zones: sim.zones.map((z) => ({ ...z })),
		...Object.assign({}, ...modules.map((m) => m.botView?.(sim, unit))),
	}
}

// The sole perception boundary. Only own state is live; every threat and
// objective comes from this ring; modules extend it, never skip it.
export function createBots(seats, seed = tune.bots.seed, modules = []) {
	const history = []
	const births = new WeakMap()
	const botIds = new Set(seats.map((seat) => seat.id))
	// A separate seeded deal spreads bots, not human seats. An idle human never
	// reserves the only bot in a lane, and combat's random stream stays untouched.
	const ranks = new Map()
	for (const team of new Set(seats.map((seat) => seat.team))) {
		const deal = seats
			.filter((seat) => seat.team === team)
			.map((seat) => ({ id: seat.id, draw: botRandom(seed, `lanes:${seat.id}`)() }))
			.sort((a, b) => a.draw - b.draw || a.id.localeCompare(b.id))
		deal.forEach((seat, rank) => ranks.set(seat.id, rank))
	}
	const teamBots = (team) => seats.filter((seat) => seat.team === team).length
	const brains = seats.map((seat) =>
		createBot(
			{ ...seat, laneRank: ranks.get(seat.id), teamBots: teamBots(seat.team) },
			seed,
			botIds,
			modules,
		),
	)
	return {
		brains,
		step(sim, intents) {
			history.push(view(sim, births, modules))
			const retention = ticks(tune.bots.history)
			while (history.length > retention) history.shift()
			for (const brain of brains) {
				const lag = ticks(brain.knobs().reaction)
				const perceived = history[Math.max(0, history.length - 1 - lag)]
				intents.feed(brain.id, brain.frame(sim, perceived))
			}
		},
	}
}

export function createBot(
	{ id, team, file = 0, difficulty = 'normal', laneRank = 0, teamBots = 1 },
	seed,
	botIds = null,
	modules = [],
) {
	const habits = modules.map((m) => m.createBot())
	const random = botRandom(seed, id)
	// Minds Flagfall's slick for the whole match, or never: a careless bot is a dunk waiting to happen.
	// Its own stream, so the deal leaves every other draw (and Overthrow) untouched.
	const slickCare =
		botRandom(seed, `slick:${id}`)() < (tune.bots[difficulty] ?? tune.bots.normal).slickCare
	const combat = createFightBot(
		{ id, team, file, difficulty, slickCare },
		botIds,
		random,
		interceptTime,
	)
	let nextThink = Math.floor(random() * tune.bots.thinkTicks)
	// The lane each human teammate last stood in. They claim it; bots deal into the team's
	// remaining slots, so the team splits like an all-bot deal instead of doubling the human.
	const claims = new Map()
	const pickLane = (perceived) => {
		const lanes = perceived.lanes
		const dealt = lanes?.[laneRank % lanes.length]
		if (!(lanes?.length > 1) || !botIds) return dealt
		for (const u of perceived.heroes) {
			if (u.team !== team || u.dead || botIds.has(u.id)) continue
			const lane = lanes.find((l) => {
				const route = laneRoute(l.path, team)
				const at = route.point(route.progress(u.pos))
				return Math.hypot(at.x - u.pos.x, at.z - u.pos.z) <= tune.bots.laneClaim
			})
			if (lane) claims.set(u.id, lane.id)
		}
		if (!claims.size) return dealt
		const slots = Array.from({ length: teamBots + claims.size }, (_, k) => lanes[k % lanes.length])
		for (const claimed of claims.values()) {
			const i = slots.findIndex((l) => l.id === claimed)
			if (i >= 0) slots.splice(i, 1)
		}
		return slots[laneRank] ?? dealt
	}
	const dodge = createDodgeBot(random)
	const phases = {}
	for (const habit of habits)
		for (const [name, goal] of Object.entries(habit.botGoals ?? {})) {
			if (phases[name]) throw new Error(`Duplicate bot phase: ${name}`)
			phases[name] = goal
		}
	const { returnShot, selectTarget, fight, hold, push } = combat
	const retreat = (ctx) => {
		if (!combat.retreating) return null
		ctx.setState('retreat')
		if (!phases.retreat?.(ctx)) ctx.move(ctx.h.spawn)
		return ctx.frame
	}
	// The paid wave screen commits before the Ball; an unclaimed siege follows combat.
	const plan = [
		returnShot,
		retreat,
		'urgent',
		selectTarget,
		'commitSiege',
		'objective',
		'defend',
		fight,
		'escort',
		'siege',
		hold,
		'advance',
		push,
	]
	const goal = (ctx) =>
		plan.some((step) => (typeof step === 'string' ? phases[step]?.(ctx) : step(ctx)))
	return {
		id,
		knobs: combat.knobs,
		get state() {
			return combat.state
		},
		get retreating() {
			return combat.retreating
		},
		frame(sim, perceived) {
			const h = sim.heroes.find((u) => u.id === id)
			if (!h || h.dead) {
				combat.reset()
				dodge.reset()
				return neutralFrame()
			}
			if (sim.tick < nextThink) return neutralFrame()
			nextThink = sim.tick + tune.bots.thinkTicks

			const ctx = combat.perceive(sim, perceived, h)
			ctx.lanePath = pickLane(perceived)
			// Multi-lane routes already separate teammates; one lane retains its files.
			ctx.laneFile = perceived.lanes?.length === 1 ? file : 0
			if (ctx.lanePath) ctx.route = laneRoute(ctx.lanePath.path, team, ctx.laneFile)
			const contributions = habits.map((habit) => habit.botPerceive?.(ctx) ?? {})
			ctx.blockers = contributions.flatMap((c) => c.blockers ?? [])
			ctx.objectives = contributions.flatMap((c) => c.objectives ?? [])
			ctx.guardOk = contributions.flatMap((c) => c.guardOk ?? [])
			ctx.pressure = contributions.reduce((sum, c) => sum + (c.pressure ?? 0), 0)
			ctx.skillsLocked = contributions.some((c) => c.skillsLocked)
			ctx.castBusy = contributions.some((c) => c.castBusy)
			ctx.moveScale = contributions.reduce((scale, c) => scale * (c.moveScale ?? 1), 1)
			ctx.preferredTargets = contributions.flatMap((c) => c.preferredTargets ?? [])
			combat.assess(ctx)
			const threats = dodge.read(ctx, habits)
			if (!dodge.avoid(ctx, threats)) goal(ctx)
			return ctx.frame
		},
	}
}
