import { expect, test } from 'bun:test'
import { tune } from '../src/plugins/moba/tune.js'
import { createSkillsView } from '../src/plugins/moba/skills-view.js'
import { createFeedback } from '../src/plugins/moba/feedback.js'
import { validFact } from '../src/plugins/moba/index.js'
import { STEP, bootMoba, median } from './moba-harness.js'

function fixture(check, firstBall = null) {
	const first = tune.ball.first
	if (firstBall !== null) tune.ball.first = firstBall
	const h = bootMoba({
		heroes: [
			{ id: 'a', team: 'A' },
			{ id: 'b', team: 'B', heroId: 'mitts' },
		],
	})
	const { sim } = h
	tune.ball.first = first
	const [a, b] = sim.heroes
	a.body.place(0, 1.05, 9)
	b.body.place(8, 1.05, 9)
	b.yaw = Math.PI / 2
	b.body.face({ x: -1, z: 0 })
	const launch = (stats = {}) =>
		sim.launchShot(
			a,
			{ x: 1, z: 0 },
			{
				ability: 'loose',
				slot: 'slot1',
				damage: 230,
				speed: 18,
				radius: 0.4,
				range: 12,
				pierce: true,
				bounce: true,
				catchable: true,
				isAbility: true,
				...stats,
			},
		)
	try {
		check({
			sim,
			a,
			b,
			scene: h.scene,
			intents: h.intents,
			facts: h.facts,
			step: h.step,
			feed: h.feed,
			launch,
		})
	} finally {
		h.dispose()
		tune.ball.first = first
	}
}

test('shot API supports a cutout origin, rejects invalid stats, and board expiry emits a copied fact', () =>
	fixture(({ sim, a, facts, step, launch }) => {
		expect(() => launch({ speed: 0 })).toThrow('positive speed/range')
		expect(() => launch({ damage: NaN })).toThrow('finite nonnegative')
		expect(() => sim.openCatch(a, { duration: 0, radius: 2 })).toThrow('one step')
		const stats = { damage: 100, speed: 20, radius: 0.3, range: 8, heroOnly: true }
		const shot = sim.launchShot(a, { x: 1, z: 0 }, stats, { x: 2, z: 5 })
		expect(shot).toMatchObject({ owner: 'a', x: 2, z: 5, heroOnly: true })
		const board = { id: 'board', owner: a.id, x: 4, z: 5, until: 1 }
		sim.boards.push(board)
		step()
		expect(sim.boards).toHaveLength(0)
		const expired = facts.find((fact) => fact.type === 'boardExpired')
		expect(expired).toMatchObject({ hero: a.id, board: 'board', point: { x: 4, y: 0, z: 5 } })
		board.x = 99
		expect(expired.point.x).toBe(4)
		expect(validFact(expired)).toBe(true)
	}))

test('sim-owned catch freezes a shot, Q returns it through a 0.5 s tell even on cooldown, snapshots preserve all stats', () =>
	fixture(({ sim, a, b, launch, step, feed, facts }) => {
		b.definition = {
			...b.definition,
			abilities: {
				slot1: { id: 'testToss', kind: 'shot', returnsPocket: true, stats: tune.loose },
			},
		}
		b.cd[0] = 1000
		b.cd[1] = 100
		sim.openCatch(b, { duration: 1, radius: 2, angle: 100, resetSlot: 'slot2', resetCooldown: 3 })
		const shot = launch()
		const initial = sim.snapshot().projectiles[0]
		expect(initial).toMatchObject({ ...shot, passed: ['a'] })
		initial.passed.push('wrong')
		expect(shot.passed).toEqual(['a'])
		step(22)
		expect(b.hp).toBe(b.maxHp)
		expect(b.abilityState.pocket.shot).toEqual({
			damage: 230,
			speed: 18,
			radius: 0.4,
			range: 12,
			pierce: true,
		})
		expect(b.cd[1]).toBeGreaterThan(150)
		const cooldown = b.cd[0]
		feed('b', { pressed: [{ action: 'slot1', at: { x: 0, z: 9 } }] })
		step()
		expect(b.cast).toMatchObject({ ability: 'return', total: 30 })
		expect(b.cd[0]).toBe(cooldown - 1)
		expect(b.abilityState.pocket).toBeNull()
		step(28)
		expect(facts.some((f) => f.type === 'projectile' && f.ability === 'return')).toBe(false)
		step()
		const returned = sim.shots.find((s) => s.ability === 'return')
		expect(returned).toMatchObject({
			owner: 'b',
			team: 'B',
			damage: 230,
			speed: 18,
			radius: 0.4,
			range: 12,
			pierce: true,
			bounce: false,
			traitProcs: false,
			passed: ['b'],
		})
		step(30)
		expect(a.hp).toBe(a.maxHp - 230)
		expect(facts.every(validFact)).toBe(true)
		expect(JSON.parse(JSON.stringify(sim.snapshot()))).toEqual(sim.snapshot())
	}))

