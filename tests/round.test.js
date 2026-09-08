import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { buildCourt } from '../src/court.js'
import { createRound } from '../src/round.js'
import { tune } from '../src/tune.js'

// Headless integration smoke test: boot the real game loop (Rapier world, court, a full Round with AI brains) at 60Hz with a still human; the AI must shoot and wipe team A (or someone falls in) and the round must end cleanly via onOver and dispose. Uses the -compat Rapier build — the bundler build's wasm doesn't load under bun.
await RAPIER.init({})

function makeCtx() {
	const scene = new THREE.Scene()
	const world = new RAPIER.World({ x: 0, y: tune.physics.gravity, z: 0 })
	world.timestep = 1 / 60
	buildCourt(scene, world, RAPIER)
	const events = []
	const actions = []
	return {
		events,
		actions,
		present: (event) =>
			(event.type === 'impact' || event.type === 'fall' ? events : actions).push(event),
		scene,
		world,
		RAPIER,
		eventQueue: new RAPIER.EventQueue(true),
		combat: { push() {} },
		sfx: { loose() {}, grab() {}, hit() {}, perfect() {}, roll() {}, win() {}, taunt() {} },
		addShake() {},
	}
}

const STILL = { x: 0, z: 0 }

function runUntilOver(round, maxSeconds = 60) {
	const dt = 1 / 60
	for (let i = 0; i < maxSeconds * 60; i++) {
		round.step(dt, STILL)
		round.lateUpdate(dt)
		if (round.over) return i * dt
	}
	return -1
}

describe('headless round', () => {
	test('AI wipes a passive human and the round ends cleanly', () => {
		const ctx = makeCtx()
		let winner
		let overCalls = 0
		const round = createRound(ctx, {
			enemies: 3,
			arrowCount: 7,
			roundNum: 1,
			onOver: (w) => {
				winner = w
				overCalls++
			},
		})
		const t = runUntilOver(round)
		expect(t).toBeGreaterThanOrEqual(0) // round actually decided
		// Let the deciding-death grace period elapse so onOver fires exactly once.
		for (let i = 0; i < 5 * 60; i++) round.step(1 / 60, STILL)
		expect(overCalls).toBe(1)
		// A lone passive human against 3 archers loses — the human never shoots, so B must have units standing.
		expect(winner).toBe('B')
		round.dispose()
		expect(round.units.length).toBe(0)
		expect(round.arrows.length).toBe(0)
	})

	test('every arrow stays grabbable on the court (no pool loss)', () => {
		const ctx = makeCtx()
		const round = createRound(ctx, { enemies: 3, arrowCount: 7, onOver() {} })
		runUntilOver(round, 30)
		const limX = 11 / 2 // COURT.width
		const limZ = 24 / 2 // COURT.depth
		let accounted = 0
		for (const a of round.arrows) {
			if (a.state === 'flying') continue // mid-air when the round ended
			accounted++
			expect(['held', 'grounded']).toContain(a.state)
			if (a.state === 'grounded') {
				expect(Math.abs(a.position.x)).toBeLessThanOrEqual(limX)
				expect(Math.abs(a.position.z)).toBeLessThanOrEqual(limZ)
			}
		}
		expect(accounted).toBeGreaterThan(0)
		round.dispose()
	})

	test('removing every enemy ends the round as a win for A', () => {
		const ctx = makeCtx()
		let winner = null
		const round = createRound(ctx, { enemies: 2, arrowCount: 4, onOver: (w) => (winner = w) })
		round.removeUnit('B')
		round.removeUnit('B')
		// removeUnit's checkWin starts the grace countdown; step it out.
		for (let i = 0; i < 5 * 60 && winner === null; i++) round.step(1 / 60, STILL)
		expect(winner).toBe('A')
		round.dispose()
	})

	test('a bowl drops ammo where its physics body was hit', () => {
		const ctx = makeCtx()
		const round = createRound(ctx, { enemies: 1, arrowCount: 2 })
		const bowl = round.human.heldArrow
		round.looseHuman({ x: 1, z: 0 }, tune.weapons.bowlSpeed, { kind: 'bowl' })
		for (let i = 0; i < 10; i++) round.step(1 / 60, STILL)
		const before = { x: bowl.position.x, z: bowl.position.z }
		bowl.ground()
		expect(bowl.state).toBe('grounded')
		expect(bowl.position.x).toBeCloseTo(before.x, 4)
		expect(bowl.position.z).toBeCloseTo(before.z, 4)
		round.dispose()
	})

	test('lobby stays live without arrows and rescues the player from the void', () => {
		const ctx = makeCtx()
		let overCalls = 0
		const previousInfiniteAmmo = tune.cheats.infiniteAmmo
		tune.cheats.infiniteAmmo = true
		const round = createRound(ctx, {
			enemies: 0,
			arrowCount: 0,
			lobby: true,
			onOver: () => overCalls++,
		})
		try {
			expect(round.arrows).toHaveLength(0)
			expect(round.human.heldArrow).toBeNull()
			round.human.body.setTranslation({ x: 0, y: -20, z: 8 }, true)
			for (let i = 0; i < 120; i++) {
				round.step(1 / 60, STILL)
				round.lateUpdate(1 / 60)
			}
			expect(round.human.alive).toBe(true)
			expect(round.human.position.y).toBeGreaterThan(0)
			expect(round.arrows).toHaveLength(0)
			expect(round.over).toBe(false)
			expect(overCalls).toBe(0)
			expect(ctx.events).toHaveLength(0)
		} finally {
			tune.cheats.infiniteAmmo = previousInfiniteAmmo
			round.dispose()
		}
	})

	test('combat rounds reject an empty arrow pool', () => {
		expect(() => createRound(makeCtx(), { enemies: 1, arrowCount: 0 })).toThrow(
			'Combat rounds require at least one arrow',
		)
	})
})

