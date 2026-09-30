import { expect, test } from 'bun:test'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { STEP } from '../src/core/app.js'
import { createIntents, neutralFrame } from '../src/core/intents.js'
import { createSim } from '../src/plugins/moba/sim.js'
import { practiceRoster } from '../src/plugins/moba/bots.js'
import { buildColliders } from '../src/plugins/moba/obstacles.js'
import { tune } from '../src/plugins/moba/tune.js'

await RAPIER.init({})

// Half-second decisions, no dodge prediction, no Ball routine, no injected damage.
// Follow the wave, attack screened structures, clear creeps, retreat below 55% HP, stop at firing range rather than chase into melee.
test('a cautious human wins the default easy Practice through ordinary intents', () => {
	const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
	world.timestep = STEP
	const unbuild = buildColliders(world, RAPIER)
	const intents = createIntents()
	intents.use('pointClick')
	const seats = practiceRoster('new-player')
	let deaths = 0,
		earlyDeaths = 0,
		hits = 0,
		casts = 0
	const sim = createSim({
		scene: new THREE.Scene(),
		world,
		RAPIER,
		intents,
		heroes: seats,
		bots: seats.filter((seat) => seat.id !== 'new-player'),
		lane: true,
		present(fact) {
			if (fact.type === 'death' && fact.target === 'new-player') {
				deaths++
				if (sim.tick < 180 / STEP) earlyDeaths++
			}
			if (fact.type === 'hit' && fact.source === 'new-player') hits++
			if (fact.type === 'cast' && fact.hero === 'new-player') casts++
		},
	})
	const hero = sim.heroes.find((h) => h.id === 'new-player')
	const distance = (unit) =>
		Math.hypot(
			unit.body.position.x - hero.body.position.x,
			unit.body.position.z - hero.body.position.z,
		)
	let retreating = false
	try {
		expect(
			seats.filter((seat) => seat.team === 'B').every((seat) => seat.difficulty === 'easy'),
		).toBe(true)
		while (!sim.lane.match.winner && sim.tick < 1200 / STEP) {
			if (sim.tick % 30 === 0 && !hero.dead) {
				const frame = neutralFrame()
				if (hero.hp < hero.maxHp * 0.55) retreating = true
				if (hero.hp > hero.maxHp * 0.9) retreating = false
				const wave = sim.lane.minions.filter((u) => !u.dead && u.team === hero.team)
				const enemies = [...sim.heroes, ...sim.lane.minions].filter(
					(u) => !u.dead && u.team !== hero.team && distance(u) < 10,
				)
				const guard = sim.lane.structures.find(
					(u) => !u.dead && u.team !== hero.team && sim.lane.vulnerable(u),
				)
				const screened =
					guard &&
					wave.filter(
						(u) =>
							Math.hypot(
								u.body.position.x - guard.body.position.x,
								u.body.position.z - guard.body.position.z,
							) < tune[guard.kind].range,
					).length >= 3
				const target = screened ? guard : enemies.sort((a, b) => distance(a) - distance(b))[0]
				const enemyTower = sim.lane.structures.some(
					(u) => !u.dead && u.team !== hero.team && distance(u) < tune[u.kind].range + 1,
				)
				const front = wave.sort((a, b) => b.body.position.x - a.body.position.x)[0]
				if (retreating) frame.order = { ...hero.spawn }
				else if (target && (!enemyTower || screened)) {
					const dx = target.body.position.x - hero.body.position.x
					const dz = target.body.position.z - hero.body.position.z
					const range = hero.definition.abilities.slot1.stats.range * 0.75
					const d = Math.max(0.01, distance(target))
					frame.order = {
						x: target.body.position.x - (dx / d) * range,
						z: target.body.position.z - (dz / d) * range,
					}
					const slot = !target.structure && !hero.cd[2] ? 'slot3' : !hero.cd[0] ? 'slot1' : null
					if (slot && distance(target) <= hero.definition.abilities[slot].stats.range)
						frame.pressed.push({
							action: slot,
							at: { x: target.body.position.x, z: target.body.position.z },
						})
				} else {
					frame.order = {
						x: Math.max(hero.spawn.x, Math.min(30, (front?.body.position.x ?? -18) - 3)),
						z: -2,
					}
				}
				intents.feed(hero.id, frame)
			}
			sim.step(STEP)
			intents.age(STEP)
		}
		console.log('cautious easy Practice:', {
			seconds: sim.tick * STEP,
			winner: sim.lane.match.winner,
			deaths,
			earlyDeaths,
			hits,
			casts,
		})
		expect(sim.lane.match.winner).toBe(hero.team)
		expect(earlyDeaths).toBeLessThanOrEqual(1)
		expect(casts).toBeGreaterThan(0)
		expect(hits).toBeGreaterThan(0)
		expect(sim.lane.structures.find((u) => u.kind === 'core' && u.team !== hero.team).dead).toBe(
			true,
		)
	} finally {
		sim.dispose()
		unbuild()
		world.free()
	}
}, 120000)