for (const condition of ['expired', 'flank', 'homing', 'uncatchable'])
	test(`catch rejects ${condition}, never consumes a basic or an invalid window`, () =>
		fixture(({ sim, b, launch, step, facts }) => {
			sim.openCatch(b, { duration: condition === 'expired' ? 0.1 : 1, radius: 2, angle: 100 })
			if (condition === 'flank') b.yaw = -Math.PI / 2
			launch(
				condition === 'homing'
					? { target: 'b', slot: 'primary' }
					: condition === 'uncatchable'
						? { catchable: false }
						: {},
			)
			step(30)
			expect(b.abilityState.pocket).toBeNull()
			expect(b.hp).toBe(b.maxHp - 230)
			expect(facts.some((f) => f.type === 'caught')).toBe(false)
		}))

test('boards win earlier contacts, block homing shots from either team, replicate, expire and do not leak between sims', () =>
	fixture(({ sim, a, b, launch, step, facts }) => {
		sim.boards.push({
			id: 'board',
			owner: 'b',
			x: 4,
			z: 9,
			normal: { x: 1, z: 0 },
			width: 3,
			thickness: 0.1,
			until: 90,
		})
		sim.openCatch(b, { duration: 1, radius: 2, angle: 100 })
		launch()
		step(25)
		expect(b.abilityState.pocket).toBeNull()
		expect(b.hp).toBe(b.maxHp)
		sim.launchShot(
			b,
			{ x: -1, z: 0 },
			{ target: 'a', slot: 'primary', damage: 90, speed: 20, radius: 0.12, range: 20 },
		)
		step(20)
		expect(a.hp).toBe(a.maxHp)
		expect(facts.filter((f) => f.type === 'blocked')).toHaveLength(2)
		const snapshot = sim.snapshot()
		snapshot.boards[0].normal.x = 0
		expect(sim.boards[0].normal.x).toBe(1)
		fixture(({ sim: other }) => {
			expect(other.boards).toEqual([])
			expect(other.cutouts).toEqual([])
		})
		step(45)
		expect(sim.boards).toEqual([])
	}))

test('a W-style window catches the real Ball, loses its pocket and preserves objective lifetime', () =>
	fixture(({ sim, a, b, feed, step }) => {
		a.body.place(0, 1.05, 0)
		b.body.place(5, 1.05, 0)
		step()
		sim.ball.give(a, 'pickup')
		const born = sim.ball.state.popAt
		expect(born).toBeGreaterThan(0)
		b.abilityState.pocket = { shot: { damage: 200 }, until: 100 }
		sim.openCatch(b, { duration: 1, radius: 2, angle: 100, acceptBall: true })
		feed('a', { pressed: [{ action: 'primary', at: { x: 5, z: 0 } }] })
		step(35)
		expect(sim.ball.carrying(b)).toBe(true)
		expect(b.abilityState.pocket).toBeNull()
		expect(sim.ball.state.popAt).toBe(born)
		expect(b.hp).toBe(b.maxHp)
	}, STEP))

test('stance and channel are mobile, timers expire once, stop cancels on the final tick, and slows are per-unit factors', () =>
	fixture(({ b, step, feed, facts }) => {
		let ended = 0,
			cancelled = 0
		b.definition = {
			...b.definition,
			abilities: {
				slot2: {
					id: 'fixtureStance',
					kind: 'stance',
					stats: { castPoint: 0, duration: 0.2, cooldown: 1, speedFactor: 0.5 },
				},
				slot3: {
					id: 'fixtureChannel',
					kind: 'channel',
					stats: { castPoint: 0, duration: 0.2, cooldown: 1 },
					onRelease: () => ended++,
					onCancel: () => cancelled++,
				},
			},
		}
		feed('b', { move: { x: 0, z: -1 }, pressed: [{ action: 'slot2', at: { x: 8, z: 0 } }] })
		step(2)
		expect(b.body.position.z).toBeLessThan(9)
		expect(b.body.speedMul).toBe(0.5)
		step(12)
		expect(b.stance).toBeNull()
		feed('b', { move: { x: 0, z: -1 }, pressed: [{ action: 'slot3' }] })
		step(12)
		expect(b.channel.left).toBe(1)
		expect(b.body.position.z).toBeLessThan(8.5)
		feed('b', { pressed: [{ action: 'stop' }] })
		step()
		expect(ended).toBe(0)
		expect(cancelled).toBe(1)
		expect(facts.filter((f) => f.type === 'channelCancelled')).toHaveLength(1)
		b.slow = { until: 100, factor: 0.75 }
		step()
		expect(b.body.speedMul).toBe(0.75)
		b.slow = { until: 100, factor: 0.5 }
		step()
		expect(b.body.speedMul).toBe(0.5)
	}))

