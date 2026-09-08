import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { createBrain } from '../src/ai.js'

// The brain only reads these fields off a unit, so the economy behaviour is testable without booting Rapier or a Round.
function unit(team, x, z, { held = null, aim = [0, 0, -1], alive = true } = {}) {
	return {
		team,
		alive,
		heldArrow: held,
		dashReady: true,
		position: new THREE.Vector3(x, 1, z),
		aim: new THREE.Vector3(...aim),
	}
}
const arrow = (x, z, state = 'grounded') => ({
	state,
	position: new THREE.Vector3(x, 0, z),
	velocity: new THREE.Vector3(),
})

// Direction the brain wants to walk, as a unit vector on the ground plane.
const heading = (brain, ctx) => brain.think(ctx, 1 / 60).move

test('two empty-handed bots split up instead of racing for the same arrow', () => {
	const a = unit('B', 1.5, 0)
	const b = unit('B', 2.9, 0)
	const human = unit('A', 0, 11)
	// b is nearer to near (1.9) than to far (2.1), so nearest-first sends both at near.
	const near = arrow(1, 0)
	const far = arrow(5, 0)
	const ctx = { units: [human, a, b], arrows: [near, far] }

	// The two bots stand 1.4m apart and walk opposite ways: a wins near, b takes far.
	expect(heading(createBrain(a), ctx).x).toBeLessThan(-0.9)
	expect(heading(createBrain(b), ctx).x).toBeGreaterThan(0.9)

	// The last arrow on the court is contested even from behind: conceding hands over the whole pool.
	const trailing = unit('B', 0, 0)
	const leading = unit('B', 4.9, 0)
	const only = { units: [human, trailing, leading], arrows: [arrow(5, 0)] }
	expect(heading(createBrain(trailing), only).x).toBeGreaterThan(0.9)
})

test('an empty-handed bot weaves off the line of an armed enemy, and only then', () => {
	const bot = unit('B', 0, 0)
	const shooter = unit('A', 0, 10, { held: {}, aim: [0, 0, -1] }) // looking down -z at the bot
	const move = heading(createBrain(bot), { units: [shooter, bot], arrows: [arrow(0, -10)] })
	expect(move.z).toBeLessThan(0) // still closing on the arrow
	expect(Math.abs(move.x)).toBeGreaterThan(0.2) // but not on the shooter's line

	// An empty-handed enemy, or one looking elsewhere, is not a threat to dodge.
	const empty = unit('A', 0, 10, { aim: [0, 0, -1] })
	const straight = { units: [empty, bot], arrows: [arrow(0, -10)] }
	expect(Math.abs(heading(createBrain(bot), straight).x)).toBeLessThan(0.001)
	const away = unit('A', 0, 10, { held: {}, aim: [1, 0, 0] })
	const ignored = { units: [away, bot], arrows: [arrow(0, -10)] }
	expect(Math.abs(heading(createBrain(bot), ignored).x)).toBeLessThan(0.001)
})

test('pickup decisions persist between scans and immediately replace unavailable arrows', () => {
	const bot = unit('B', 0, 0)
	const enemy = unit('A', 0, 11, { held: {} })
	const left = arrow(-4, 0)
	const right = arrow(6, 0)
	const ctx = { units: [bot, enemy], arrows: [left, right] }
	const brain = createBrain(bot, { rng: () => 0.9 })
	expect(heading(brain, ctx).x).toBeLessThan(-0.9)
	right.position.x = 2
	expect(heading(brain, ctx).x).toBeLessThan(-0.9)
	left.state = 'held'
	expect(heading(brain, ctx).x).toBeGreaterThan(0.9)

	// Seeded phases stagger the strategic refresh, so bots re-pick on different beats.
	const fresh = { units: [bot, enemy], arrows: [arrow(-4, 0), arrow(6, 0)] }
	const early = createBrain(bot, { rng: () => 0.25 })
	const late = createBrain(bot, { rng: () => 0.9 })
	heading(early, fresh)
	heading(late, fresh)
	fresh.arrows[1].position.x = 2
	expect(early.think(fresh, 0.06).move.x).toBeGreaterThan(0.9)
	expect(late.think(fresh, 0.06).move.x).toBeLessThan(-0.9)
	expect(late.think(fresh, 0.2).move.x).toBeGreaterThan(0.9)
})

