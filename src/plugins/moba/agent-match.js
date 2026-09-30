import { STEP } from '../../core/app.js'
import { createIntents, neutralFrame, validIntent } from '../../core/intents.js'
import { createSim } from './sim.js'
import { createAgentPerception } from './agents.js'
import { tune } from './tune.js'

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
}) {
	const intents = createIntents()
	intents.use('pointClick')
	const perception = createAgentPerception()
	const inputs = [],
		facts = []
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
					frame.order ||
					frame.aim ||
					frame.pressed.length ||
					frame.released.length ||
					frame.move.x ||
					frame.move.z ||
					Object.keys(frame.held).length
				)
					feeds.push([id, structuredClone(frame)])
				intents.feed(id, frame)
			},
		},
		present(fact) {
			facts.push(fact)
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
			sim.step()
			if (!replay && feeds.length) inputs.push([tick, feeds])
			intents.age(STEP)
			perception.capture(sim)
			return true
		},
		finish(reason) {
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
