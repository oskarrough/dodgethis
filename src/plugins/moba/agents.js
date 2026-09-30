import { STEP } from '../../core/app.js'
import { neutralFrame, validIntent } from '../../core/intents.js'
import { tune } from './tune.js'

const ticks = (s) => Math.max(1, Math.round(s / STEP))
const n = (v) => String(Math.round(v * tune.agents.precision) / tune.agents.precision || 0)
const point = (p) => `${n(p.x)},${n(p.z)}`
const compare = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
const position = (u) => ({ x: u.body.position.x, z: u.body.position.z })
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

export function agentRoster({ seats = ['A1'], idle = [], difficulty = 'normal' } = {}) {
	const ids = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3']
	if (![...seats, ...idle].every((id) => ids.includes(id))) throw new Error('Seats are A1–B3')
	if (new Set([...seats, ...idle]).size !== seats.length + idle.length)
		throw new Error('A seat has only one controller')
	if (!['easy', 'normal', 'hard'].includes(difficulty)) throw new Error('Unknown bot difficulty')
	return ids.map((id) => ({
		id,
		team: id[0],
		heroId: 'fletcher',
		file: (Number(id[1]) - 2) * tune.bots.fileSpacing,
		difficulty,
		controller: seats.includes(id) ? 'agent' : idle.includes(id) ? 'idle' : 'bot',
	}))
}

// One lagged ring per match. Never keep live references to hostile state.
export function createAgentPerception() {
	const history = []
	return {
		capture(sim) {
			if (history.at(-1)?.tick === sim.tick) return
			const unit = (u) => ({
				id: u.id,
				team: u.team,
				kind: u.kind ?? 'hero',
				pos: position(u),
				hp: u.hp,
				dead: u.dead,
				cast: u.cast && structuredClone(u.cast),
				attack: u.attack && structuredClone(u.attack),
				vulnerable: !u.structure || sim.lane.vulnerable(u),
			})
			history.push({
				tick: sim.tick,
				heroes: sim.heroes.map(unit),
				minions: sim.lane.minions.filter((u) => !u.dead).map(unit),
				structures: sim.lane.structures.map(unit),
				ball: sim.ball.state && structuredClone(sim.ball.state),
				nextBall: sim.ball.nextBall,
				shots: sim.shots.map((s) => ({ ...s })),
				zones: sim.zones.map((z) => ({ ...z })),
			})
			while (history.length > ticks(Math.max(tune.bots.history, tune.bots.normal.reaction)) + 1)
				history.shift()
		},
		read() {
			return history[Math.max(0, history.length - 1 - ticks(tune.bots.normal.reaction))]
		},
	}
}