test('death hooks can create a cutout, dead tick hooks read intents, and respawn clears only the dead actor', () =>
	fixture(({ sim, a, b, feed, step }) => {
		b.definition = {
			...b.definition,
			traits: {
				onDeath({ hero, sim }) {
					sim.cutouts.push({ id: 'cutout', owner: hero.id, x: 0, z: 10 })
				},
				onTick({ hero, sim, intents }) {
					if (hero.dead) sim.cutouts[0].x += intents.get(hero.id).move.x
				},
			},
		}
		b.abilityState.bag.push({ damage: 120 })
		b.freezeUntil = 20
		sim.launchShot(
			a,
			{ x: 1, z: 0 },
			{ slot: 'primary', target: 'b', damage: b.hp, speed: 2000, radius: 0.1, range: 20 },
		)
		step()
		expect(b.dead).toBe(true)
		expect(b.abilityState).toEqual({ pocket: null, bag: [] })
		expect(sim.cutouts).toHaveLength(1)
		expect(b.freezeUntil).toBe(0)
		feed('b', { move: { x: 1, z: 0 } })
		step()
		expect(sim.cutouts[0].x).toBe(1)
		step(b.respawnTick - sim.tick)
		expect(b.dead).toBe(false)
		expect(sim.cutouts).toHaveLength(0)
	}))

test('a Dive-shaped dash can enter prone, freeze cancels dashes and roots only its target, and Pocket expires on a tick boundary', () =>
	fixture(({ sim, a, b, feed, step, facts }) => {
		b.definition = {
			...b.definition,
			abilities: {
				slot2: {
					id: 'fixtureDive',
					kind: 'dash',
					stats: tune.vault,
					onDashEnd({ hero, tick, ticks }) {
						hero.proneUntil = tick + ticks(0.4)
					},
				},
			},
		}
		feed('b', { pressed: [{ action: 'slot2', at: { x: 8, z: 0 } }] })
		step(14)
		expect(b.body.dashing).toBe(false)
		expect(b.proneUntil).toBeGreaterThan(sim.tick)
		const z = b.body.position.z
		feed('b', { move: { x: 0, z: -1 } })
		step(5)
		expect(b.body.position.z).toBeCloseTo(z, 5)
		b.proneUntil = 0
		b.cd[1] = 0
		feed('b', { pressed: [{ action: 'slot2', at: { x: 8, z: 0 } }] })
		step()
		b.freezeUntil = sim.tick + 10
		step()
		expect(b.body.dashing).toBe(false)
		feed('a', { move: { x: 1, z: 0 } })
		step()
		expect(a.body.position.x).toBeGreaterThan(0)
		b.abilityState.pocket = { shot: { damage: 120 }, until: sim.tick + 2 }
		step()
		expect(b.abilityState.pocket).not.toBeNull()
		step()
		expect(b.abilityState.pocket).toBeNull()
		expect(facts.filter((f) => f.type === 'catchExpired')).toHaveLength(1)
	}))

