import { expect, test } from 'bun:test'
import { createBots } from '../src/plugins/moba/bots.js'
import { createSkillsView } from '../src/plugins/moba/skills-view.js'
import { HEROES } from '../src/plugins/moba/heroes.js'
import { tune } from '../src/plugins/moba/tune.js'
import { styleId } from '../src/core/stylepass.js'
import { parseMatchSetup } from '../src/plugins/moba/setup.js'
import { STEP, bootMoba, ticks } from './moba-harness.js'

function fixture(
	check,
	{
		seats = [
			{ id: 'thrower', team: 'A' },
			{ id: 'keeper', team: 'B', heroId: 'mitts' },
		],
		bots = [],
		ball = tune.ball.first,
	} = {},
) {
	const previous = tune.ball.first
	tune.ball.first = ball
	const h = bootMoba({ heroes: seats, bots, seed: 2 })
	const { sim, scene, intents, facts, step } = h
	tune.ball.first = previous
	const [a, b] = sim.heroes
	if (!bots.length) {
		a.body.place(0, 1.05, 9)
		b.body.place(8, 1.05, 9)
		b.yaw = Math.PI / 2
		b.body.face({ x: -1, z: 0 })
	}
	const feed = (hero, frame) => h.feed(hero.id, frame)
	const press = (hero, action, at = a.body.position) =>
		h.press(hero.id, action, { x: at.x, z: at.z })
	try {
		check({ sim, a, b, scene, intents, facts, feed, press, step })
	} finally {
		h.dispose()
		tune.ball.first = previous
	}
}

test('Mitts is a live-tuned playable definition and both select setup and hero=mitts seat her', () =>
	fixture(({ sim, b }) => {
		expect(HEROES.mitts.playable).toBe(true)
		expect(HEROES.carom.playable).toBe(false)
		expect(HEROES.skip.playable).toBe(false)
		expect(HEROES.mitts.abilities.slot4).toBeNull()
		expect(b.hp).toBe(1600)
		expect(b.definition.basic).toMatchObject({ damage: 110, range: 3, rate: 1, kind: 'melee' })
		for (const setup of [
			parseMatchSetup(new URLSearchParams('hero=mitts')),
			parseMatchSetup(new URLSearchParams(), { heroId: 'mitts' }),
		])
			expect(setup.heroId).toBe(sim.heroes.find((h) => h.id === 'keeper').heroId)
		const previous = tune.toss.damage
		try {
			tune.toss.damage = 121
			expect(b.definition.abilities.slot1.stats.damage).toBe(121)
		} finally {
			tune.toss.damage = previous
		}
	}))

// A guest's 100 ms RTT includes its delayed windup view, upstream delivery and
// fixed-step scheduling: 0.12 s typical / 0.21 s worst, as in moba-heroes.md.
for (const [name, pressedAt, guestDelay, caught] of [
	['too early', -65, 0, false],
	['on windup', 0, 0, true],
	['too late', 45, 0, false],
	['guest 100 ms RTT typical', 0, 7, true],
	['guest 100 ms RTT worst', 0, 13, true],
	['guest 100 ms RTT early', -80, 13, false],
	['guest 100 ms RTT late', 45, 7, false],
])
	test(`real Catch vs real Loose: ${name}`, () =>
		fixture(({ sim, a, b, facts, press, step }) => {
			const castAt = 90,
				catchAt = castAt + pressedAt + guestDelay
			for (let tick = 0; tick < 170; tick++) {
				if (tick === castAt) press(a, 'slot1', b.body.position)
				if (tick === catchAt) press(b, 'slot2')
				step()
			}
			expect(!!b.abilityState.pocket).toBe(caught)
			expect(facts.some((f) => f.type === 'caught' && f.hero === b.id)).toBe(caught)
			expect(b.hp).toBe(b.maxHp - (caught ? 0 : tune.loose.damage))
			if (caught) {
				expect(b.abilityState.pocket).toMatchObject({
					team: 'A',
					shot: { damage: 140, speed: 20, radius: 0.3, range: 11, pierce: false },
				})
				expect(b.cd[1]).toBeLessThanOrEqual(ticks(tune.catch.resetCooldown))
			}
			expect(sim.shots).toHaveLength(0)
		}))

