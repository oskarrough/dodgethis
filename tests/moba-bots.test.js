import { expect, test } from 'bun:test'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { createApp, STEP } from '../src/core/app.js'
import { createIntents, validIntent } from '../src/core/intents.js'
import { createSim } from '../src/plugins/moba/sim.js'
import {
	createBot,
	createBots,
	botRandom,
	interceptTime,
	practiceRoster,
} from '../src/plugins/moba/bots.js'
import { buildColliders, walkable } from '../src/plugins/moba/obstacles.js'
import { HEROES } from '../src/plugins/moba/heroes.js'
import { validFact } from '../src/plugins/moba/index.js'
import { tune } from '../src/plugins/moba/tune.js'

await RAPIER.init({})

function match(seed, { idle = false, hz = 60, trace = false, limit = 54000 } = {}) {
	const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
	world.timestep = STEP
	const unbuild = buildColliders(world, RAPIER)
	const app = createApp()
	const seats = practiceRoster()
	let sim,
		pending = [],
		invalid = 0,
		frames = 0
	const facts = [],
		hashes = [],
		budgets = [],
		quiet = new Map()
	app.modes.define('proof', {
		scheme: 'pointClick',
		start(run) {
			sim = createSim({
				scene: new THREE.Scene(),
				world,
				RAPIER,
				heroes: seats,
				bots: seats.filter((s) => !idle || s.id !== 'local'),
				seed,
				lane: true,
				intents: {
					...run.intents,
					feed(id, frame) {
						frames++
						if (
							!validIntent(frame) ||
							frame.move.x ||
							frame.move.z ||
							Object.keys(frame.held).length
						)
							invalid++
						run.intents.feed(id, frame)
					},
				},
				present(fact) {
					if (!validFact(fact)) throw new Error(`Invalid bot match fact: ${JSON.stringify(fact)}`)
					pending.push(fact)
					if (['ballHit', 'matchOver', 'structureDown'].includes(fact.type)) facts.push(fact)
				},
			})
			const stepBots = sim.bots.step
			sim.bots.step = (...args) => {
				const start = performance.now()
				stepBots(...args)
				budgets.push(performance.now() - start)
			}
			run.clock.pause(() => sim.tick >= limit || !!sim.lane.match.winner)
			run.system('simulate', () => {
				sim.step()
				if (trace)
					hashes.push(
						new Bun.CryptoHasher('sha256')
							.update(JSON.stringify([sim.snapshot(), pending]))
							.digest('hex'),
					)
				pending = []
				for (const u of [...sim.heroes, ...sim.lane.minions]) {
					if (u.dead) continue
					const p = u.body.position
					if (
						!Number.isFinite(p.x) ||
						!Number.isFinite(p.z) ||
						!walkable(p.x, p.z, u.body.radius, -tune.collision.separation, sim.obstacles)
					)
						throw new Error(
							`Unwalkable ${u.id} (${u.kind}) at ${p.x},${p.z}, radius ${u.body.radius}, tick ${sim.tick}`,
						)
				}
				if (sim.tick % 60) return
				for (const h of sim.heroes.filter((h) => !idle || h.id !== 'local')) {
					const p = h.body.position
					const enemyNear = [...sim.heroes, ...sim.lane.minions, ...sim.lane.structures].some(
						(u) =>
							!u.dead &&
							u.team !== h.team &&
							Math.hypot(u.body.position.x - p.x, u.body.position.z - p.z) <=
								tune.bots.supportRange,
					)
					if (h.dead || enemyNear) {
						quiet.delete(h.id)
						continue
					}
					const window = quiet.get(h.id) ?? { tick: sim.tick, pos: { x: p.x, z: p.z }, moved: 0 }
					window.moved += Math.hypot(p.x - window.pos.x, p.z - window.pos.z)
					window.pos = { x: p.x, z: p.z }
					if (sim.tick - window.tick >= 1800) {
						if (window.moved < 2) throw new Error(`Stuck brain ${h.id} at ${sim.tick}`)
						quiet.delete(h.id)
					} else quiet.set(h.id, window)
				}
			})
			return { epoch: 1, snapshot: sim.snapshot, apply: () => false, validFact }
		},
	})
	app.modes.start('proof')
	try {
		while (sim.tick < limit && !sim.lane.match.winner) app.frame(1 / hz)
		const snapshot = sim.snapshot()
		const scores = { A: 0, B: 0 }
		for (const f of facts.filter((f) => f.type === 'ballHit' && f.kind === 'structure'))
			scores[snapshot.heroes.find((h) => h.id === f.hero).team]++
		return {
			seed,
			snapshot,
			facts,
			scores,
			hashes,
			invalid,
			frames,
			botP99Ms: budgets.sort((a, b) => a - b)[Math.ceil(budgets.length * 0.99) - 1],
		}
	} finally {
		sim.dispose()
		app.dispose()
		unbuild()
		world.free()
	}
}

