import { afterEach, expect, test } from 'bun:test'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { STEP } from '../src/core/app.js'
import { createIntents, neutralFrame } from '../src/core/intents.js'
import { createSim } from '../src/plugins/moba/sim.js'
import { buildColliders } from '../src/plugins/moba/obstacles.js'
import { createBall } from '../src/plugins/moba/ball.js'
import { createBallView } from '../src/plugins/moba/ball-view.js'
import { validFact } from '../src/plugins/moba/index.js'
import { tune } from '../src/plugins/moba/tune.js'

await RAPIER.init({})
const ticks = (s) => Math.round(s / STEP)
let sim, world, intents, facts, unbuild
function boot(scripted = []) {
	world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
	world.timestep = STEP
	unbuild = buildColliders(world, RAPIER)
	intents = createIntents()
	intents.use('pointClick')
	facts = []
	sim = createSim({
		scene: new THREE.Scene(),
		world,
		RAPIER,
		intents,
		lane: true,
		heroes: [
			{ id: 'A', team: 'A' },
			{ id: 'B', team: 'B' },
		],
		scripted,
		present: (f) => facts.push(f),
	})
}
function step(n = 1) {
	for (let i = 0; i < n; i++) {
		sim.step()
		intents.age(STEP)
	}
}
afterEach(() => {
	if (sim) {
		sim.dispose()
		unbuild()
		world.free()
		sim = null
	}
})
function fixture() {
	const hero = (id, team, x) => ({
		id,
		team,
		hp: 1000,
		maxHp: 1000,
		dead: false,
		body: { position: { x, z: 0 }, radius: 0.45, velocity: { x: 0, z: 0 }, dashing: false },
	})
	const a = hero('A', 'A', 0),
		b = hero('B', 'B', 40)
	const structure = {
		...hero('tower-B', 'B', 4),
		structure: true,
		body: { position: { x: 4, z: 0 }, radius: 1.2 },
		maxHp: 2400,
		hp: 2400,
	}
	const facts = [],
		obstacles = []
	let shielded = false
	const ball = createBall({
		heroes: [a, b],
		lane: { structures: [structure], vulnerable: () => !shielded },
		obstacles,
		present: (f) => facts.push(f),
		damage: (_shot, u, d) => {
			u.hp -= d
			u.dead = u.hp <= 0
		},
	})
	let t = ticks(tune.ball.first)
	const advance = (n = 1) => {
		for (let i = 0; i < n; i++) {
			ball.begin(t++)
			ball.finish(STEP)
		}
	}
	const pickup = () => {
		advance(ticks(tune.ball.channel) + 1)
		expect(ball.carrying(a)).toBe(true)
	}
	const throwAt = (at) => {
		ball.control(
			a,
			{ ...neutralFrame(), pressed: [{ action: 'primary', at }] },
			{ consume() {} },
			{ x: 1, z: 0 },
		)
		for (let i = 0; i <= ticks(tune.ball.tell); i++) {
			ball.begin(t++)
			ball.control(a, neutralFrame(), { consume() {} }, { x: 1, z: 0 })
			ball.finish(STEP)
		}
		advance(ticks(1))
	}
	return {
		a,
		b,
		structure,
		ball,
		facts,
		obstacles,
		advance,
		pickup,
		throwAt,
		shield: () => {
			shielded = true
		},
	}
}

test('fixed schedule, warning, lifetime and late interval ignore the preceding outcome', () => {
	const f = fixture()
	f.ball.begin(ticks(150) - 1)
	expect(f.ball.state).toBeNull()
	f.ball.begin(ticks(150))
	expect(f.ball.state.state).toBe('warning')
	f.ball.begin(ticks(180))
	expect(f.ball.state.state).toBe('loose')
	f.ball.begin(ticks(225))
	expect(f.ball.state).toBeNull()
	for (const time of [300, 330, 450, 480, 600, 630]) f.ball.begin(ticks(time))
	expect(f.facts.filter((e) => e.type === 'ballSpawn')).toHaveLength(4)
	expect(f.ball.nextBall).toBe(ticks(720))
	expect(f.facts.every(validFact)).toBe(true)
})