test('Catch halves movement for exactly its stance; stop does not silently end its window', () =>
	fixture(({ sim, b, feed, press, step }) => {
		press(b, 'slot2')
		step()
		expect(b.body.speedMul).toBe(0.5)
		const until = b.stance.until
		feed(b, { move: { x: 0, z: -1 } })
		step(5)
		expect(b.body.position.z).toBeLessThan(9)
		press(b, 'stop')
		step()
		expect(b.catchWindow.until).toBe(until)
		step(until - sim.tick)
		expect(b.stance).toBeNull()
		expect(b.catchWindow).toBeNull()
		expect(b.body.speedMul).toBe(1)
	}))

test('Pocket expires on its six-second boundary and Q returns the original frozen shot as Mitts, despite cooldown', () =>
	fixture(({ sim, a, b, facts, press, step }) => {
		press(a, 'slot1', b.body.position)
		press(b, 'slot2')
		step(40)
		const pocket = structuredClone(b.abilityState.pocket)
		expect(pocket.until).toBe(facts.find((f) => f.type === 'caught').tick + ticks(6))
		b.cd[0] = ticks(5)
		press(b, 'slot1')
		step()
		expect(b.cast).toMatchObject({ ability: 'return', total: ticks(0.5) })
		expect(b.cd[0]).toBe(ticks(5) - 1)
		step(ticks(0.5) - 2)
		expect(sim.shots.some((s) => s.ability === 'return')).toBe(false)
		step()
		expect(sim.shots.find((s) => s.ability === 'return')).toMatchObject({
			...pocket.shot,
			owner: b.id,
			team: 'B',
			bounce: false,
			traitProcs: false,
		})
		step(30)
		expect(a.hp).toBe(a.maxHp - pocket.shot.damage)
		b.abilityState.pocket = { ...pocket, until: sim.tick + ticks(6) }
		const until = b.abilityState.pocket.until
		step(ticks(6) - 1)
		expect(b.abilityState.pocket).not.toBeNull()
		step()
		expect(sim.tick).toBe(until)
		expect(b.abilityState.pocket).toBeNull()
		expect(facts.filter((f) => f.type === 'catchExpired')).toHaveLength(1)
	}))

for (const action of ['stop', 'cancel'])
	test(`explicit ${action} cancels Toss/return windups; held RMB orders do not, and Pocket keeps its original expiry`, () =>
		fixture(({ sim, b, facts, feed, press, step }) => {
			press(b, 'slot1')
			step()
			feed(b, { order: { x: 8, z: 8 } })
			step()
			expect(b.cast.ability).toBe('toss')
			press(b, action)
			step()
			expect(b.cast).toBeNull()
			expect(
				facts.some((f) => f.type === 'denied' && f.reason === 'cancelled' && f.ability === 'toss'),
			).toBe(true)
			b.abilityState.pocket = {
				team: 'A',
				shot: { damage: 320, speed: 18, radius: 0.8, range: 12, pierce: true },
				until: sim.tick + ticks(6),
			}
			const until = b.abilityState.pocket.until
			press(b, 'slot1')
			step(5)
			expect(b.cast.ability).toBe('return')
			press(b, action)
			step()
			expect(b.cast).toBeNull()
			expect(b.abilityState.pocket.until).toBe(until)
			expect(sim.shots).toHaveLength(0)
		}))

test('Toss has its own 0.35 s tell and first-hit shot; glove slap is a 3 m melee basic, not a homing arrow', () =>
	fixture(({ sim, a, b, facts, press, step }) => {
		press(b, 'slot1')
		step()
		expect(b.cast).toMatchObject({ ability: 'toss', total: ticks(0.35) })
		step(ticks(0.35) - 1)
		expect(sim.shots[0]).toMatchObject({
			ability: 'toss',
			damage: 120,
			speed: 20,
			range: 9,
			radius: 0.35,
			pierce: false,
		})
		step(30)
		expect(a.hp).toBe(a.maxHp - 120)
		b.body.place(2.5, 1.05, 9)
		press(b, 'primary')
		step(20)
		expect(a.hp).toBe(a.maxHp - 230)
		expect(facts.some((f) => f.type === 'cast' && f.ability === 'gloveSlap')).toBe(true)
		expect(facts.some((f) => f.type === 'impact' && f.ability === 'gloveSlap')).toBe(true)
		expect(sim.shots.some((s) => s.owner === b.id && s.slot === 'primary')).toBe(false)
	}))