test('every late-wave unit reaches mid, including both larger brutes, without rebuilding one radius grid for another', () => {
	const previous = tune.match.late
	tune.match.late = 0
	const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
	world.timestep = STEP
	const unbuild = buildColliders(world, RAPIER),
		intents = createIntents()
	intents.use('pointClick')
	const sim = createSim({
		scene: new THREE.Scene(),
		world,
		RAPIER,
		intents,
		lane: true,
		heroes: [],
	})
	const arrived = new Set()
	try {
		for (let i = 0; i < 29 / STEP; i++) {
			sim.step()
			intents.age(STEP)
			for (const u of sim.lane.minions) if (Math.abs(u.body.position.x) < 9) arrived.add(u.id)
		}
		expect(sim.lane.minions).toHaveLength(14)
		expect(sim.lane.minions.filter((u) => u.kind === 'brute')).toHaveLength(2)
		expect(arrived.size).toBe(14)
	} finally {
		sim.dispose()
		unbuild()
		world.free()
		tune.match.late = previous
	}
})

test('two real sims with the same participant ids have independent brains, streams and pause clocks', () => {
	const live = (seed) => {
		const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
		world.timestep = STEP
		const unbuild = buildColliders(world, RAPIER),
			app = createApp()
		let sim,
			paused = false
		app.modes.define('proof', {
			scheme: 'pointClick',
			start(run) {
				const seats = practiceRoster()
				sim = createSim({
					scene: new THREE.Scene(),
					world,
					RAPIER,
					intents: run.intents,
					lane: true,
					heroes: seats,
					bots: seats,
					seed,
				})
				run.system('simulate', () => sim.step())
				run.clock.pause(() => paused)
				return { epoch: 1, snapshot: sim.snapshot, apply: () => false, validFact }
			},
		})
		app.modes.start('proof')
		return {
			app,
			sim,
			pause: () => {
				paused = true
			},
			dispose() {
				sim.dispose()
				app.dispose()
				unbuild()
				world.free()
			},
		}
	}
	const a = live(1),
		b = live(2),
		control = live(1)
	try {
		for (let i = 0; i < 600; i++) {
			a.app.frame(STEP)
			b.app.frame(STEP)
			control.app.frame(STEP)
		}
		expect(a.sim.snapshot()).toEqual(control.sim.snapshot())
		const before = a.sim.snapshot()
		a.pause()
		for (let i = 0; i < 60; i++) {
			a.app.frame(STEP)
			b.app.frame(STEP)
		}
		expect(a.sim.snapshot()).toEqual(before)
		expect(b.sim.tick).toBe(660)
	} finally {
		a.dispose()
		b.dispose()
		control.dispose()
	}
})

let reference
for (const seed of [1, 2, 3])
	test(`six table-built normal bots, seed ${seed}, finish by a core kill with both sides scoring`, () => {
		const result = match(seed, { trace: seed === 2 })
		if (seed === 2) reference = result
		if (!result.snapshot.match.winner)
			console.log(
				'timeout',
				seed,
				result.scores,
				result.snapshot.structures.map((s) => [s.id, s.hp]),
				result.snapshot.heroes.map((h) => [h.id, h.hp, h.pos]),
			)
		expect(result.invalid).toBe(0)
		expect(result.frames).toBeGreaterThan(result.snapshot.t)
		expect(result.snapshot.heroes).toHaveLength(6)
		expect(result.snapshot.heroes.every((h) => h.heroId === 'fletcher')).toBe(true)
		expect(result.snapshot.match.winner).not.toBeNull()
		expect(result.snapshot.t).toBeLessThanOrEqual(54000)
		expect(result.facts.filter((f) => f.type === 'matchOver')).toHaveLength(1)
		const loser = result.snapshot.match.winner === 'A' ? 'B' : 'A'
		expect(result.snapshot.structures.find((s) => s.id === `core-${loser}`)).toMatchObject({
			dead: true,
			hp: 0,
		})
		expect(result.scores.A).toBeGreaterThan(0)
		expect(result.scores.B).toBeGreaterThan(0)
		expect(result.botP99Ms).toBeLessThan(1)
		console.log(
			`bots seed ${seed}: ${(result.snapshot.t * STEP).toFixed(2)} s, scores ${JSON.stringify(result.scores)}, bot-team p99 ${result.botP99Ms.toFixed(3)} ms`,
		)
	}, 180000)