test('damage interrupts pickup without restarting that tick; moving cancels it', () => {
	const f = fixture()
	f.advance()
	expect(f.ball.state.state).toBe('channel')
	f.advance(10)
	f.ball.hurt(f.a)
	expect(f.ball.state.state).toBe('loose')
	f.ball.finish(STEP)
	expect(f.ball.state.state).toBe('loose')
	f.advance()
	expect(f.ball.state.state).toBe('channel')
	f.a.body.velocity.x = 1
	f.advance()
	expect(f.ball.state.state).toBe('loose')
	expect(f.facts.filter((e) => e.type === 'ballInterrupted')).toHaveLength(2)
})

test('vulnerable structure loses 30% max HP, is silenced, and spends the Ball', () => {
	const f = fixture()
	f.pickup()
	f.throwAt({ x: 10, z: 0 })
	expect(f.structure.hp).toBe(1680)
	expect(f.structure.silentUntil).toBeGreaterThan(ticks(180))
	expect(f.ball.state).toBeNull()
	expect(f.facts.find((e) => e.type === 'ballHit').kind).toBe('structure')
})

test('shielded structure bounces without damage or silence', () => {
	const f = fixture()
	f.shield()
	f.pickup()
	f.throwAt({ x: 10, z: 0 })
	expect(f.structure.hp).toBe(2400)
	expect(f.structure.silentUntil).toBeUndefined()
	expect(f.ball.state.state).toBe('loose')
	expect(f.facts.some((e) => e.type === 'ballBounce' && e.reason === 'shielded')).toBe(true)
})

test('hero first hit takes damage and stun, then drops before the structure behind it', () => {
	const f = fixture()
	f.b.body.position.x = 2
	f.pickup()
	f.throwAt({ x: 10, z: 0 })
	expect(f.b.hp).toBe(700)
	expect(f.b.stunUntil).toBeGreaterThan(ticks(180))
	expect(f.structure.hp).toBe(2400)
	expect(f.ball.state.state).toBe('loose')
})

test('hedge bounce and full-range miss both land with a one-second lock', () => {
	for (const cover of [true, false]) {
		const f = fixture()
		f.structure.dead = true
		if (cover) f.obstacles.push({ kind: 'hedge', x: 2, z: 0, halfX: 0.5, halfZ: 1 })
		f.pickup()
		f.throwAt({ x: 10, z: 0 })
		expect(f.ball.state.state).toBe('loose')
		expect(f.facts.find((e) => e.type === 'ballDrop').reason).toBe(cover ? 'cover' : 'miss')
		if (!cover) expect(f.ball.state.pos.x).toBeCloseTo(5)
	}
})

test('death drops carried Ball, lifetime persists, and re-pickup waits exactly one second', () => {
	const f = fixture()
	f.pickup()
	const popAt = f.ball.state.popAt
	f.a.dead = true
	f.ball.hurt(f.a)
	const unlock = f.ball.state.pickableAt
	f.a.dead = false
	f.ball.begin(unlock - 1)
	f.ball.finish(STEP)
	expect(f.ball.state.state).toBe('loose')
	f.ball.begin(unlock)
	f.ball.finish(STEP)
	expect(f.ball.state.state).toBe('channel')
	expect(f.ball.state.popAt).toBe(popAt)
	f.ball.begin(popAt)
	expect(f.ball.state).toBeNull()
})

test('real fast-forwarded scripted match picks up and scores a vulnerable structure', () => {
	boot(['B'])
	while (sim.tick < ticks(900) && !sim.lane.match.winner) step()
	console.log(
		'Ball real-play proof:',
		JSON.stringify({
			winSeconds: sim.tick * STEP,
			hits: facts
				.filter((f) => f.type === 'ballHit')
				.map((f) => ({ seconds: f.tick * STEP, target: f.target })),
		}),
	)
	expect(facts.some((f) => f.type === 'ballPickup' && f.hero === 'B')).toBe(true)
	expect(facts.some((f) => f.type === 'ballHit' && f.kind === 'structure')).toBe(true)
	expect(sim.lane.match.winner).toBe('B')
	expect(facts.every(validFact)).toBe(true)
}, 30000)