test('Dive travels four metres through intents, catches during prone, then denies every action for 0.4 s', () =>
	fixture(({ sim, a, b, facts, feed, press, step }) => {
		step(10) // Settle onto the floor before measuring horizontal travel.
		press(b, 'slot3', { x: 8, z: 5 })
		step(15)
		expect(b.body.dashing).toBe(false)
		expect(b.body.position.z).toBeCloseTo(5, 2)
		expect(b.proneUntil - sim.tick).toBe(ticks(0.4))
		expect(b.catchWindow).toMatchObject({ angle: 360, acceptBall: false, until: b.proneUntil })
		const p = { ...b.body.position }
		feed(b, {
			move: { x: 1, z: 0 },
			pressed: [
				{ action: 'slot1', at: { x: 0, z: 5 } },
				{ action: 'primary', at: { x: 0, z: 5 } },
			],
		})
		step(5)
		expect(b.body.position.x).toBeCloseTo(p.x, 5)
		expect(b.body.position.z).toBeCloseTo(p.z, 5)
		expect(b.cast).toBeNull()
		expect(b.attack).toBeNull()
		expect(facts.filter((f) => f.type === 'denied' && f.reason === 'disabled')).toHaveLength(2)
		// A straight shot enters the still-open Dive window during prone.
		a.body.place(5.8, 1.05, 5)
		const shot = sim.launchShot(
			a,
			{ x: 1, z: 0 },
			{
				ability: 'loose',
				slot: 'slot1',
				damage: 140,
				speed: 20,
				radius: 0.3,
				range: 11,
				catchable: true,
			},
		)
		step(5)
		expect(b.abilityState.pocket.shot.damage).toBe(shot.damage)
		expect(b.hp).toBe(b.maxHp)
		step(b.proneUntil - sim.tick)
		expect(b.body.position.x).toBeGreaterThan(p.x)
	}))

test('Dive can intercept a real Loose during its dash; structures block the dash', () => {
	fixture(({ a, b, press, step }) => {
		step(10)
		press(a, 'slot1', b.body.position)
		step(10)
		press(b, 'slot3', a.body.position)
		step(14)
		expect(b.body.dashing).toBe(true)
		expect(b.abilityState.pocket).not.toBeNull()
		expect(b.hp).toBe(b.maxHp)
	})
	fixture(({ sim, b, press, step }) => {
		b.body.place(23, 1.05, 0)
		step(10)
		press(b, 'slot3', { x: 17, z: 0 })
		step(15)
		expect(b.body.position.x).toBeGreaterThan(tune.tower.x + tune.tower.radius + b.body.radius)
		expect(b.proneUntil - sim.tick).toBe(ticks(tune.dive.prone))
	})
})

for (const pierce of [false, true])
	test(`an earlier body wins over a glove in the same tick (pierce=${pierce})`, () =>
		fixture(
			({ sim, a, b, press, step }) => {
				const teammate = sim.heroes[2]
				teammate.body.place(5, 1.05, 9)
				press(b, 'slot2')
				step()
				sim.launchShot(
					a,
					{ x: 1, z: 0 },
					{
						ability: 'toss',
						slot: 'slot1',
						damage: 120,
						speed: 1000,
						radius: 0.35,
						range: 12,
						catchable: true,
						pierce,
					},
				)
				step()
				expect(teammate.hp).toBe(teammate.maxHp - 120)
				expect(!!b.abilityState.pocket).toBe(pierce)
				expect(b.hp).toBe(b.maxHp)
			},
			{
				seats: [
					{ id: 'thrower', team: 'A' },
					{ id: 'keeper', team: 'B', heroId: 'mitts' },
					{ id: 'screen', team: 'B' },
				],
			},
		))