// ASCII, fixed section order and id order; explicitly count anything omitted.
export function observation(sim, id, perceived, reasons = ['decision']) {
	const h = sim.heroes.find((u) => u.id === id)
	const p = position(h)
	const left = (t) => n(Math.max(0, t - sim.tick) * STEP)
	const relative = (u) =>
		`${point(u.pos)} ${n(distance(p, u.pos))}m@${n((Math.atan2(u.pos.z - p.z, u.pos.x - p.x) * 180) / Math.PI)}`
	const order =
		h.order?.kind === 'attack'
			? `attack:${h.order.target}`
			: h.order?.goal
				? `move:${point(h.order.goal)}`
				: 'none'
	const b = perceived.ball
	const ball = b
		? `ball-${b.id} ${b.state} ${point(b.pos)}${b.carrier ? ` carrier=${b.carrier}` : ''}${b.channel ? ` channel=${b.channel.hero}:${left(b.channel.endTick)}s` : ''}${b.state === 'warning' ? ` spawn=${left(b.spawnAt)}s` : ` expires=${left(b.popAt)}s`}`
		: `none next=${left(perceived.nextBall)}s`
	const lines = [
		`seat ${id} t=${n(sim.tick * STEP)}s view=${n(perceived.tick * STEP)}s event=${reasons.join(',')}`,
		`self ${point(p)} hp=${Math.ceil(h.hp)}/${Math.ceil(h.maxHp)} lv=${h.level} Q/W/E=${h.cd
			.slice(0, 3)
			.map((cd) => n(cd * STEP))
			.join(
				'/',
			)}s ${h.dead ? `dead respawn=${left(h.respawnTick)}s` : `order=${order}`}${h.cast ? ` cast=${h.cast.ability}:${n(h.cast.left * STEP)}s` : ''}${h.body.dashing ? ` dash=${n(h.body.dashTime)}s` : ''}${sim.ball.carrying(h) ? ` carrying=ball-${sim.ball.state.id}` : ''}${h.stunUntil > sim.tick ? ` stun=${left(h.stunUntil)}s` : ''}`,
		`ball ${ball}`,
	]
	const threats = []
	for (const u of [...perceived.heroes, ...perceived.minions, ...perceived.structures]) {
		if (u.dead || u.team === h.team) continue
		if (u.cast)
			threats.push({
				id: u.id,
				text: `${u.id}:${u.cast.ability} at=${point(u.cast.target)} in=${left(perceived.tick + u.cast.left)}s`,
			})
		if (u.attack && (!u.attack.phase || u.attack.phase === 'windup'))
			threats.push({
				id: `${u.id}:basic`,
				text: `${u.id}:basic target=${u.attack.target ?? '-'} in=${left(perceived.tick + u.attack.left)}s`,
			})
	}
	for (const z of perceived.zones.filter((z) => z.team !== h.team))
		threats.push({
			id: `zone-${z.id}`,
			text: `zone-${z.id}:${z.ability} at=${point(z)} in=${left(perceived.tick + z.left)}s`,
		})
	for (const s of perceived.shots.filter(
		(s) => s.team !== h.team && !s.target && distance(p, s) <= tune.agents.nearby,
	))
		threats.push({
			id: `shot-${s.id}`,
			text: `shot-${s.id} at=${point(s)} dir=${n(s.dx)},${n(s.dz)}`,
		})
	if (b?.state === 'flying' && b.team !== h.team)
		threats.push({
			id: `ball-${b.id}`,
			text: `ball-${b.id} at=${point(b.shot)} dir=${n(b.shot.dx)},${n(b.shot.dz)}`,
		})
	const groups = [
		['tells', threats.sort(compare).map((u) => u.text)],
		[
			'structures',
			perceived.structures
				.sort(compare)
				.map(
					(u) =>
						`${u.id} ${point(u.pos)} hp=${Math.ceil(u.hp)} ${u.dead ? 'down' : u.vulnerable ? 'open' : 'shield'}`,
				),
		],
		[
			'heroes',
			perceived.heroes
				.filter((u) => u.id !== id)
				.sort(compare)
				.map((u) => `${u.id} ${u.dead ? 'dead' : `${relative(u)} hp=${Math.ceil(u.hp)}`}`),
		],
		[
			'nearby',
			perceived.minions
				.filter((u) => distance(p, u.pos) <= tune.agents.nearby)
				.sort(compare)
				.map((u) => `${u.id}:${u.team}:${u.kind} ${relative(u)} hp=${Math.ceil(u.hp)}`),
		],
	]
	// Reserve each later section's label and omission count before filling this one.
	for (let i = 0; i < groups.length; i++) {
		const [name, entries] = groups[i]
		const reserve = groups.slice(i + 1).reduce((sum, [label]) => sum + label.length + 24, 0)
		let line = `${name} `,
			count = 0
		for (const entry of entries) {
			if (
				lines.join('\n').length + line.length + entry.length + reserve + 24 >
				tune.agents.observationBytes
			)
				break
			line += `${count ? '; ' : ''}${entry}`
			count++
		}
		lines.push(
			line + (count < entries.length ? ` +${entries.length - count} omitted` : count ? '' : 'none'),
		)
	}
	return lines.join('\n')
}