function earlyBall() {
	const first = tune.ball.first
	try {
		tune.ball.first = STEP
		boot()
	} finally {
		tune.ball.first = first
	}
	sim.heroes[0].body.place(0, 1.05, 0)
	step()
}
function damageHero(h, amount) {
	const p = h.body.position
	sim.shots.push({
		id: 9999 + sim.tick,
		owner: h.team === 'A' ? 'B' : 'A',
		team: h.team === 'A' ? 'B' : 'A',
		target: h.id,
		slot: 'primary',
		x: p.x,
		z: p.z,
		dx: 1,
		dz: 0,
		speed: 30,
		radius: 0.1,
		range: 100,
		travelled: 0,
		passed: [],
		damage: amount,
	})
	step()
}
function press(action, at = { x: 5, z: 0 }) {
	intents.feed('A', { ...neutralFrame(), pressed: [{ action, at }] })
	step()
}

test('real damage interrupts the last pickup tick; carrier restrictions and slot-five throwing use intents', () => {
	earlyBall()
	const h = sim.heroes[0]
	step(ticks(tune.ball.channel) - 1)
	damageHero(h, 10)
	expect(sim.ball.state.state).toBe('loose')
	expect(facts.some((f) => f.type === 'ballInterrupted' && f.reason === 'damage')).toBe(true)
	step(ticks(tune.ball.channel) + 2)
	expect(sim.ball.carrying(h)).toBe(true)
	intents.feed('A', {
		...neutralFrame(),
		order: { ...sim.lane.structures.find((u) => u.id === 'tower-B').body.position },
	})
	step()
	expect(h.order.kind).toBe('move')
	intents.feed('A', { ...neutralFrame(), order: { x: 5, z: 0 } })
	step()
	expect(h.body.speedMul).toBe(tune.ball.carrySpeed)
	press('slot5')
	expect(h.cast).toBeNull()
	expect(h.attack).toBeNull()
	expect(h.ballThrow).not.toBeNull()
	press('stop')
	expect(h.ballThrow).toBeNull()
	expect(sim.ball.carrying(h)).toBe(true)
	expect(facts.some((f) => f.type === 'ballDenied')).toBe(true)
	press('slot2')
	step(ticks(tune.ball.tell))
	expect(h.body.dashing).toBe(false)
	expect(sim.snapshot().ball.state).toBe('flying')
	expect(sim.snapshot().ball.shot.dir.x).toBeCloseTo(1)
})

for (const state of ['channel', 'carried', 'windup', 'flying'])
	test(`death and respawn during Ball ${state}`, () => {
		earlyBall()
		const h = sim.heroes[0]
		if (state !== 'channel') step(ticks(tune.ball.channel) + 1)
		if (state === 'windup' || state === 'flying') press('primary')
		if (state === 'flying') step(ticks(tune.ball.tell))
		const popAt = sim.ball.state.popAt
		damageHero(h, h.hp)
		expect(h.dead).toBe(true)
		expect(h.ballThrow).toBeNull()
		expect(sim.ball.state.state).toBe(state === 'flying' ? 'flying' : 'loose')
		if (state === 'carried' || state === 'windup') {
			expect(sim.ball.state.pickableAt).toBe(sim.tick + ticks(tune.ball.lock))
			expect(facts.some((f) => f.type === 'ballDrop' && f.reason === 'death')).toBe(true)
		}
		step(h.respawnTick - sim.tick)
		expect(h.dead).toBe(false)
		expect(h.ballThrow).toBeNull()
		expect(h.stunUntil).toBe(0)
		expect(sim.ball.state.popAt).toBe(popAt)
		expect(sim.ball.state.carrier).toBeNull()
	})