for (const hz of [30, 144])
	test(`seed 2 has identical EVERY-tick snapshots and facts at ${hz} Hz and 60 Hz`, () => {
		const result = match(2, { hz, trace: true })
		expect(result.hashes).toEqual(reference.hashes)
		expect(result.snapshot).toEqual(reference.snapshot)
		expect(result.facts).toEqual(reference.facts)
	}, 180000)

test('default Practice with the human seat idle in base survives eight minutes, then ends naturally', () => {
	const result = match(tune.bots.seed, { idle: true })
	expect(result.snapshot.t * STEP).toBeGreaterThan(480)
	expect(result.snapshot.match.winner).not.toBeNull()
	expect(result.snapshot.heroes.find((h) => h.id === 'local').pos.x).toBeCloseTo(
		-tune.map.spawnX,
		2,
	)
	expect(result.invalid).toBe(0)
	console.log(`idle local seat: ${(result.snapshot.t * STEP).toFixed(2)} s`)
}, 180000)

function fixture() {
	const h = {
		id: 'bot',
		team: 'A',
		definition: HEROES.fletcher,
		body: { position: { x: 0, z: 0 }, radius: 0.45 },
		hp: 1400,
		maxHp: 1400,
		level: 1,
		spawn: { x: -48, z: 0 },
		cd: [0, 0, 0, 0, 0],
		dead: false,
		cast: null,
		attack: null,
		order: null,
	}
	const perceived = {
		tick: 1000,
		heroes: [
			{
				id: h.id,
				team: 'A',
				hp: 1400,
				maxHp: 1400,
				level: 1,
				pos: { x: 0, z: 0 },
				radius: 0.45,
				vel: { x: 0, z: 0 },
			},
		],
		minions: [],
		structures: [],
		shots: [],
		zones: [],
		globes: [],
	}
	const sim = {
		tick: 1000,
		heroes: [h],
		find: (id) =>
			sim.heroes.find((u) => u.id === id) ?? perceived.structures.find((u) => u.id === id),
		obstacles: [],
		ball: { state: null, carrying: () => false },
	}
	const brain = createBot({ id: h.id, team: h.team, file: -3 }, 1)
	const think = () => {
		perceived.tick = sim.tick
		const f = brain.frame(sim, perceived)
		sim.tick += 6
		expect(validIntent(f)).toBe(true)
		return f
	}
	return { h, perceived, sim, brain, think }
}

function opponent(f, hp = 1000) {
	const enemy = {
		...f.h,
		id: 'enemy',
		team: 'B',
		hp,
		body: { position: { x: -8, z: 0 }, radius: 0.45 },
	}
	f.sim.heroes.push(enemy)
	f.perceived.heroes.push({
		id: enemy.id,
		team: 'B',
		hp,
		maxHp: 1400,
		level: 1,
		pos: { x: -8, z: 0 },
		radius: 0.45,
		vel: { x: 0, z: 0 },
	})
	return f.perceived.heroes.at(-1)
}

test('Loose solves the positive intercept, including the equal-speed and unreachable cases', () => {
	for (const velocity of [
		{ x: 0, z: 5 },
		{ x: -20, z: 0 },
		{ x: 30, z: 0 },
	]) {
		const target = { pos: { x: 8, z: 0 }, vel: velocity },
			time = interceptTime({ x: 0, z: 0 }, target, 20)
		expect(Number.isFinite(time) && time >= 0).toBe(true)
		if (velocity.x !== 30)
			expect(Math.hypot(8 + velocity.x * time, velocity.z * time)).toBeCloseTo(20 * time, 8)
	}
})

