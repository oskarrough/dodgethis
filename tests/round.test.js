import { describe, expect, test } from 'bun:test'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { buildCourt } from '../src/court.js'
import { createRound } from '../src/round.js'
import { tune } from '../src/tune.js'

// Headless integration smoke test: boot the real game loop — Rapier world,
// court, a full Round with AI brains — and step it at 60Hz with the human
// standing still. The AI must arm itself, shoot, and wipe team A (or someone
// falls in); either way the round must end cleanly via onOver and dispose
// without throwing. Uses the -compat Rapier build because the bundler build's
// wasm doesn't load under bun.
await RAPIER.init({})

function makeCtx() {
	const scene = new THREE.Scene()
	const world = new RAPIER.World({ x: 0, y: tune.physics.gravity, z: 0 })
	world.timestep = 1 / 60
	buildCourt(scene, world, RAPIER)
	return {
		scene,
		world,
		RAPIER,
		eventQueue: new RAPIER.EventQueue(true),
		combat: { push() {} },
		sfx: { loose() {}, grab() {}, hit() {}, perfect() {}, roll() {}, win() {} },
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
		// A lone passive human against 3 archers loses (a draw is theoretically
		// possible but the human never shoots, so B must have units standing).
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
})