test('ability facts drive effects and sizes regardless of slot; Q nocks once and holds an interpolated draw pose', () =>
	fixture(({ sim, a, b, scene, feed, step, facts }) => {
		const original = globalThis.document
		globalThis.document = { querySelector: () => null }
		const sounds = [],
			vaults = []
		const feedback = createFeedback({
			sim,
			local: 'a',
			juice: { burst() {} },
			sfx: { nock: () => sounds.push('nock'), vault: () => sounds.push('vault') },
			skillsView: { vault: (...args) => vaults.push(args) },
		})
		try {
			feed('a', { pressed: [{ action: 'slot1', at: { x: 8, z: 9 } }] })
			step()
			const cast = facts.find((f) => f.type === 'cast')
			expect(cast.ability).toBe('loose')
			feedback.present(cast)
			feedback.present(cast)
			expect(sounds).toEqual(['nock'])
			a.body.animate(STEP, 1)
			a.body.poseAbility(a.cast, 0.5)
			expect(a.body.visual.getObjectByName('moba-drawn-arrow').visible).toBe(true)
			expect(a.body.visual.rotation.z).toBeLessThan(0)
			const pose = a.body.visual.rotation.z
			a.body.poseAbility(a.cast, 0.75)
			expect(a.body.visual.rotation.z).toBeLessThan(pose)
			b.definition = {
				...b.definition,
				abilities: { slot2: { id: 'notVault', kind: 'stance', stats: { radius: 2 } } },
			}
			feedback.present({
				type: 'cast',
				hero: 'b',
				ability: 'notVault',
				slot: 'slot2',
				point: { x: 8, z: 9 },
			})
			expect(vaults).toEqual([])
			expect(sounds).toEqual(['nock'])
			const view = createSkillsView(scene)
			b.definition.abilities.slot2 = {
				id: 'otherLine',
				kind: 'shot',
				tell: 'line',
				stats: { range: 6, radius: 0.6 },
			}
			b.cast = { ability: 'otherLine', slot: 'slot2', left: 12, total: 24, yaw: Math.PI / 2 }
			view.update(0, {
				hero: a.body.mesh.position,
				held: {},
				casters: [b],
				obstacles: [{ x: 4, z: 9, r: 1 }],
				alpha: 0.5,
			})
			const tell = scene.getObjectByName('moba-enemy-tell')
			expect(tell.children[0].scale.x).toBe(1.2)
			expect(tell.children[0].scale.z).toBeCloseTo(2.4)
			expect(tell.children[1].scale.z).toBeCloseTo(2.4 * (1 - 11.5 / 24))
			view.dispose()
			b.cast = null
			step(17)
			a.body.animate(STEP, 0)
			a.body.poseAbility(a.cast)
			expect(a.body.visual.getObjectByName('moba-drawn-arrow').visible).toBe(false)
		} finally {
			globalThis.document = original
		}
	}))

for (const state of ['stance', 'channel', 'return', 'prone', 'bag', 'pocket', 'freeze'])
	test(`death and respawn clear ${state}, including a return windup`, () =>
		fixture(({ sim, a, b, feed, step }) => {
			let cancelled = 0
			if (state === 'stance' || state === 'channel') {
				b.definition = {
					...b.definition,
					abilities: {
						slot2: {
							id: 'timed',
							kind: state,
							stats: { castPoint: 0, duration: 1, cooldown: 1 },
							onCancel: () => cancelled++,
						},
					},
				}
				feed('b', { pressed: [{ action: 'slot2' }] })
				step()
			} else if (state === 'return') {
				b.abilityState.pocket = {
					shot: { damage: 320, speed: 30, radius: 0.8, range: 30, pierce: true },
					until: 100,
				}
				expect(sim.throwCaught(b, { x: -1, z: 0 })).toBe(true)
			} else if (state === 'prone') b.proneUntil = 100
			else if (state === 'freeze') b.freezeUntil = 100
			else if (state === 'bag') b.abilityState.bag.push({ damage: 120 })
			else b.abilityState.pocket = { shot: { damage: 120 }, until: 100 }
			sim.launchShot(
				a,
				{ x: 1, z: 0 },
				{ slot: 'primary', target: 'b', damage: b.hp, speed: 2000, radius: 0.1, range: 20 },
			)
			step()
			expect(b.dead).toBe(true)
			expect(b.cast).toBeNull()
			expect(b.channel).toBeNull()
			expect(b.stance).toBeNull()
			expect(b.proneUntil).toBe(0)
			expect(b.freezeUntil).toBe(0)
			expect(b.abilityState).toEqual({ pocket: null, bag: [] })
			if (state === 'channel') expect(cancelled).toBe(1)
			step(b.respawnTick - sim.tick)
			expect(b.dead).toBe(false)
			expect(b.abilityState).toEqual({ pocket: null, bag: [] })
			expect(sim.shots.some((s) => s.ability === 'return')).toBe(false)
		}))

test('catch and board query work fits a 2 ms median tick with 24 simultaneous shots and walls', () =>
	fixture(({ sim, a, step }) => {
		for (let i = 0; i < 24; i++)
			sim.boards.push({
				id: `wall${i}`,
				owner: 'b',
				x: 4 + i / 10,
				z: 9,
				normal: { x: 1, z: 0 },
				width: 3,
				thickness: 0.1,
				until: 10000,
			})
		const times = []
		for (let sample = 0; sample < 7; sample++) {
			for (let i = 0; i < 24; i++)
				sim.launchShot(
					a,
					{ x: 1, z: 0 },
					{
						ability: 'loose',
						slot: 'slot1',
						damage: 0,
						speed: 20,
						radius: 0.3,
						range: 10,
						catchable: true,
					},
				)
			const start = performance.now()
			step(32)
			times.push((performance.now() - start) / 32)
		}
		expect(median(times)).toBeLessThan(tune.proof.queryBudgetMs)
		console.log('hero query median ms/tick', median(times))
	}))
