import { expect, test } from 'bun:test'
import { stepShot, interceptShot } from '../src/plugins/moba/skillshot.js'

const shot = (pierce = false) => ({
	x: 0,
	z: 0,
	dx: 1,
	dz: 0,
	speed: 20,
	radius: 0.1,
	range: 10,
	travelled: 0,
	passed: [],
	pierce,
	catchable: true,
})
const targets = [
	{ id: 'first', x: 1, z: 0, radius: 0.45 },
	{ id: 'second', x: 2, z: 0, radius: 0.45 },
]
test('piercing is a shot property, hits every body in a tick once, and respects cover', () => {
	const first = stepShot(shot(), 0.2, targets, -Infinity, [])
	expect(first.hit.id).toBe('first')
	const piercing = shot(true)
	const result = stepShot(piercing, 0.2, targets, -Infinity, [])
	expect(result.hits.map((h) => h.hit.id)).toEqual(['first', 'second'])
	expect(stepShot(piercing, 0.1, targets, -Infinity, []).hits).toHaveLength(0)
	const blocked = stepShot(shot(true), 0.2, targets, -Infinity, [
		{ kind: 'pillar', x: 1.5, z: 0, r: 0.2 },
	])
	expect(blocked.hits.map((h) => h.hit.id)).toEqual(['first'])
	expect(blocked.blocked).toBe(true)
})
test('the resolver gets explicit catch eligibility; homing basics never qualify', () => {
	const caught = []
	for (const projectile of [
		shot(),
		{ ...shot(), target: 'first' },
		{ ...shot(), catchable: false },
	])
		interceptShot(
			projectile,
			1 / 60,
			(context) => {
				caught.push(context.catchable)
				return false
			},
			{ obstacles: [] },
		)
	expect(caught).toEqual([true, false, false])
})