test('Catch takes the real Ball without restarting its lifetime and empties Pocket; Dive lets it pass', () => {
	for (const action of ['slot2', 'slot3'])
		fixture(
			({ sim, a, b, press, step }) => {
				a.body.place(0, 1.05, 0)
				b.body.place(5, 1.05, 0)
				step()
				sim.ball.give(a, 'pickup')
				const popAt = sim.ball.state.popAt
				b.abilityState.pocket = { shot: { damage: 200 }, until: 100 }
				press(a, 'primary', b.body.position)
				press(b, action, action === 'slot3' ? { x: 9, z: 0 } : a.body.position)
				step(35)
				expect(sim.ball.carrying(b)).toBe(action === 'slot2')
				if (action === 'slot2') {
					expect(b.abilityState.pocket).toBeNull()
					expect(sim.ball.state.popAt).toBe(popAt)
					expect(b.body.speedMul).toBe(tune.catch.speedFactor * tune.ball.carrySpeed)
				}
			},
			{ ball: STEP },
		)
})

for (const state of ['catch', 'dash', 'prone', 'toss windup', 'return windup', 'shot in flight'])
	test(`Mitts death/respawn during ${state} does not leave a timed state behind`, () =>
		fixture(({ sim, a, b, press, step }) => {
			if (state === 'catch') {
				press(b, 'slot2')
				step()
			}
			if (state === 'dash' || state === 'prone') {
				press(b, 'slot3', { x: 8, z: 5 })
				step(state === 'prone' ? 16 : 1)
			}
			if (state === 'toss windup' || state === 'shot in flight') {
				press(b, 'slot1')
				step(state === 'shot in flight' ? ticks(0.35) : 1)
			}
			if (state === 'return windup') {
				b.abilityState.pocket = {
					shot: { damage: 140, speed: 20, range: 11, radius: 0.3, pierce: false },
					until: 100,
				}
				press(b, 'slot1')
				step()
			}
			sim.launchShot(
				a,
				{ x: 1, z: 0 },
				{ target: b.id, slot: 'primary', damage: b.hp, speed: 2000, radius: 0.1, range: 20 },
			)
			step()
			expect(b.dead).toBe(true)
			expect(b.cast).toBeNull()
			expect(b.stance).toBeNull()
			expect(b.catchWindow).toBeNull()
			expect(b.proneUntil).toBe(0)
			expect(b.body.dashing).toBe(false)
			expect(b.abilityState).toEqual({ pocket: null, bag: [] })
			step(b.respawnTick - sim.tick)
			expect(b.dead).toBe(false)
			expect(b.abilityState).toEqual({ pocket: null, bag: [] })
			expect(sim.shots.some((s) => s.owner === b.id)).toBe(false)
		}))

test('Catch arc, Pocket countdown and all glove poses use render alpha and per-object colour', () =>
	fixture(({ sim, a, b, scene, press, step }) => {
		const view = createSkillsView(scene)
		try {
			press(b, 'slot2')
			step(20)
			const update = (alpha) => {
				b.body.animate(0)
				b.body.poseAbility(b.cast, alpha)
				view.update(0, { hero: b.body.mesh.position, held: {}, unit: b, casters: [a], alpha })
			}
			update(0)
			const arc = scene.getObjectByName('moba-catch-window')
			expect(arc).not.toBeUndefined()
			expect(arc.scale.x).toBe(tune.catch.radius)
			const position = arc.children[1].geometry.attributes.position.getX(tune.mittsView.segments)
			update(0.75)
			expect(arc.children[1].geometry.attributes.position.getX(tune.mittsView.segments)).not.toBe(
				position,
			)
			const glove = b.body.visual.getObjectByName('moba-glove')
			expect(glove.position.y).toBe(tune.mittsView.gloveLift)
			b.abilityState.pocket = { team: 'A', shot: { damage: 140 }, until: sim.tick + ticks(6) }
			update(0)
			const ring = b.body.mesh.getObjectByName('moba-pocket-ring')
			expect(ring.visible).toBe(true)
			expect(glove.children[0].material.uniforms.uStyleId.value).toBe(styleId('teamA'))
			expect(glove.children[0].material).not.toBe(a.body.visual.material)
			const point = ring.geometry.attributes.position.getZ(tune.mittsView.segments)
			update(0.75)
			expect(ring.geometry.attributes.position.getZ(tune.mittsView.segments)).not.toBe(point)
		} finally {
			view.dispose()
		}
	}))