for (const hazard of ['close Q', 'centre Rain'])
	test(`${hazard}: lagged tells fall back to Vault through core intents, not a body teleport`, () => {
		const f = fixture(),
			enemy = opponent(f),
			previous = tune.bots.normal.dodge
		const intents = createIntents()
		intents.use('pointClick')
		f.h.cd = [100, 0, 100, 0, 0]
		tune.bots.normal.dodge = 1
		try {
			let frame
			for (let i = 0; i < 3; i++) {
				f.sim.tick = 1000 + i * 6
				f.perceived.tick = f.sim.tick - 18
				if (hazard === 'close Q')
					enemy.cast = { ability: 'loose', dir: { x: 1, z: 0 }, left: 18 - i * 6 }
				else
					f.perceived.zones = [
						{ id: 1, team: 'B', x: 0, z: 0, ability: 'rain', radius: 2.5, left: 42 - i * 6 },
					]
				frame = f.brain.frame(f.sim, f.perceived)
				expect(validIntent(frame)).toBe(true)
				intents.feed(f.h.id, frame)
			}
			expect(intents.get(f.h.id).pressed.map((e) => e.action)).toContain('slot2')
			expect(f.h.body.position).toEqual({ x: 0, z: 0 })
			expect(Math.hypot(frame.aim.x, frame.aim.z)).toBeLessThanOrEqual(
				HEROES.fletcher.abilities.slot2.stats.range,
			)
		} finally {
			tune.bots.normal.dodge = previous
		}
	})

test('Rain safety counts a protected body at the edge, not just centres inside its circle', () => {
	const f = fixture(),
		main = opponent(f, 950)
	f.h.body.position = { x: 25.7, z: 0.85 }
	f.perceived.heroes[0].pos = { ...f.h.body.position }
	main.pos = { x: 28.8, z: 0 }
	f.sim.heroes[1].body.position = { ...main.pos }
	f.perceived.heroes.push(
		{ ...main, id: 'protected', hp: 1000, pos: { x: 26, z: 0 } },
		{ ...f.perceived.heroes[0], id: 'friend', pos: { x: 26.5, z: -1.5 } },
	)
	f.sim.heroes.push({
		...f.h,
		id: 'protected',
		team: 'B',
		hp: 1000,
		body: { position: { x: 26, z: 0 }, radius: 0.45 },
	})
	f.perceived.structures = [
		{
			id: 'tower-B',
			kind: 'tower',
			team: 'B',
			pos: { x: 18, z: 0 },
			radius: 1.2,
			hp: 2400,
			maxHp: 2400,
			vulnerable: true,
		},
	]
	const frame = f.think()
	expect(frame.pressed.some((e) => e.action === 'slot3')).toBe(false)
})

test('a failed dodge roll stays failed when a cast becomes its flying shot', () => {
	const f = fixture(),
		enemy = opponent(f),
		previous = tune.bots.normal.dodge
	f.h.cd = [100, 0, 100, 0, 0]
	tune.bots.normal.dodge = 0
	try {
		enemy.cast = { ability: 'loose', dir: { x: 1, z: 0 }, left: 18 }
		f.think()
		enemy.cast = null
		tune.bots.normal.dodge = 1
		for (let i = 0; i < 3; i++) {
			f.sim.tick = 1024 + i * 6
			f.perceived.shots = [
				{
					id: 1,
					owner: 'enemy',
					team: 'B',
					ability: 'loose',
					releaseTick: 1018,
					x: -6 + i * 2,
					z: 0,
					dx: 1,
					dz: 0,
					radius: 0.3,
					speed: 20,
					travelled: 2 + i * 2,
					range: 11,
				},
			]
			const frame = f.think()
			expect(frame.pressed.some((e) => e.action === 'slot2')).toBe(false)
			expect(f.brain.state).not.toBe('dodge')
		}
	} finally {
		tune.bots.normal.dodge = previous
	}
})

