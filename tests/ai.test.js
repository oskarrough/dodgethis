import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { createBrain } from '../src/ai.js'

// The brain only reads these fields off a unit, so the economy behaviour can be
// tested without booting Rapier or a Round.
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
})

test('the last arrow on the court is contested even from behind', () => {
	const a = unit('B', 0, 0)
	const b = unit('B', 4.9, 0)
	const human = unit('A', 0, 11)
	const only = arrow(5, 0)
	const ctx = { units: [human, a, b], arrows: [only] }
	// a is far behind b, but conceding hands over the whole pool.
	expect(heading(createBrain(a), ctx).x).toBeGreaterThan(0.9)
})

test('an empty-handed bot weaves off the line of an armed enemy', () => {
	const bot = unit('B', 0, 0)
	const shooter = unit('A', 0, 10, { held: {}, aim: [0, 0, -1] }) // looking down -z at the bot
	const ctx = { units: [shooter, bot], arrows: [arrow(0, -10)] }
	const move = heading(createBrain(bot), ctx)
	expect(move.z).toBeLessThan(0) // still closing on the arrow
	expect(Math.abs(move.x)).toBeGreaterThan(0.2) // but not on the shooter's line
})

test('no weave when the enemy is empty-handed or looking elsewhere', () => {
	const bot = unit('B', 0, 0)
	const empty = unit('A', 0, 10, { aim: [0, 0, -1] })
	const straight = { units: [empty, bot], arrows: [arrow(0, -10)] }
	expect(Math.abs(heading(createBrain(bot), straight).x)).toBeLessThan(0.001)

	const away = unit('A', 0, 10, { held: {}, aim: [1, 0, 0] })
	const ctx = { units: [away, bot], arrows: [arrow(0, -10)] }
	expect(Math.abs(heading(createBrain(bot), ctx).x)).toBeLessThan(0.001)
})
