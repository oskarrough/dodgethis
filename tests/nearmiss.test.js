import { describe, expect, test } from 'bun:test'
import { createNearMissTracker } from '../src/nearmiss.js'

// Pure-logic near-miss tracking with fake arrows/units: only the getters the scan reads exist here.

function fakeUnit(id, team, x, z, { alive = true, isHuman = false } = {}) {
	return { id, team, alive, isHuman, position: { x, y: 1, z } }
}

function fakeArrow(id, ownerTeam, { kind = 'arrow', perfect = false } = {}) {
	const arrow = {
		id,
		ownerTeam,
		kind,
		perfect,
		state: 'flying',
		position: { x: 0, y: 1, z: 0 },
		velocity: { x: 1, y: 0, z: 0 },
		snapshotImpact() {
			return {
				type: 'impact',
				arrowId: id,
				kind,
				perfect,
				source: { id: 99, team: ownerTeam, isHuman: true },
				point: { ...arrow.position },
				pointKind: 'projectile',
				direction: { ...arrow.velocity },
			}
		},
	}
	return arrow
}

function harness(radius = 1.2) {
	const tracker = createNearMissTracker({ radius })
	const events = []
	const present = (event) => events.push(event)
	return { tracker, events, scan: (arrows, units) => tracker.scan(arrows, units, present) }
}

// Fly the arrow along +x at height 1, passing the origin at lateral offset `z`.
function flyPast(h, arrow, units, z, xs = [-3, -2, -1, -0.5, 0, 0.5, 1, 2, 3]) {
	for (const x of xs) {
		arrow.position = { x, y: 1, z }
		h.scan([arrow], units)
	}
}

describe('near-miss tracker', () => {
	test('emits once for an enemy pass inside the radius, and for nothing else', () => {
		const h = harness()
		const target = fakeUnit(1, 'B', 0, 0)
		const arrow = fakeArrow(5, 'A', { perfect: true })
		flyPast(h, arrow, [target], 0.5)
		expect(h.events).toHaveLength(1)
		const [event] = h.events
		expect(event.type).toBe('impact')
		expect(event.outcome).toBe('nearMiss')
		expect(event.kind).toBe('arrow')
		expect(event.perfect).toBe(true)
		expect(event.source).toEqual({ id: 99, team: 'A', isHuman: true })
		expect(event.target).toEqual({ id: 1, team: 'B', isHuman: false })
		expect(event.distance).toBeCloseTo(0.5, 6)
		expect(event.point).toEqual({ x: 0, y: 1, z: 0.5 })
		expect(event.direction).toEqual({ x: 1, y: 0, z: 0 })
		// Keeps receding: nothing more, and landing later adds nothing either.
		flyPast(h, arrow, [target], 0.5, [4, 5, 6])
		arrow.state = 'grounded'
		h.scan([arrow], [target])
		expect(h.events).toHaveLength(1)

		// A wide pass, a teammate, and a shot sailing overhead are all silent.
		const wide = harness()
		flyPast(wide, fakeArrow(5, 'A'), [fakeUnit(1, 'B', 0, 0)], 1.5)
		expect(wide.events).toHaveLength(0)
		const ally = harness()
		flyPast(ally, fakeArrow(5, 'A'), [fakeUnit(1, 'A', 0, 0)], 0.3)
		expect(ally.events).toHaveLength(0)
		const above = harness()
		const high = fakeArrow(5, 'A')
		for (const x of [-1, 0, 1]) {
			high.position = { x, y: 5, z: 0 }
			above.scan([high], [target])
		}
		expect(above.events).toHaveLength(0)
	})

	test('emits on landing while still closing inside the radius', () => {
		const h = harness()
		const target = fakeUnit(1, 'B', 0, 0, { isHuman: true })
		const arrow = fakeArrow(5, 'A')
		flyPast(h, arrow, [target], 0.6, [-3, -2, -1])
		expect(h.events).toHaveLength(0)
		arrow.state = 'grounded'
		arrow.position = { x: -1, y: 0.045, z: 0.6 }
		h.scan([arrow], [target])
		expect(h.events).toHaveLength(1)
		expect(h.events[0].target.isHuman).toBe(true)
		expect(h.events[0].distance).toBeCloseTo(Math.hypot(1, 0.6), 6)
		h.scan([arrow], [target])
		expect(h.events).toHaveLength(1)
		// A reset forgets the pair, so a re-scan cannot replay the miss.
		h.tracker.reset()
		h.scan([arrow], [target])
		expect(h.events).toHaveLength(1)
	})

	test('does not emit for a unit that died, nor for the unit the arrow actually hit', () => {
		const h = harness()
		const target = fakeUnit(1, 'B', 0, 0)
		const arrow = fakeArrow(5, 'A')
		flyPast(h, arrow, [target], 0.2, [-3, -2, -1])
		target.alive = false // eliminated by the contact this step
		arrow.state = 'grounded'
		h.scan([arrow], [target])
		expect(h.events).toHaveLength(0)

		// Godmode deflect: the target survives but the arrow drops at contact distance.
		const h2 = harness()
		const human = fakeUnit(2, 'A', 0, 0, { isHuman: true })
		const shot = fakeArrow(6, 'B')
		flyPast(h2, shot, [human], 0, [-3, -2, -1, -0.45])
		shot.state = 'grounded'
		shot.position = { x: -0.45, y: 0.045, z: 0 }
		h2.scan([shot], [human])
		expect(h2.events).toHaveLength(0)
	})
})
