import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { legacyState } from './moba-legacy-state.js'
import { createHash } from 'node:crypto'
import { STEP } from '../src/core/app.js'
import { createIntents } from '../src/core/intents.js'
import { createSim } from '../src/plugins/moba/sim.js'
import { tune } from '../src/plugins/moba/tune.js'
import { buildColliders } from '../src/plugins/moba/obstacles.js'

// Every tick's complete legacy state AND facts enter the running digest. Checkpoints
// bound fixture size; a mismatch on any tick changes every subsequent checkpoint.
export async function heroTrace() {
	await RAPIER.init({})
	// This fixture proves the table migration, not M4's deliberate siege retune.
	const saved = {
		tower: tune.tower.damage,
		fort: tune.fort.damage,
		core: tune.core.damage,
		ball: tune.ball.interval,
		lateBall: tune.ball.lateInterval,
		late: tune.match.late,
		lateGun: tune.match.lateGunDamage,
		growth: tune.waves.growth,
		lateWave: tune.waves.lateInterval,
	}
	tune.tower.damage = 110
	tune.fort.damage = 160
	tune.core.damage = 180
	tune.ball.interval = 150
	tune.ball.lateInterval = 90
	tune.match.late = 600
	tune.match.lateGunDamage = 1
	tune.waves.growth = 0
	tune.waves.lateInterval = tune.waves.interval
	const bruteCount = tune.minions.brute.count
	tune.minions.brute.count = 0
	const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
	world.timestep = STEP
	const unbuild = buildColliders(world, RAPIER)
	const intents = createIntents()
	intents.use('pointClick')
	const seats = ['A', 'B'].flatMap((team) => [1, 2, 3].map((i) => ({ id: `${team}${i}`, team })))
	let facts = []
	let sim
	const feed = intents.feed
	const coverage = { vault: 0, rain: 0, momentum: 0 }
	intents.feed = (id, frame) => {
		if (sim && (id === 'A1' || id === 'B1')) {
			const hero = sim.heroes.find((h) => h.id === id)
			const p = hero.body.position
			if (!hero.dead && !hero.cast && !hero.body.dashing && !sim.ball.carrying(hero)) {
				const enemy = sim.heroes.find(
					(h) =>
						h.team !== hero.team &&
						!h.dead &&
						Math.hypot(h.body.position.x - p.x, h.body.position.z - p.z) < 8,
				)
				const slot =
					enemy && hero.cd[1] === 0 && hero.cd[0] === 0
						? 'slot2'
						: sim.tick % 420 === 0 && hero.cd[2] === 0
							? 'slot3'
							: null
				if (slot) {
					const at = enemy
						? { x: enemy.body.position.x, z: enemy.body.position.z }
						: { x: p.x + (hero.team === 'A' ? 6 : -6), z: p.z }
					frame = { ...frame, pressed: [{ action: slot, at }] }
				}
			}
		}
		feed(id, frame)
	}
	sim = createSim({
		scene: new THREE.Scene(),
		world,
		RAPIER,
		intents,
		heroes: seats,
		lane: true,
		scripted: seats.map((s) => s.id),
		present: (f) => facts.push(f),
	})
	const digest = createHash('sha256')
	const checkpoints = []
	try {
		for (let tick = 1; tick <= 43200; tick++) {
			const vaultBefore = new Map(sim.heroes.map((h) => [h.id, h.cd[1]]))
			sim.step()
			intents.age(STEP)
			for (const fact of facts) {
				if (fact.type === 'cast' && fact.slot === 'slot2') coverage.vault++
				if (fact.type === 'cast' && fact.slot === 'slot3') coverage.rain++
				if (
					fact.type === 'hit' &&
					fact.slot === 'slot1' &&
					sim.heroes.some((h) => h.id === fact.target) &&
					(vaultBefore.get(fact.source) ?? 0) > 1 &&
					sim.heroes.find((h) => h.id === fact.source).cd[1] < vaultBefore.get(fact.source) - 1
				)
					coverage.momentum++
				delete fact.ability
			}
			const state = legacyState(sim.snapshot())
			digest.update(JSON.stringify([state, facts]))
			facts = []
			if (tick % 60 === 0 || sim.lane.match.winner)
				checkpoints.push([tick, digest.copy().digest('hex')])
			if (sim.lane.match.winner) break
		}
		return {
			source: 'b5f7e7b + Loose castPoint=0.3, speed=20 (before hero table)',
			checkpoints,
			coverage,
			winner: sim.lane.match.winner,
			tick: sim.tick,
		}
	} finally {
		tune.tower.damage = saved.tower
		tune.fort.damage = saved.fort
		tune.core.damage = saved.core
		tune.ball.interval = saved.ball
		tune.ball.lateInterval = saved.lateBall
		tune.match.late = saved.late
		tune.match.lateGunDamage = saved.lateGun
		tune.waves.growth = saved.growth
		tune.waves.lateInterval = saved.lateWave
		tune.minions.brute.count = bruteCount
		sim.dispose()
		unbuild()
		world.free()
	}
}