test('silence cancels a gun tell, lasts exactly ten seconds and resumes with a fresh tell', () => {
	boot()
	const tower = sim.lane.structures.find((u) => u.id === 'tower-B')
	const h = sim.heroes[0]
	h.body.place(tower.body.position.x - 4, 1.05, 0)
	tower.silentUntil = sim.tick + ticks(tune.ball.silence)
	tower.attack = { left: 1, total: 18, target: h.id }
	tower.target = h.id
	const until = tower.silentUntil
	step(until - sim.tick - 1)
	expect(tower.attack).toBeNull()
	expect(facts.some((f) => f.type === 'projectile' && f.hero === tower.id)).toBe(false)
	step()
	expect(tower.attack.total * STEP).toBeGreaterThanOrEqual(0.3)
	step(tower.attack.left)
	expect(facts.some((f) => f.type === 'projectile' && f.hero === tower.id)).toBe(true)
})

test('a hero hit stuns an in-progress dash, denies casts, then respawn clears stun', () => {
	earlyBall()
	const a = sim.heroes[0],
		b = sim.heroes[1]
	step(ticks(tune.ball.channel) + 1)
	b.body.place(2, 1.05, 0)
	b.body.dash({ x: 0, z: 1 }, { distance: 0.1, time: 5 })
	press('primary')
	while (!facts.some((f) => f.type === 'ballHit')) step()
	expect(b.body.dashing).toBe(false)
	const position = { x: b.body.position.x, z: b.body.position.z }
	intents.feed('B', { ...neutralFrame(), pressed: [{ action: 'slot1', at: { x: 0, z: 0 } }] })
	step()
	expect(b.cast).toBeNull()
	expect(Math.hypot(b.body.position.x - position.x, b.body.position.z - position.z)).toBeLessThan(
		0.001,
	)
	expect(facts.some((f) => f.type === 'denied' && f.hero === 'B')).toBe(true)
	expect(a.dead).toBe(false)
	damageHero(b, b.hp)
	step(b.respawnTick - sim.tick)
	expect(b.dead).toBe(false)
	expect(b.stunUntil).toBe(0)
})

test('warning and pickup fills blend within a tick; disposal and concurrent objectives are isolated', () => {
	const f = fixture(),
		other = fixture()
	const scene = new THREE.Scene(),
		view = createBallView(scene)
	f.ball.begin(ticks(165))
	const display = { ball: f.ball, heroes: [], lane: { structures: [] }, tick: ticks(165) }
	view.update(display, 0, 'A', null)
	const fill = view.root.children[1].geometry.attributes.position
	const x = fill.getX(fill.count - 1),
		y = fill.getY(fill.count - 1)
	view.update(display, 0.5, 'A', null)
	expect(Math.hypot(fill.getX(fill.count - 1) - x, fill.getY(fill.count - 1) - y)).toBeGreaterThan(
		0,
	)
	f.ball.begin(ticks(180))
	f.ball.finish(STEP)
	display.tick = ticks(180)
	view.update(display, 0, 'A', null)
	const channel = view.root.children[2].geometry.attributes.position
	const cy = channel.getY(channel.count - 1)
	view.update(display, 0.5, 'A', null)
	expect(channel.getY(channel.count - 1)).not.toBe(cy)
	expect(other.ball.state).toBeNull()
	view.dispose()
	expect(scene.children).toHaveLength(0)
})

test('Ball swept queries fit a 1 ms median tick budget with 24 cover obstacles', () => {
	const f = fixture()
	f.pickup()
	f.structure.dead = true
	for (let i = 0; i < 24; i++) f.obstacles.push({ x: 20 + i, z: 10, r: 1 })
	f.ball.control(
		f.a,
		{ ...neutralFrame(), pressed: [{ action: 'primary', at: { x: 10, z: 0 } }] },
		{ consume() {} },
		{ x: 1, z: 0 },
	)
	f.ball.begin(ticks(182))
	f.ball.control(f.a, neutralFrame(), { consume() {} }, { x: 1, z: 0 })
	const samples = []
	for (let batch = 0; batch < 7; batch++) {
		const start = performance.now()
		for (let i = 0; i < 200; i++) {
			const shot = f.ball.state.shot
			shot.x = 0
			shot.z = 0
			shot.travelled = 0
			f.ball.finish(STEP)
		}
		samples.push((performance.now() - start) / 200)
	}
	samples.sort((a, b) => a - b)
	expect(samples[3]).toBeLessThan(1)
})