describe('contact facts', () => {
	let ctx, round, aiEnabled, godmode
	beforeEach(() => {
		aiEnabled = tune.ai.enabled
		godmode = tune.cheats.godmode
		tune.ai.enabled = false
		tune.cheats.godmode = false
		ctx = makeCtx()
		round = createRound(ctx, { enemies: 1, arrowCount: 2 })
		round.human.place(-4, 1, 4)
		round.units[1].place(0, 1, 0)
	})
	afterEach(() => {
		round.dispose()
		ctx.eventQueue.free()
		ctx.world.free()
		tune.ai.enabled = aiEnabled
		tune.cheats.godmode = godmode
	})

	function stepUntilEvent() {
		for (let i = 0; i < 600 && !ctx.events.length; i++) round.step(1 / 60, STILL)
		expect(ctx.events).toHaveLength(1)
		return ctx.events[0]
	}

	test.each([
		['arrow', false],
		['arrow', true],
		['bowl', false],
	])('%s hit (perfect=%s) emits one copied elimination after teardown', (kind, perfect) => {
		const shot = round.human.heldArrow
		round.human.heldArrow = null
		shot.loose(new THREE.Vector3(-1, 1, 0), { x: 1, z: 0 }, 'A', 12, {
			kind,
			perfect,
			sourceId: round.human.id,
			sourceIsHuman: true,
		})
		const event = stepUntilEvent()
		expect(event.outcome).toBe('eliminated')
		expect(event.kind).toBe(kind)
		expect(event.perfect).toBe(perfect)
		expect(event.source).toEqual({ id: round.human.id, team: 'A', isHuman: true })
		expect(event.target.id).toBe(round.units[1].id)
		expect(event.surface).toBe('unit')
		expect(event.pointKind).toBe('contact')
		expect(event.normal).toBeDefined()
		expect(event.point.x).toBeCloseTo(-0.4, 1)
		expect(event.direction.x).toBeGreaterThan(0.9)
		expect(round.units[1].alive).toBe(false)
		expect(shot.state).toBe('grounded')
		expect(round.arrows).toHaveLength(2)
		expect(round.winner).toBe('A')
		const saved = structuredClone(event)
		for (let i = 0; i < 120; i++) round.step(1 / 60, STILL)
		expect(ctx.events).toHaveLength(1)
		shot.hold()
		shot.loose(new THREE.Vector3(3, 2, 4), { x: 0, z: 1 }, 'B', 15)
		expect(event).toEqual(saved) // reusing ammo cannot rewrite an old event
	})

	test('dash feedback only follows an accepted dash, using its latched direction', () => {
		round.human.aim.set(1, 0, 0)
		expect(round.dashHuman(STILL)).toBe(true)
		expect(round.dashHuman({ x: 0, z: 1 })).toBe(false)
		expect(ctx.actions).toHaveLength(1)
		expect(ctx.actions[0].type).toBe('dash')
		expect(ctx.actions[0].direction).toEqual({ x: 1, y: 0, z: 0 })
		expect(ctx.actions[0].source.id).toBe(round.human.id)
	})

	test('shot and pickup feedback emit once, after the held state changes', () => {
		const shot = round.human.heldArrow
		round.looseHuman({ x: 0, z: -1 }, 15)
		round.looseHuman({ x: 0, z: -1 }, 15) // empty-handed: no second shot
		expect(ctx.actions.map((event) => event.type)).toEqual(['shot'])
		expect(round.human.heldArrow).toBeNull()
		shot.ground()
		round.lateUpdate()
		round.lateUpdate()
		expect(round.human.heldArrow).toBeNull() // rendering a paused fixture cannot pick up
		round.step(1 / 60, STILL)
		round.step(1 / 60, STILL)
		expect(ctx.actions.map((event) => event.type)).toEqual(['shot', 'pickup'])
		expect(round.human.heldArrow).toBe(shot)
		expect(ctx.actions[1].source.isHuman).toBe(true)
	})

	test('human release records the shooter independently of team ownership', () => {
		const shot = round.human.heldArrow
		round.looseHuman({ x: 0, z: -1 }, 15, { perfect: true })
		expect(shot.snapshotImpact().source).toEqual({ id: round.human.id, team: 'A', isHuman: true })
		expect(shot.snapshotImpact().perfect).toBe(true)
	})

	test.each([
		[8, 'landed'],
		[60, 'recovered'],
	])('perfect miss at speed %s is %s, never a kill', (speed, outcome) => {
		round.units[1].place(4, 1, 5)
		round.human.place(0, 1, 5)
		round.looseHuman({ x: 0, z: -1 }, speed, { perfect: true })
		const event = stepUntilEvent()
		expect(event.outcome).toBe(outcome)
		expect(event.perfect).toBe(true)
		expect(event.target).toBeUndefined()
		expect(round.over).toBe(false)
		expect(round.arrows).toHaveLength(2)
		if (outcome === 'landed') {
			expect(event.point.y).toBe(0)
			expect(event.normal).toEqual({ x: 0, y: 1, z: 0 })
		} else expect(event.surface).toBe('void')
		for (let i = 0; i < 60; i++) round.step(1 / 60, STILL)
		expect(ctx.events).toHaveLength(1)
	})

	test('a whiff past an enemy reports one near miss before it lands', () => {
		round.units[1].place(0.6, 1, 0)
		round.human.place(0, 1, 5)
		round.looseHuman({ x: 0, z: -1 }, 12)
		for (let i = 0; i < 600 && ctx.events.length < 2; i++) round.step(1 / 60, STILL)
		expect(ctx.events.map((event) => event.outcome)).toEqual(['nearMiss', 'landed'])
		const [miss] = ctx.events
		expect(miss.type).toBe('impact')
		expect(miss.target.id).toBe(round.units[1].id)
		expect(miss.source).toEqual({ id: round.human.id, team: 'A', isHuman: true })
		expect(miss.distance).toBeLessThan(tune.arrow.nearMiss)
		expect(miss.distance).toBeGreaterThan(0.4)
		expect(miss.point.z).toBeCloseTo(0, 0)
		expect(miss.direction.z).toBeLessThan(-0.9)
		expect(round.units[1].alive).toBe(true)
		for (let i = 0; i < 60; i++) round.step(1 / 60, STILL)
		expect(ctx.events).toHaveLength(2)
	})

	test('godmode deflects once without an elimination or ammo loss', () => {
		tune.cheats.godmode = true
		round.human.place(0, 1, 0)
		round.units[1].place(4, 1, 4)
		const shot = round.arrows[1]
		shot.loose(new THREE.Vector3(-1, 1, 0), { x: 1, z: 0 }, 'B', 12)
		const event = stepUntilEvent()
		expect(event.outcome).toBe('deflected')
		expect(event.target.isHuman).toBe(true)
		expect(round.human.alive).toBe(true)
		expect(round.over).toBe(false)
		expect(shot.state).toBe('grounded')
		for (let i = 0; i < 60; i++) round.step(1 / 60, STILL)
		expect(ctx.events).toHaveLength(1)
	})

	test('a fall reports a downward elimination without an arrow impact', () => {
		round.human.place(0, -6, 0)
		const event = stepUntilEvent()
		expect(event.type).toBe('fall')
		expect(event.outcome).toBe('eliminated')
		expect(event.direction).toEqual({ x: 0, y: -1, z: 0 })
		expect(event.source).toBeUndefined()
		expect(event.point.y).toBeLessThan(-5)
		expect(round.winner).toBe('B')
	})

	test('two contact eliminations in one step still produce a draw', () => {
		const winners = []
		round.dispose()
		round = createRound(ctx, {
			enemies: 1,
			arrowCount: 2,
			onOver: (winner) => winners.push(winner),
		})
		round.human.place(-2, 1, 0)
		round.units[1].place(2, 1, 0)
		round.human.heldArrow = null
		round.arrows[0].loose(new THREE.Vector3(1.6, 1, 0), { x: 1, z: 0 }, 'A', 12)
		round.arrows[1].loose(new THREE.Vector3(-1.6, 1, 0), { x: -1, z: 0 }, 'B', 12)
		round.step(1 / 60, STILL)
		expect(ctx.events.map((event) => event.outcome)).toEqual(['eliminated', 'eliminated'])
		expect(round.over).toBe(true)
		expect(round.winner).toBeNull()
		expect(round.arrows.every((arrow) => arrow.state === 'grounded')).toBe(true)
		for (let i = 0; i < 180; i++) round.step(1 / 60, STILL)
		expect(winners).toEqual([null])
		expect(ctx.events).toHaveLength(2)
	})
})

