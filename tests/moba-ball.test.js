import { afterEach, expect, test } from 'bun:test'
import * as THREE from 'three'
import { STEP } from '../src/core/app.js'
import { neutralFrame, pointClick } from '../src/core/intents.js'
import { createBall } from '../src/plugins/moba/ball.js'
import { interceptShot } from '../src/plugins/moba/skillshot.js'
import { createBallView } from '../src/plugins/moba/ball-view.js'
import { validFact } from '../src/plugins/moba/index.js'
import { createFeedback } from '../src/plugins/moba/feedback.js'
import { styleId } from '../src/core/stylepass.js'
import { tune } from '../src/plugins/moba/tune.js'
import { bootMoba, ticks } from './moba-harness.js'

let harness, sim, intents, facts
function boot(scripted = [], intercept = null) {
	harness = bootMoba({ scripted, intercept })
	;({ sim, intents, facts } = harness)
}
const step = (n = 1) => harness.step(n)
afterEach(() => {
	harness?.dispose()
	harness = null
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
		obstacles = [],
		heroes = [a, b]
	let shielded = false
	const ball = createBall({
		heroes,
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
		heroes,
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

test('a scheduled replacement clears the old carrier windup and reports its denial', () => {
	const previous = tune.ball.interval
	tune.ball.interval = 15
	try {
		const f = fixture()
		f.pickup()
		const next = f.ball.nextBall
		f.ball.begin(next - 1)
		f.ball.control(
			f.a,
			{ ...neutralFrame(), pressed: [{ action: 'primary', at: { x: 4, z: 0 } }] },
			{ consume() {} },
			{ x: 1, z: 0 },
		)
		expect(f.a.ballThrow).not.toBeNull()
		f.ball.begin(next)
		expect(f.a.ballThrow).toBeNull()
		expect(f.ball.state.state).toBe('loose')
		expect(f.facts.some((f) => f.type === 'ballDenied' && f.reason === 'replaced')).toBe(true)
		expect(f.facts.some((f) => f.type === 'ballPop' && f.reason === 'replaced')).toBe(true)
	} finally {
		tune.ball.interval = previous
	}
})

test('fixed schedule, warning, lifetime and late interval ignore the preceding outcome', () => {
	const f = fixture()
	const warning = tune.ball.first - tune.ball.warning
	f.ball.begin(ticks(warning) - 1)
	expect(f.ball.state).toBeNull()
	f.ball.begin(ticks(warning))
	expect(f.ball.state.state).toBe('warning')
	f.ball.begin(ticks(tune.ball.first))
	expect(f.ball.state.state).toBe('loose')
	f.ball.begin(ticks(tune.ball.first + tune.ball.life))
	expect(f.ball.state).toBeNull()
	const second = tune.ball.first + tune.ball.interval
	f.ball.begin(ticks(second))
	expect(f.facts.filter((e) => e.type === 'ballSpawn')).toHaveLength(2)
	expect(f.ball.nextBall).toBe(ticks(second + tune.ball.interval))
	while (f.ball.nextBall < ticks(tune.match.late)) f.ball.begin(f.ball.nextBall)
	const lateSpawn = f.ball.nextBall
	f.ball.begin(lateSpawn)
	expect(f.ball.nextBall).toBe(lateSpawn + ticks(tune.ball.lateInterval))
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
	expect(f.facts.find((e) => e.type === 'ballDrop')).toMatchObject({
		hero: f.a.id,
		reason: 'death',
	})
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

test.if(process.env.SLOW === '1')(
	'real fast-forwarded scripted match picks up and scores a vulnerable structure',
	() => {
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
	},
	120000,
)

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

test('silence cancels a gun tell, lasts exactly six seconds and resumes with a fresh tell', () => {
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

test('held RMB resends queue through the throw windup instead of cancelling it', () => {
	earlyBall()
	step(ticks(tune.ball.channel) + 1)
	const h = sim.heroes[0]
	const d = {
		keys: ['KeyQ'],
		time: 0,
		activeDevice: () => 'keyboard',
		consumeKeys: () => d.keys.splice(0),
		consumeOrder: () => false,
		orderDown: () => true,
		now: () => d.time,
		pad: () => null,
		consumeSlot: () => null,
		consumePress: () => false,
		consumeRelease: () => false,
		consumeDash: () => false,
		consumeJump: () => false,
	}
	const sample = pointClick(d, () => ({ x: 5, z: 0 }))
	const start = sim.tick
	for (let i = 0; i <= ticks(tune.ball.tell); i++) {
		d.time = i * STEP * 1000
		intents.feed('A', sample())
		step()
	}
	expect(facts.filter((f) => f.type === 'order' && f.tick > start).length).toBeGreaterThanOrEqual(3)
	expect(facts.filter((f) => f.type === 'ballThrow')).toHaveLength(1)
	expect(facts.some((f) => f.type === 'ballDenied')).toBe(false)
	expect(h.order.kind).toBe('move')
	expect(sim.ball.state.state).toBe('flying')
})

test('opposing eligible heroes contest regardless of list order; a contest interrupts an existing channel', () => {
	for (const reverse of [false, true]) {
		const f = fixture()
		if (reverse) f.heroes.reverse()
		f.b.body.position.x = 0.4
		f.advance(10)
		expect(f.ball.state.state).toBe('loose')
		expect(f.ball.state.contested).toBe(true)
		expect(f.facts.filter((e) => e.type === 'ballContested')).toHaveLength(1)
		f.b.body.position.x = 4
		f.advance()
		expect(f.ball.state.channel.hero).toBe('A')
		f.b.body.position.x = 0.4
		f.advance()
		expect(f.ball.state.channel).toBeNull()
		expect(f.facts.filter((e) => e.type === 'ballContested')).toHaveLength(2)
		expect(f.facts.some((e) => e.type === 'ballInterrupted' && e.reason === 'contested')).toBe(true)
	}
})

test('an uncontested pickup belongs to the closest eligible ally, not seat zero', () => {
	const f = fixture()
	f.a.body.position.x = 0.8
	const ally = { ...f.a, id: 'ally', body: { ...f.a.body, position: { x: 0.2, z: 0 } } }
	f.heroes.push(ally)
	f.advance()
	expect(f.ball.state.channel.hero).toBe('ally')
})

test('the shared intercept hook catches at 2 m before body damage and gives the Ball without a channel', () => {
	const f = fixture()
	f.pickup()
	f.b.body.position.x = 2
	f.ball.control(
		f.a,
		{ ...neutralFrame(), pressed: [{ action: 'primary', at: { x: 5, z: 0 } }] },
		{ consume() {} },
		{ x: 1, z: 0 },
	)
	f.ball.begin(ticks(182))
	f.ball.control(f.a, neutralFrame(), { consume() {} }, { x: 1, z: 0 })
	const popAt = f.ball.state.popAt
	let calls = 0
	f.ball.finish(STEP, ({ kind, from, to, ball }) => {
		calls++
		expect(kind).toBe('ball')
		expect(from.x).toBe(0)
		expect(to.x).toBeGreaterThan(0)
		// Mitts faces -x: this segment starts inside her 2 m frontal catch cone.
		expect(f.b.body.position.x - from.x).toBe(2)
		return ball.give(f.b)
	})
	expect(calls).toBe(1)
	expect(f.ball.carrying(f.b)).toBe(true)
	expect(f.ball.state.channel).toBeNull()
	expect(f.ball.state.shot).toBeNull()
	expect(f.ball.state.popAt).toBe(popAt)
	expect(f.b.hp).toBe(1000)
	expect(f.b.stunUntil).toBeUndefined()
	expect(f.facts.some((e) => e.type === 'ballHit')).toBe(false)
	expect(f.facts.at(-1)).toMatchObject({ type: 'ballPickup', hero: 'B', reason: 'caught' })
	f.b.dead = true
	expect(f.ball.give(f.b)).toBe(false)
	f.ball.begin(popAt)
	expect(f.ball.give(f.a)).toBe(false)
})

test('Backboard intercept drops at its contact point with a lock; redirect hooks leave the shot alive', () => {
	for (const redirect of [false, true]) {
		const f = fixture()
		f.pickup()
		f.ball.control(
			f.a,
			{ ...neutralFrame(), pressed: [{ action: 'primary', at: { x: 5, z: 0 } }] },
			{ consume() {} },
			{ x: 1, z: 0 },
		)
		f.ball.begin(ticks(182))
		f.ball.control(f.a, neutralFrame(), { consume() {} }, { x: 1, z: 0 })
		f.ball.finish(STEP, ({ shot, ball }) => {
			if (redirect) {
				shot.dx = 0
				shot.dz = 1
				return false
			}
			return ball.drop('backboard', { x: 0.1, z: 0 })
		})
		if (redirect) {
			expect(f.ball.state.state).toBe('flying')
			expect(f.ball.state.pos.z).toBeGreaterThan(0)
		} else {
			expect(f.ball.state.state).toBe('loose')
			expect(f.ball.state.pos.x).toBeCloseTo(0.1)
			expect(f.ball.state.pickableAt).toBe(ticks(182 + tune.ball.lock))
		}
		expect(f.facts.some((e) => e.type === 'ballHit')).toBe(false)
	}
})

test('ordinary skillshots use the same pre-collision intercept interface', () => {
	let caught = false
	boot([], ({ kind, shot, from, to, ball }) => {
		expect(kind).toBe('projectile')
		expect(ball.give).toBeFunction()
		expect(to.x).toBeGreaterThanOrEqual(from.x)
		if (shot.slot !== 'slot1') return false
		caught = true
		return true
	})
	sim.heroes[0].body.place(0, 1.05, 0)
	sim.heroes[1].body.place(2, 1.05, 0)
	press('slot1')
	for (let i = 0; i < ticks(1) && !caught; i++) step()
	expect(caught).toBe(true)
	expect(facts.some((f) => f.type === 'expired' && f.reason === 'intercepted')).toBe(true)
	expect(sim.shots.some((s) => s.slot === 'slot1')).toBe(false)
	expect(sim.heroes[1].hp).toBe(sim.heroes[1].maxHp)
})

test('Ball prints stay flat, the strip matches collision width, and release interpolates from carry height', () => {
	const f = fixture()
	f.pickup()
	f.a.body.mesh = new THREE.Group()
	const scene = new THREE.Scene(),
		view = createBallView(scene)
	const display = { ball: f.ball, heroes: f.heroes, lane: { structures: [] }, tick: ticks(181) }
	view.update(display, 0, 'A', { x: 5, z: 0 })
	const [, , , ball, shadow, aim, outline] = view.root.children
	expect(ball.children[0].material.uniforms.uStyleId.value).toBe(styleId('cream'))
	expect(ball.children.at(-1).material.uniforms.uStyleId.value).toBe(styleId('teamA'))
	expect(aim.scale.y).toBe(tune.ball.radius * 2)
	expect(outline.scale.y).toBeGreaterThan(aim.scale.y)
	expect(shadow.visible).toBe(false)
	expect(shadow.scale.x).toBe(shadow.scale.y)
	view.root.traverse((o) => {
		if (o.isMesh) expect(o.material.uniforms.uFlat.value).toBe(1)
	})
	f.ball.control(
		f.a,
		{ ...neutralFrame(), pressed: [{ action: 'primary', at: { x: 5, z: 0 } }] },
		{ consume() {} },
		{ x: 1, z: 0 },
	)
	f.ball.begin(ticks(182))
	f.ball.control(f.a, neutralFrame(), { consume() {} }, { x: 1, z: 0 })
	f.ball.finish(STEP)
	display.tick = f.ball.state.releaseTick
	view.update(display, 0, 'A', null)
	expect(ball.position.x).toBe(0)
	expect(ball.position.y).toBe(tune.ballView.carryHeight)
	view.update(display, 0.5, 'A', null)
	expect(ball.position.x).toBeGreaterThan(0)
	expect(ball.position.x).toBeLessThan(f.ball.state.pos.x)
	expect(ball.position.y).toBeLessThan(tune.ballView.carryHeight)
	expect(ball.position.y).toBeGreaterThan(tune.ballView.height)
	expect(shadow.visible).toBe(true)
	display.tick += ticks(tune.ballView.flightEase)
	view.update(display, 0, 'A', null)
	expect(ball.position.y).toBe(tune.ballView.height)
	view.dispose()
})

test('goal confetti has continuous random scatter, not three speed rings, and interpolates between ticks', () => {
	let seed = 123
	const random = () => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
		return seed / 4294967296
	}
	const scene = new THREE.Scene(),
		view = createBallView(scene, random)
	const display = { ball: { state: null }, heroes: [], lane: { structures: [] }, tick: 12 }
	view.present({ type: 'ballHit', kind: 'structure', point: { x: 0, y: 1, z: 0 }, tick: 0 })
	view.update(display, 0, 'A', null)
	const confetti = view.root.children[7]
	const radii = confetti.children.map((chip) => Math.hypot(chip.position.x, chip.position.z))
	expect(new Set(radii.map((r) => r.toFixed(3))).size).toBeGreaterThan(tune.ballConfetti.count / 2)
	expect(Math.max(...radii)).toBeGreaterThan(1)
	const p = confetti.children[0].position.clone()
	view.update(display, 0.5, 'A', null)
	expect(confetti.children[0].position.distanceTo(p)).toBeGreaterThan(0)
	view.dispose()
})

test('Ball possession announcements are relative; a structure goal shakes, freezes and cues once', () => {
	const previous = globalThis.document
	globalThis.document = { querySelector: () => null }
	const banners = [],
		shakes = [],
		sounds = []
	const body = { squash() {} }
	const sim = {
		tick: 1,
		heroes: [
			{ id: 'local', team: 'A', body },
			{ id: 'ally', team: 'A', body },
			{ id: 'enemy', team: 'B', body },
		],
		dummies: [],
		lane: { structures: [{ id: 'tower-B', team: 'B' }], minions: [] },
	}
	const feedback = createFeedback({
		juice: { burst() {} },
		sfx: { ballPickup: () => sounds.push('pickup'), ballGoal: () => sounds.push('goal') },
		camera: { shake: (amount) => shakes.push(amount), kick() {} },
		input: { rumble() {} },
		view: {},
		hud: { banner: (text) => banners.push(text) },
		sim,
		local: 'local',
	})
	try {
		for (const hero of ['local', 'ally', 'enemy'])
			feedback.present({ type: 'ballPickup', hero, team: hero === 'enemy' ? 'B' : 'A', tick: 1 })
		expect(banners).toEqual([
			'You have the Ball!',
			'Your team has the Ball!',
			'Enemy has the Ball!',
		])
		const goal = {
			type: 'ballHit',
			hero: 'local',
			target: 'tower-B',
			kind: 'structure',
			tick: 2,
			point: { x: 0, y: 1, z: 0 },
		}
		feedback.present(goal)
		expect(banners.at(-1)).toBe('GOAL! Tower silenced 6 s')
		expect(shakes).toContain(tune.juice.ballGoal.shake)
		expect(feedback.beat(STEP)).toBe(0)
		feedback.present(goal)
		expect(sounds.filter((s) => s === 'goal')).toHaveLength(1)
		feedback.reset()
		expect(feedback.beat(STEP)).toBe(1)
		feedback.present({
			type: 'ballDrop',
			hero: 'local',
			reason: 'death',
			tick: 3,
			point: goal.point,
		})
		expect(banners.at(-1)).toBe('You died carrying the Ball · Ball dropped')
	} finally {
		if (previous === undefined) delete globalThis.document
		else globalThis.document = previous
	}
})

test('the catch resolver cannot see the part of a skillshot segment beyond a hedge', () => {
	const shot = { x: 0, z: 0, dx: 1, dz: 0, speed: 100, radius: 0.1, range: 5, travelled: 0 }
	const obstacles = [{ kind: 'hedge', x: 1, z: 0, halfX: 0.2, halfZ: 1 }]
	const consumed = interceptShot(
		shot,
		STEP,
		({ from, to }) => {
			expect(from.x).toBe(0)
			expect(to.x).toBeCloseTo(0.7)
			return to.x >= 1.5
		},
		{ kind: 'ball', obstacles },
	)
	expect(consumed).toBe(false)
})

test('all twelve minion tells print flat ink and cream without flattening their bodies', () => {
	boot()
	step(ticks(tune.waves.first))
	expect(sim.lane.minions).toHaveLength(12)
	for (const unit of sim.lane.minions) {
		expect(unit.body.tell.children.every((o) => o.material.uniforms.uFlat.value === 1)).toBe(true)
		const materials = []
		unit.body.visual.traverse((o) => {
			if (o.isMesh) materials.push(o.material)
		})
		expect(materials.some((m) => m.uniforms.uFlat.value === 0)).toBe(true)
	}
})