test('target choice is cached, tracks live positions, and replaces dead targets immediately', () => {
	const bot = unit('B', 0, 0, { held: {} })
	const left = unit('A', -4, 0)
	const right = unit('A', 6, 0)
	const ctx = { units: [bot, left, right], arrows: [] }
	const brain = createBrain(bot, { rng: () => 0.9 })
	heading(brain, ctx)
	expect(bot.aim.x).toBeLessThan(-0.9)
	right.position.x = 2
	heading(brain, ctx)
	expect(bot.aim.x).toBeLessThan(-0.9)
	left.position.z = 0.1
	heading(brain, ctx)
	expect(bot.aim.z).toBeGreaterThan(0)
	left.alive = false
	heading(brain, ctx)
	expect(bot.aim.x).toBeGreaterThan(0.9)
})

test('armed bots telegraph their shot and clear windup after release or disarming', () => {
	const bot = unit('B', 0, 0, { held: {} })
	const enemy = unit('A', 0, 10)
	const ctx = { units: [bot, enemy], arrows: [] }
	const brain = createBrain(bot, { rng: () => 0.5 })
	brain.think(ctx, 0.2)
	expect(bot.windup).toBeGreaterThan(0)
	expect(bot.windup).toBeLessThan(1)
	const shot = brain.think(ctx, 1).shoot
	expect(shot).not.toBeNull()
	expect(bot.windup).toBe(0)
	bot.heldArrow = null
	brain.think(ctx, 0.1)
	expect(bot.windup).toBe(0)
})

test('a pillar blocks shots until the line clears, and steers a pickup path around itself', () => {
	const pillar = { kind: 'pillar', x: 0, z: 0, r: 0.5, h: 2.2 }
	const bot = unit('B', -5, 0, { held: {} })
	const enemy = unit('A', 5, 0)
	const ctx = { units: [bot, enemy], arrows: [], obstacles: [pillar] }
	const brain = createBrain(bot, { rng: () => 0.5 })
	let shot = null
	for (let i = 0; i < 60; i++) shot = brain.think(ctx, 0.05).shoot // 3s of blindness, well past the 0.7s reaction
	expect(bot.windup).toBe(0)
	expect(shot).toBeNull()
	ctx.obstacles = []
	shot = brain.think(ctx, 1).shoot // sight restored: the same brain fires on the next beat
	expect(shot).not.toBeNull()
	expect(bot.windup).toBe(0)

	// An unarmed bot walks around the same pillar rather than into it.
	const walker = unit('B', 0, 0.7)
	const far = unit('A', 0, 11)
	const pickup = arrow(0, -5)
	const blocked = { units: [walker, far], arrows: [pickup], obstacles: [pillar] }
	expect(Math.abs(heading(createBrain(walker), blocked).x)).toBeGreaterThan(0.3)
	const clear = { units: [walker, far], arrows: [pickup] }
	expect(Math.abs(heading(createBrain(walker), clear).x)).toBeLessThan(0.01)

	// A missing obstacles list behaves exactly like an empty one.
	const armed = unit('B', 0, 0, { held: {} })
	const absent = { units: [armed, unit('A', 0, 10)], arrows: [] }
	const empty = { units: [armed, unit('A', 0, 10)], arrows: [], obstacles: [] }
	const a = createBrain(armed, { rng: () => 0.5 })
	const b = createBrain(armed, { rng: () => 0.5 })
	const ma = heading(a, absent)
	const mb = heading(b, empty)
	expect(ma.x).toBe(mb.x)
	expect(ma.z).toBe(mb.z)
	expect(a.think(absent, 1).shoot).toEqual(b.think(empty, 1).shoot)
})