test('retreat latches through a successful dodge until ninety percent, and death clears the latch', () => {
	const f = fixture(),
		previous = tune.bots.normal.dodge
	tune.bots.normal.dodge = 1
	try {
		f.h.hp = f.h.maxHp * 0.34
		expect(f.think().order.x).toBe(-48)
		f.h.hp = f.h.maxHp * 0.5
		f.perceived.shots = [
			{
				id: 1,
				owner: 'enemy',
				team: 'B',
				ability: 'loose',
				releaseTick: 1000,
				x: -8,
				z: 0,
				dx: 1,
				dz: 0,
				range: 11,
				travelled: 0,
				radius: 0.3,
				speed: 20,
			},
		]
		for (let i = 0; i < 4; i++) f.think()
		expect(f.brain.state).toBe('dodge')
		expect(f.brain.retreating).toBe(true)
		f.perceived.shots = []
		f.sim.tick += 120
		f.think()
		expect(f.brain.state).toBe('retreat')
		f.h.hp = f.h.maxHp * 0.9
		f.think()
		expect(f.brain.retreating).toBe(false)
		f.h.hp = f.h.maxHp * 0.34
		f.think()
		f.h.dead = true
		f.think()
		expect(f.brain.retreating).toBe(false)
	} finally {
		tune.bots.normal.dodge = previous
	}
})

test('carriers move without ability edges and stop just inside the real throw reach', () => {
	const f = fixture()
	f.sim.ball.carrying = () => true
	f.sim.ball.state = { id: 1, state: 'carried', team: 'A', carrier: 'bot', pos: { x: 0, z: 0 } }
	f.perceived.structures = [
		{
			id: 'tower-B',
			kind: 'tower',
			team: 'B',
			pos: { x: 18, z: 0 },
			radius: tune.tower.radius,
			hp: tune.tower.hp,
			vulnerable: true,
		},
	]
	expect(f.think().pressed).toEqual([])
	f.h.body.position.x =
		18 - (tune.ball.range + tune.ball.radius + tune.tower.radius - tune.bots.throwMargin)
	const frame = f.think()
	expect(frame.pressed).toEqual([{ action: 'primary', at: { x: 18, z: 0 } }])
	f.h.ballThrow = {}
	expect(f.think().pressed).toEqual([])
})

test('attack orders survive moving targets without a stale re-click or per-tick replan', () => {
	const f = fixture()
	const enemy = {
		id: 'enemy',
		team: 'B',
		hp: 700,
		maxHp: 1400,
		level: 1,
		pos: { x: 3, z: 0 },
		radius: 0.45,
		vel: { x: 0, z: 0 },
	}
	f.perceived.heroes.push(enemy)
	f.sim.heroes.push({ ...enemy, body: { position: enemy.pos } })
	f.h.cd = [100, 100, 100, 0, 0]
	f.h.order = { kind: 'attack', target: 'enemy' }
	expect(f.think().order).toBeNull()
	enemy.pos.x += 3
	expect(f.think().order).toBeNull()
	f.h.order = null
	expect(f.think().order).toEqual({ x: 6, z: 0 })
})

test('tower safety refuses damage to a protected healthy hero; independent RNG streams and sims stay independent', () => {
	const f = fixture()
	f.h.body.position.x = 17
	const enemy = {
		id: 'enemy',
		team: 'B',
		hp: 1400,
		maxHp: 1400,
		level: 1,
		pos: { x: 18, z: 1 },
		radius: 0.45,
		vel: { x: 0, z: 0 },
	}
	f.perceived.heroes.push(enemy)
	f.sim.heroes.push({ ...enemy, body: { position: enemy.pos } })
	f.perceived.structures = [
		{
			id: 'tower-B',
			team: 'B',
			kind: 'tower',
			hp: 2400,
			pos: { x: 18, z: 0 },
			radius: 1.2,
			vulnerable: true,
		},
	]
	const frame = f.think()
	expect(frame.pressed).toEqual([])
	expect(frame.order).not.toEqual(enemy.pos)
	const a = botRandom(1, 'one'),
		b = botRandom(1, 'one'),
		other = botRandom(1, 'other')
	for (let i = 0; i < 100; i++) {
		other()
		expect(a()).toBe(b())
	}
	const separate = fixture()
	f.h.hp = 1
	f.think()
	separate.think()
	expect(separate.brain.retreating).toBe(false)
})

