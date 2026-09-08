import { expect, test } from 'bun:test'
import {
	ARENA,
	ammoPoint,
	blockOutward,
	bounds,
	clamp,
	makeRng,
	onCourt,
	spawnPoint,
} from '../src/arena.js'

test('a narrower court moves every derived boundary with it', () => {
	const wide = bounds(0).x
	const original = ARENA.width
	try {
		ARENA.width = 6
		expect(bounds(0).x).toBe(3)
		expect(clamp(99, 0).x).toBe(3)
		expect(onCourt(3.5, 0)).toBe(false)
		expect(blockOutward({ x: 1, z: 0 }, 3, 0).x).toBe(0)
	} finally {
		ARENA.width = original
	}
	expect(bounds(0).x).toBe(wide)
	// The AI turns away well before a shot is allowed to come to rest, so bots never stand where ammo cannot land.
	expect(ARENA.inset.aiKite).toBeGreaterThan(ARENA.inset.aiEdge)
})

test('a seed rebuilds the same scatter; no seed does not', () => {
	const one = Array.from({ length: 8 }, () => ammoPoint(makeRng(42)))
	const two = Array.from({ length: 8 }, () => ammoPoint(makeRng(42)))
	expect(one).toEqual(two)
	expect(ammoPoint(makeRng(42))).not.toEqual(ammoPoint(makeRng(43)))
	// Every scattered arrow stays reachable, never out on the rim.
	const rng = makeRng(7)
	for (let i = 0; i < 200; i++) {
		const p = ammoPoint(rng)
		expect(onCourt(p.x, p.z, ARENA.inset.landing)).toBe(true)
	}
})

test('teams spawn on court, facing each other, without overlapping or sharing a half', () => {
	expect(spawnPoint('A')[2]).toBe(ARENA.spawnZ)
	expect(spawnPoint('B', 1, 3)[2]).toBe(-ARENA.spawnZ)
	for (const count of [20, 40]) {
		for (const team of ['A', 'B']) {
			const spots = Array.from({ length: count }, (_, i) => spawnPoint(team, i, count))
			for (let i = 0; i < spots.length; i++) {
				const [x, , z] = spots[i]
				expect(onCourt(x, z, ARENA.inset.aiEdge)).toBe(true)
				expect(team === 'A' ? z > 0 : z < 0).toBe(true)
				for (let j = 0; j < i; j++)
					expect(Math.hypot(x - spots[j][0], z - spots[j][2])).toBeGreaterThan(0.8)
			}
		}
	}
})