test('twenty additions per side never overlap live colliders, even without a physics tick', () => {
	const ctx = makeCtx()
	const round = createRound(ctx, { enemies: 1, seed: 42 })
	try {
		for (let i = 1; i < 20; i++) {
			expect(round.addUnit('A')).not.toBeNull()
			expect(round.addUnit('B')).not.toBeNull()
		}
		expect(round.units).toHaveLength(40)
		for (let i = 0; i < round.units.length; i++) {
			const p = round.units[i].body.translation()
			for (let j = 0; j < i; j++) {
				const q = round.units[j].body.translation()
				expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThan(tune.player.radius * 2)
			}
		}
	} finally {
		round.dispose()
		ctx.eventQueue.free()
		ctx.world.free()
	}
})

test('seeded 20v20 decisions repeat across fresh worlds', () => {
	function run() {
		const ctx = makeCtx()
		const round = createRound(ctx, { enemies: 20, allies: 19, seed: 17 })
		try {
			for (let i = 0; i < 120; i++) {
				round.step(1 / 60, STILL)
				round.lateUpdate()
			}
			return round.units.map((u) => ({
				team: u.team,
				alive: u.alive,
				position: u.position.toArray(),
				armed: !!u.heldArrow,
			}))
		} finally {
			round.dispose()
			ctx.eventQueue.free()
			ctx.world.free()
		}
	}
	expect(run()).toEqual(run())
})