for (const z of [-0.8, 0.8])
	for (const blocked of [false, true])
		test(`off-centre Q at z=${z} dodges ${blocked ? 'across the line only when the near side is blocked' : 'away from the line on the near side'}`, () => {
			const f = fixture(),
				enemy = opponent(f),
				previous = tune.bots.normal.dodge
			f.h.body.position.z = z
			f.perceived.heroes[0].pos.z = z
			f.h.cd = [100, 100, 100, 0, 0]
			enemy.cast = { ability: 'loose', dir: { x: 1, z: 0 }, left: 18 }
			if (blocked) f.sim.obstacles = [{ x: 0, z: Math.sign(z) * 2, r: 0.2 }]
			tune.bots.normal.dodge = 1
			try {
				let frame
				for (let i = 0; i < 3; i++) {
					enemy.cast.left = 36 - i * 6
					frame = f.think()
				}
				expect(f.brain.state).toBe('dodge')
				expect(Math.sign(frame.order.z)).toBe(Math.sign(z) * (blocked ? -1 : 1))
				expect(Math.abs(frame.order.z)).toBeGreaterThan(f.h.body.radius + tune.loose.radius)
				expect(
					walkable(
						frame.order.x,
						frame.order.z,
						f.h.body.radius,
						tune.orders.clearance,
						f.sim.obstacles,
					),
				).toBe(true)
			} finally {
				tune.bots.normal.dodge = previous
			}
		})

test('centred dodges do not always choose the same side', () => {
	const previous = tune.bots.normal.dodge,
		directions = new Set()
	tune.bots.normal.dodge = 1
	try {
		for (let seed = 1; seed <= 12; seed++) {
			const f = fixture(),
				enemy = opponent(f)
			f.brain = createBot({ id: 'bot', team: 'A' }, seed)
			f.h.cd = [100, 100, 100, 0, 0]
			enemy.cast = { ability: 'loose', dir: { x: 1, z: 0 }, left: 18 }
			let frame
			for (let i = 0; i < 3; i++) {
				f.perceived.tick = f.sim.tick
				enemy.cast.left = 36 - i * 6
				frame = f.brain.frame(f.sim, f.perceived)
				f.sim.tick += 6
			}
			directions.add(Math.sign(frame.order.z))
		}
		expect([...directions].sort()).toEqual([-1, 1])
	} finally {
		tune.bots.normal.dodge = previous
	}
})

test('Ball preparation keeps three files spread instead of stacking at the pickup', () => {
	const goals = []
	for (const file of [-3, 0, 3]) {
		const f = fixture(),
			brain = createBot({ id: 'bot', team: 'A', file }, 1)
		f.h.body.position = { x: -20, z: file }
		f.perceived.heroes[0].pos = { ...f.h.body.position }
		f.sim.ball.state = { state: 'warning', spawnAt: 1300, pos: { x: 0, z: 0 } }
		const frame = brain.frame(f.sim, f.perceived)
		expect(frame.order).toEqual({ x: -tune.bots.shadowRange, z: file })
		goals.push(frame.order)
	}
	expect(Math.abs(goals[0].z - goals[2].z)).toBeGreaterThan(2 * (tune.rain.radius + 0.45))
})

test('a nearby enemy takes priority over the Ball countdown', () => {
	const f = fixture(),
		enemy = opponent(f)
	enemy.pos = { x: 3, z: 0 }
	f.sim.heroes[1].body.position = { ...enemy.pos }
	f.h.cd = [100, 100, 100, 0, 0]
	f.sim.ball.state = { state: 'warning', spawnAt: 1300, pos: { x: 0, z: 0 } }
	const frame = f.think()
	expect(f.brain.state).toBe('fight')
	expect(frame.order).toEqual(enemy.pos)
	expect(frame.pressed).toEqual([])
})

test('a four-metre Ball throw goes through hard-bot perception lag and cannot earn an instant Vault', () => {
	const f = fixture(),
		previous = tune.bots.hard.dodge
	f.h.cd = [100, 0, 100, 0, 0]
	f.sim.lane = { minions: [], structures: [], globes: [], vulnerable: () => true }
	f.sim.shots = []
	f.sim.zones = []
	const bots = createBots([{ id: 'bot', team: 'A', difficulty: 'hard' }], 1)
	const frames = [],
		seen = [],
		original = bots.brains[0].frame
	bots.brains[0].frame = (sim, perceived) => {
		seen.push({ tick: sim.tick, perceived: perceived.tick, ball: perceived.ball })
		return original(sim, perceived)
	}
	const intents = { feed: (_, frame) => frames.push({ tick: f.sim.tick, frame }) }
	tune.bots.hard.dodge = 1
	try {
		// Align release with a think tick so the old live read would have time to Vault.
		for (; f.sim.tick < 1024; f.sim.tick++) bots.step(f.sim, intents)
		for (; f.sim.tick < 1060; f.sim.tick++) {
			const travelled = (f.sim.tick - 1024) * STEP * tune.ball.speed
			f.sim.ball.state =
				travelled < 4
					? {
							id: 1,
							state: 'flying',
							team: 'B',
							shot: {
								x: -4 + travelled,
								z: 0,
								dx: 1,
								dz: 0,
								speed: tune.ball.speed,
								radius: tune.ball.radius,
								range: tune.ball.range,
								travelled,
							},
						}
					: null
			bots.step(f.sim, intents)
		}
		const first = seen.find((s) => s.ball)
		expect(first.tick - 1024).toBe(Math.round(tune.bots.hard.reaction / STEP))
		expect(first.ball.shot.x).toBe(-4)
		expect(seen.find((s) => s.tick === 1042).ball).not.toBeNull()
		expect(frames.some(({ frame }) => frame.pressed.some((e) => e.action === 'slot2'))).toBe(false)
	} finally {
		tune.bots.hard.dodge = previous
	}
})