test('Mitts bots read Catch threats only from lagged windups and use their Pocket through cooldown', () =>
	fixture(({ sim, a, b, intents, step }) => {
		const bots = createBots([{ id: b.id, team: b.team, difficulty: 'hard' }], 2)
		const frames = [],
			original = bots.brains[0].frame
		bots.brains[0].frame = (sim, perceived) => {
			const frame = original(sim, perceived)
			frames.push({ tick: sim.tick, seen: perceived.tick, frame })
			return frame
		}
		for (let i = 0; i < 30; i++) {
			bots.step(sim, intents)
			intents.cancel(b.id)
			step()
		}
		a.cast = {
			ability: 'loose',
			slot: 'slot1',
			dir: { x: 1, z: 0 },
			yaw: -Math.PI / 2,
			target: { x: 8, z: 9 },
			left: ticks(0.3),
			total: ticks(0.3),
		}
		const began = sim.tick
		for (let i = 0; i < ticks(tune.bots.hard.reaction); i++) {
			bots.step(sim, intents)
			intents.cancel(b.id)
			step()
		}
		expect(
			frames
				.filter((f) => f.tick >= began)
				.some((f) => f.frame.pressed.some((e) => e.action === 'slot2')),
		).toBe(false)
		for (let i = 0; i < 12; i++) {
			bots.step(sim, intents)
			step()
		}
		expect(
			frames.some(
				(f) =>
					f.tick >= began + ticks(tune.bots.hard.reaction) &&
					f.frame.pressed.some((e) => e.action === 'slot2'),
			),
		).toBe(true)
	}))

test('Mitts bots return a Pocket shot through Toss cooldown using its frozen range and speed', () =>
	fixture(({ sim, b, intents, step }) => {
		const bots = createBots([{ id: b.id, team: b.team, difficulty: 'hard' }], 2)
		b.cd[0] = 500
		for (let i = 0; i < 30; i++) {
			bots.step(sim, intents)
			intents.cancel(b.id)
			step()
		}
		b.abilityState.pocket = {
			team: 'A',
			shot: { damage: 320, speed: 18, radius: 0.8, range: 12, pierce: true },
			until: sim.tick + ticks(6),
		}
		const cooldown = b.cd[0]
		for (let i = 0; i < 12; i++) {
			bots.step(sim, intents)
			step()
		}
		expect(b.cast).toMatchObject({
			ability: 'return',
			total: ticks(0.5),
			shot: { damage: 320, speed: 18, range: 12, pierce: true },
		})
		expect(b.cd[0]).toBe(cooldown - 12)
		expect(b.abilityState.pocket).toBeNull()
	}))

test('real-play fast-forward: three Mitts vs three Fletchers ends by a core kill (bots-only, not human proof)', () => {
	const seats = ['A', 'B'].flatMap((team) =>
		Array.from({ length: 3 }, (_, i) => ({
			id: `${team}${i}`,
			team,
			heroId: team === 'A' ? 'mitts' : 'fletcher',
			file: (i - 1) * tune.bots.fileSpacing,
			difficulty: 'normal',
		})),
	)
	fixture(
		({ sim, facts, step }) => {
			for (let i = 0; i < ticks(tune.agents.maxSeconds) && !sim.lane.match.winner; i++) step()
			expect(sim.lane.match.winner).not.toBeNull()
			expect(sim.lane.structures.some((u) => u.kind === 'core' && u.dead)).toBe(true)
			for (const ability of ['gloveSlap', 'toss', 'catch'])
				expect(facts.some((f) => f.type === 'cast' && f.ability === ability)).toBe(true)
			expect(facts.some((f) => f.type === 'caught')).toBe(true)
			console.log(
				'Mitts/Fletcher bots-only core kill',
				sim.lane.match.winner,
				sim.tick * STEP,
				'seconds',
			)
		},
		{ seats, bots: seats },
	)
}, 120000)