export function agentAction(sim, id, perceived, input) {
	if (!input || typeof input !== 'object' || Array.isArray(input))
		throw new Error('Expected a JSON object')
	const h = sim.heroes.find((u) => u.id === id)
	const frame = neutralFrame()
	const at = () => {
		if (!Number.isFinite(input.x) || !Number.isFinite(input.y))
			throw new Error('x,y must be finite metres')
		if (Math.abs(input.x) > tune.map.halfX || Math.abs(input.y) > tune.map.halfZ)
			throw new Error('Point is outside the map')
		return { x: input.x, z: input.y }
	}
	const fields = {
		move: ['x', 'y'],
		attack: ['target'],
		cast: ['slot', 'x', 'y'],
		stop: [],
		pickup: [],
		throw: ['x', 'y'],
		wait: ['seconds'],
	}[input.action]
	if (!Array.isArray(fields)) throw new Error('Unknown action; use --help')
	if (Object.keys(input).some((key) => key !== 'action' && !fields.includes(key)))
		throw new Error('Unexpected action field')
	let seconds = tune.agents.decision
	if (h.dead && input.action !== 'wait') throw new Error('Dead: wait for respawn')
	switch (input.action) {
		case 'move':
			frame.order = at()
			break
		case 'attack': {
			const seen = [...perceived.heroes, ...perceived.minions, ...perceived.structures].find(
				(u) => u.id === input.target && !u.dead && u.team !== h.team && u.vulnerable,
			)
			if (!seen) throw new Error('Target is not a perceived, vulnerable enemy')
			if (sim.ball.carrying(h)) throw new Error('Carrying: use throw')
			// As with bots, only click resolution may use a live target position.
			const target = sim.find(seen.id)
			if (!target || sim.pick(h.team, position(target))?.id !== seen.id)
				throw new Error('Target is gone or its click is occluded')
			frame.order = position(target)
			break
		}
		case 'cast': {
			const slot = { Q: 'slot1', W: 'slot2', E: 'slot3' }[input.slot]
			if (!slot) throw new Error('slot must be Q, W or E')
			if (sim.ball.carrying(h)) throw new Error('Carrying: use throw')
			frame.aim = at()
			frame.pressed = [{ action: slot, at: frame.aim }]
			break
		}
		case 'stop':
			frame.pressed = [{ action: 'stop', at: null }]
			break
		case 'pickup': {
			const b = perceived.ball
			if (!b || !['loose', 'channel'].includes(b.state)) throw new Error('No loose Ball in view')
			if (distance(position(h), b.pos) > tune.ball.pickup) frame.order = { ...b.pos }
			else frame.pressed = [{ action: 'stop', at: null }]
			break
		}
		case 'throw':
			if (!sim.ball.carrying(h)) throw new Error('Not carrying the Ball')
			frame.aim = at()
			frame.pressed = [{ action: 'primary', at: frame.aim }]
			break
		case 'wait':
			if (
				!Number.isFinite(input.seconds) ||
				input.seconds < STEP ||
				input.seconds > tune.agents.maxWait
			)
				throw new Error(`seconds must be ${STEP}–${tune.agents.maxWait}`)
			seconds = input.seconds
	}
	if (!validIntent(frame)) throw new Error('Invalid intent')
	return { frame, ticks: ticks(seconds) }
}

export function createAgentDecisions(seats) {
	const clocks = new Map(seats.map((id) => [id, { due: 0, previous: null }]))
	return {
		acted(id, tick, delay) {
			clocks.get(id).due = tick + delay
		},
		due(sim, perceived, facts = []) {
			const due = []
			for (const [id, clock] of clocks) {
				const h = sim.heroes.find((u) => u.id === id)
				const state = {
					hp: h.hp,
					dead: h.dead,
					cd: h.cd.slice(),
					ball: perceived.ball?.id + ':' + perceived.ball?.state,
				}
				const old = clock.previous
				const reasons = []
				if (old) {
					if (
						state.hp < old.hp ||
						facts.some((f) => f.type === 'hit' && f.target === id && f.damage > 0)
					)
						reasons.push('damage')
					if (state.dead !== old.dead) reasons.push(state.dead ? 'death' : 'respawn')
					if (state.cd.some((cd, i) => !cd && old.cd[i])) reasons.push('ready')
					if (state.ball !== old.ball && perceived.ball?.state === 'loose') reasons.push('ball')
					for (const fact of facts) {
						if (fact.hero === id && ['denied', 'ballDenied'].includes(fact.type)) {
							const verb =
								{ slot1: 'Q', slot2: 'W', slot3: 'E', primary: 'attack' }[fact.slot] ?? 'throw'
							reasons.push(`denied:${verb}`)
						}
						if (fact.type === 'blocked' && fact.source === id) reasons.push('blocked')
					}
				}
				clock.previous = state
				if (sim.tick >= clock.due || reasons.length)
					due.push({ id, reasons: reasons.length ? reasons : ['decision'] })
			}
			return due
		},
	}
}
