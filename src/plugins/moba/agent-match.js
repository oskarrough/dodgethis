import { STEP } from '../../core/app.js'
import { createIntents, neutralFrame, validIntent } from '../../core/intents.js'
import { createSim } from './sim.js'
import { createAgentPerception } from './agents.js'
import { tune } from './tune.js'
import { FLOOR } from './obstacles.js'

// Sparse input tape: a neutral continuous sample goes to every seat each tick.
// Presses remain in the ordinary store until consumed or aged, just as in the app.
export function createAgentMatch({
	scene,
	world,
	RAPIER,
	roster,
	seed,
	smooth,
	present = () => {},
	replay = null,
	onInputs = () => {},
	matchId = crypto.randomUUID(),
	onLog = null,
	recordInputs = true,
}) {
	const intents = createIntents()
	intents.use('pointClick')
	const perception = createAgentPerception()
	const inputs = [],
		facts = []
	const logRows = []
	const seats = new Map(roster.map((seat) => [seat.id, seat]))
	const health = new Map()
	let loggedResult = false,
		passiveLevelUp = false
	const log = (row) => {
		if (onLog) onLog(row)
		else logRows.push(row)
	}
	const units = () => [...sim.heroes, ...sim.lane.structures, ...sim.lane.minions]
	const baseHealing = (unit, maxHp) =>
		!unit.kind &&
		!unit.dead &&
		(unit.team === 'A' ? -unit.body.position.x : unit.body.position.x) >= tune.base.x
			? maxHp * tune.base.heal * STEP
			: 0
	function logFact(fact) {
		const actor = fact.hero ?? fact.source ?? null
		const seat = seats.get(actor)
		const unit = actor && sim.find(actor)
		const shot =
			fact.projectile == null ? null : sim.shots.find((shot) => shot.id === fact.projectile)
		const slot = fact.slot ?? shot?.slot
		const target = typeof fact.target === 'string' ? fact.target : null
		// The sim reports attempted damage. Observe HP between hits, including
		// lane healing/level growth, so overkill never enters balance totals.
		if (fact.type === 'xp') passiveLevelUp = !!fact.passive
		if (fact.type === 'levelUp') {
			for (const hero of sim.heroes.filter((hero) => hero.team === fact.team)) {
				const previous = health.get(hero.id)
				if (!previous) continue
				const growth = hero.maxHp - previous.maxHp
				previous.hp = Math.min(
					hero.maxHp,
					previous.hp + (hero.dead ? 0 : growth) + (passiveLevelUp ? baseHealing(hero, growth) : 0),
				)
				previous.maxHp = hero.maxHp
			}
		}
		if (fact.type === 'spawn') {
			const spawned = sim.find(target)
			if (spawned) health.set(target, { hp: spawned.hp, maxHp: spawned.maxHp })
		}
		const previous = health.get(target)
		if (fact.heal && previous) previous.hp = Math.min(previous.maxHp, previous.hp + fact.heal)
		const damage =
			fact.type === 'hit'
				? Math.max(0, Math.min(fact.damage, previous?.hp ?? fact.damage + fact.hp))
				: 0
		if (fact.type === 'hit' && previous) previous.hp = fact.hp
		const position = fact.point ?? unit?.body.position ?? null
		log({
			tick: fact.tick,
			match_id: matchId,
			seed,
			seat: seat?.id ?? null,
			hero: seat ? (seat.heroId ?? 'fletcher') : null,
			team: fact.team ?? seat?.team ?? unit?.team ?? null,
			kind: fact.type,
			target,
			effective_damage: damage,
			ability_id:
				fact.ability ??
				shot?.ability ??
				unit?.definition?.abilities[slot]?.id ??
				(slot === 'primary'
					? (unit?.definition?.basic.id ?? 'basic')
					: slot === 'ball'
						? 'ball'
						: null),
			position: position && { x: position.x, y: position.y ?? 0, z: position.z },
			fact: structuredClone(fact),
		})
	}
	function logResult(reason) {
		if (loggedResult) return
		loggedResult = true
		log({
			tick: sim.tick,
			match_id: matchId,
			seed,
			seat: null,
			hero: null,
			team: null,
			kind: 'match',
			target: null,
			effective_damage: 0,
			ability_id: null,
			position: null,
			roster: structuredClone(roster),
			difficulty: [...new Set(roster.map((seat) => seat.difficulty ?? 'normal'))].join(','),
			map: FLOOR.id,
			winner: sim.lane.match.winner,
			duration: sim.tick * STEP,
			reason,
		})
	}
	let feeds = [],
		cursor = 0
	const sim = createSim({
		scene,
		world,
		RAPIER,
		heroes: roster,
		seed,
		lane: true,
		smooth,
		bots: roster.filter((seat) => seat.controller === 'bot'),
		driveBots: !replay,
		intents: {
			...intents,
			feed(id, frame) {
				if (
					recordInputs &&
					(frame.order ||
						frame.aim ||
						frame.pressed.length ||
						frame.released.length ||
						frame.move.x ||
						frame.move.z ||
						Object.keys(frame.held).length)
				)
					feeds.push([id, structuredClone(frame)])
				intents.feed(id, frame)
			},
		},
		present(fact) {
			facts.push(fact)
			logFact(fact)
			present(fact)
		},
	})
	perception.capture(sim)
	const tape = replay ?? { version: 1, seed, roster, tuning: structuredClone(tune), inputs }
	return {
		sim,
		intents,
		perception,
		tape,
		facts,
		logRows,
		step(actions = []) {
			if (sim.lane.match.winner || (replay && sim.tick >= replay.result.ticks)) return false
			facts.length = 0
			feeds = []
			for (const seat of roster) intents.feed(seat.id, neutralFrame())
			const recorded = replay?.inputs[cursor]
			if (recorded?.[0] === sim.tick) cursor++
			for (const [id, frame] of replay
				? recorded?.[0] === sim.tick
					? recorded[1]
					: []
				: actions) {
				if (!validIntent(frame)) throw new Error('Invalid recorded frame')
				feeds.push([id, structuredClone(frame)])
				intents.feed(id, frame)
			}
			const tick = sim.tick
			health.clear()
			for (const unit of units())
				health.set(unit.id, {
					hp: Math.min(unit.maxHp, unit.hp + baseHealing(unit, unit.maxHp)),
					maxHp: unit.maxHp,
				})
			sim.step()
			if (sim.lane.match.winner) logResult('matchOver')
			if (!replay && recordInputs && feeds.length) {
				const record = [tick, feeds]
				inputs.push(record)
				onInputs(record)
			}
			intents.age(STEP)
			perception.capture(sim)
			return true
		},
		finish(reason) {
			logResult(reason)
			tape.result = {
				reason,
				ticks: sim.tick,
				winner: sim.lane.match.winner,
				hash: replayHash(sim.snapshot()),
			}
			return tape
		},
		dispose: sim.dispose,
	}
}

