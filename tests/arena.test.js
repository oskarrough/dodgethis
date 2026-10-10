import { expect, test } from 'bun:test'
import { ARENA, ammoPoint, makeRng, onCourt, spawnPoint } from '../src/plugins/dodgeball/arena.js'

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