function protectedPoke() {
	const f = fixture(),
		enemy = opponent(f, 1400)
	f.h.body.position = { x: 5.5, z: 0 }
	f.perceived.heroes[0].pos = { ...f.h.body.position }
	enemy.pos = { x: 16, z: 0 }
	f.sim.heroes[1].body.position = { ...enemy.pos }
	f.perceived.structures = [
		{
			id: 'tower-B',
			team: 'B',
			kind: 'tower',
			hp: 2400,
			maxHp: 2400,
			pos: { x: 18, z: 0 },
			radius: 1.2,
			vulnerable: true,
		},
	]
	return f
}

test('Q pokes a tower-protected hero from outside the tower even when the basic attack spot is unsafe', () => {
	const f = protectedPoke(),
		previous = tune.bots.normal.jitter
	f.h.cd = [0, 100, 100, 0, 0]
	tune.bots.normal.jitter = 0
	try {
		let frame
		for (let i = 0; i < 4; i++) frame = f.think()
		expect(frame.pressed.map((e) => e.action)).toEqual(['slot1'])
		expect(frame.order).toBeNull()
		expect(f.h.body.position.x).toBeLessThan(18 - tune.tower.range - f.h.body.radius)
	} finally {
		tune.bots.normal.jitter = previous
	}
})

test('Rain has its own safe casting position rather than inheriting the unsafe basic attack spot', () => {
	const f = protectedPoke()
	f.h.body.position.x = 6.5
	f.perceived.heroes[0].pos = { ...f.h.body.position }
	f.h.cd = [100, 100, 0, 0, 0]
	const frame = f.think()
	expect(frame.pressed.map((e) => e.action)).toEqual(['slot3'])
	expect(frame.order).toBeNull()
})

test('a bot with no legal attack backs out of protected Q range instead of soaking free poke', () => {
	const f = protectedPoke()
	f.h.cd = [100, 100, 100, 0, 0]
	const frame = f.think()
	expect(frame.pressed).toEqual([])
	expect(f.brain.state).toBe('backoff')
	expect(Math.hypot(frame.order.x - 16, frame.order.z)).toBeGreaterThan(tune.loose.range)
})

test('backswing stutter keeps the current combat file instead of snapping to the lane file', () => {
	const f = fixture(),
		enemy = opponent(f)
	f.h.body.position = { x: 0, z: 4 }
	f.perceived.heroes[0].pos = { ...f.h.body.position }
	enemy.pos = { x: 3, z: 4 }
	f.sim.heroes[1].body.position = { ...enemy.pos }
	f.h.cd = [100, 100, 100, 0, 0]
	f.h.attack = { phase: 'backswing' }
	expect(f.think().order).toEqual({ x: -tune.bots.stutter, z: 4 })
})

for (const health of [0.85, 1])
	test(`outnumbered at ${health * 100}% HP retreats only until support returns`, () => {
		const f = fixture(),
			enemy = opponent(f, 1400)
		f.h.hp = f.h.maxHp * health
		f.perceived.heroes[0].hp = f.h.hp
		f.perceived.heroes.push({ ...enemy, id: 'enemy-2' }, { ...enemy, id: 'enemy-3' })
		expect(f.think().order).toEqual(f.h.spawn)
		expect(f.brain.retreating).toBe(true)
		f.perceived.heroes = f.perceived.heroes.slice(0, 1)
		f.think()
		expect(f.brain.retreating).toBe(false)
		expect(f.brain.state).not.toBe('retreat')
	})