// Integrity check, not a security signature. Includes the complete final snapshot.
export function replayHash(snapshot) {
	let hash = 2166136261
	for (const c of JSON.stringify(snapshot)) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0
	return hash.toString(16)
}

export function readReplay(value) {
	if (
		!value ||
		value.version !== 1 ||
		!Number.isSafeInteger(value.seed) ||
		value.seed < 0 ||
		value.seed > 0xffffffff ||
		!Array.isArray(value.roster) ||
		value.roster.length !== 6 ||
		!Array.isArray(value.inputs) ||
		!Number.isSafeInteger(value.result?.ticks) ||
		value.result.ticks < 0 ||
		typeof value.result.hash !== 'string'
	)
		throw new Error('Invalid replay')
	if (JSON.stringify(value.tuning) !== JSON.stringify(tune))
		throw new Error('Replay tuning differs from this build')
	const ids = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3']
	if (
		!ids.every(
			(id, i) =>
				value.roster[i]?.id === id &&
				value.roster[i].team === id[0] &&
				value.roster[i].heroId === 'fletcher' &&
				['agent', 'bot', 'idle'].includes(value.roster[i].controller),
		)
	)
		throw new Error('Invalid replay roster')
	let previous = -1
	for (const record of value.inputs) {
		if (
			!Array.isArray(record) ||
			record.length !== 2 ||
			!Number.isSafeInteger(record[0]) ||
			record[0] <= previous ||
			record[0] >= value.result.ticks ||
			!Array.isArray(record[1])
		)
			throw new Error('Invalid replay tick')
		previous = record[0]
		for (const entry of record[1])
			if (
				!Array.isArray(entry) ||
				entry.length !== 2 ||
				!ids.includes(entry[0]) ||
				!validIntent(entry[1])
			)
				throw new Error('Invalid replay input')
	}
	return value
}
