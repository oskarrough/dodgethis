import { beforeEach, afterEach, expect, test } from 'bun:test'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { STEP } from '../src/core/app.js'
import { createIntents, neutralFrame } from '../src/core/intents.js'
import { createSmoother } from '../src/core/smooth.js'
import { createSim } from '../src/plugins/moba/sim.js'
import { buildColliders, OBSTACLES, walkable } from '../src/plugins/moba/obstacles.js'
import { validFact } from '../src/plugins/moba/index.js'
import { createPathPlanner } from '../src/plugins/moba/path.js'
import { tune } from '../src/plugins/moba/tune.js'

await RAPIER.init({})
let sim, world, facts, intents, smoother, scene, unbuild
const ticks = (s) => Math.round(s / STEP)
function step(n = 1) {
	for (let i = 0; i < n; i++) {
		sim.step()
		intents.age(STEP)
		smoother.capture()
	}
}
function feed(id, frame) {
	intents.feed(id, { ...neutralFrame(), ...frame })
}
function shoot(target, damage, owner = 'A', team = 'A', slot = 'primary') {
	const p = target.body.position
	sim.shots.push({
		id: 100000 + sim.tick,
		owner,
		team,
		slot,
		target: target.id,
		x: p.x,
		z: p.z,
		dx: 1,
		dz: 0,
		speed: 24,
		radius: 0.12,
		range: 200,
		travelled: 0,
		passed: [],
		damage,
	})
}
beforeEach(() => {
	world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
	world.timestep = STEP
	unbuild = buildColliders(world, RAPIER)
	scene = new THREE.Scene()
	smoother = createSmoother()
	intents = createIntents()
	intents.use('pointClick')
	facts = []
	sim = createSim({
		scene,
		world,
		RAPIER,
		intents,
		heroes: [
			{ id: 'A', team: 'A' },
			{ id: 'B', team: 'B' },
		],
		lane: true,
		smooth: Object.assign((o, read) => smoother.add(o, read), { snap: (o) => smoother.snap(o) }),
		present: (fact) => facts.push(fact),
	})
})
afterEach(() => {
	sim?.dispose()
	unbuild()
	world.free()
})

test('first wave at 15 s, six per side; next on the fixed 45 s clock, meet near mid by 28 s', () => {
	step(ticks(15) - 1)
	expect(sim.lane.minions).toHaveLength(0)
	step()
	expect(sim.lane.minions).toHaveLength(12)
	for (const team of ['A', 'B'])
		expect(sim.lane.minions.filter((u) => u.team === team).map((u) => u.kind)).toEqual([
			'melee',
			'melee',
			'melee',
			'ranged',
			'ranged',
			'wizard',
		])
	step(ticks(13))
	expect(
		sim.lane.minions.some(
			(u) => u.target?.startsWith('minion-') && Math.abs(u.body.position.x) < 6,
		),
	).toBe(true)
	for (const u of sim.lane.minions) {
		expect(Math.abs(u.body.position.z)).toBeLessThanOrEqual(tune.waves.laneZ)
		expect(walkable(u.body.position.x, u.body.position.z, u.body.radius)).toBe(true)
	}
	step(ticks(17))
	expect(facts.filter((f) => f.type === 'spawn')).toHaveLength(24)
	expect(sim.snapshot().match.nextWave).toBe(ticks(75))
	expect(facts.every(validFact)).toBe(true)
})

test('tower prefers nearest minion over a closer hero; hero damage calls for help for two seconds', () => {
	step(ticks(15))
	const tower = sim.lane.structures[1],
		minion = sim.lane.minions[0]
	minion.body.position.set(13, 0.63, 0)
	sim.heroes[0].body.place(16, 1.05, 3)
	sim.heroes[1].body.place(19, 1.05, 3)
	step()
	expect(tower.target).toBe(minion.id)
	shoot(sim.heroes[1], 1)
	step()
	expect(tower.target).toBe('A')
	expect(tower.aggroUntil).toBe(sim.tick + ticks(2))
	minion.body.position.set(13, 0.63, 0)
	step(ticks(2) - 1)
	expect(tower.target).toBe('A')
	step()
	expect(tower.target).not.toBe('A')
	expect(facts.some((f) => f.type === 'aggro' && f.source === tower.id)).toBe(true)
})

test('tower windup is at least 0.3 s, cancels on target death; orb in flight survives source death', () => {
	const tower = sim.lane.structures[1]
	sim.heroes[0].body.place(12, 1.05, 0)
	step()
	expect(tower.attack.total).toBeGreaterThanOrEqual(ticks(0.3))
	step(ticks(0.3) - 1)
	expect(sim.shots).toHaveLength(0)
	step()
	expect(sim.shots.some((s) => s.slot === 'tower')).toBe(true)
	shoot(tower, 99999)
	step()
	expect(tower.dead).toBe(true)
	step(30)
	expect(sim.heroes[0].hp).toBeLessThan(tune.hero.hp)
	expect(OBSTACLES.some((o) => o.id === tower.id)).toBe(false)
	expect(sim.lane.teams.A.xp).toBe(tune.waves.structureXp)
})

test('hero death in a tower tell clears its target; respawn never resumes the old windup', () => {
	const tower = sim.lane.structures[1],
		hero = sim.heroes[0]
	hero.body.place(12, 1.05, 0)
	step()
	expect(tower.attack).not.toBeNull()
	shoot(hero, 99999, 'B', 'B')
	step()
	expect(hero.dead).toBe(true)
	step()
	expect(tower.attack).toBeNull()
	expect(tower.target).toBeNull()
	step(hero.respawnTick - sim.tick)
	expect(hero.dead).toBe(false)
	expect(hero.attack).toBeNull()
	expect(tower.attack).toBeNull()
})

test('minions prefer minion, then structure, then hero; help and leash return to their file', () => {
	step(ticks(15))
	const minion = sim.lane.minions[0],
		enemy = sim.lane.minions[6]
	minion.body.position.set(12, 0.63, -2)
	enemy.body.position.set(16, 0.63, -2)
	sim.heroes[1].body.place(13, 1.05, -2)
	step()
	expect(minion.target).toBe(enemy.id)
	enemy.body.position.set(40, 0.63, 0)
	step()
	expect(minion.target).toBe('tower-B')
	minion.body.position.set(0, 0.63, 0)
	sim.heroes[1].body.place(2, 1.05, 0)
	sim.heroes[0].body.place(-1, 1.05, 0)
	shoot(sim.heroes[0], 1, 'B', 'B')
	step()
	expect(minion.forced).toBe('B')
	minion.body.position.z = minion.file + tune.waves.leash + 1
	step()
	expect(minion.target).toBeNull()
	expect(minion.returning).toBe(true)
	step(180)
	expect(minion.returning).toBe(false)
})

test('soak is credited regardless of killer, but not to distant or dead heroes; abilities deal quarter damage to towers', () => {
	step(ticks(15))
	const enemy = sim.lane.minions[6]
	enemy.body.position.set(0, 0.63, 0)
	sim.heroes[0].body.place(-2, 1.05, 0)
	shoot(enemy, 99999, 'minion-1')
	step()
	expect(sim.lane.teams.A.xp).toBe(40)
	const far = sim.lane.minions.find((u) => u.team === 'B')
	shoot(far, 99999)
	step()
	expect(sim.lane.teams.A.xp).toBe(40)
	const tower = sim.lane.structures[1]
	shoot(tower, 140, 'A', 'A', 'slot1')
	step()
	expect(tower.hp).toBe(2400 - 35)
	expect(facts.some((f) => f.type === 'xp' && f.amount === 40)).toBe(true)
})

test('orders and pad primary can attack a tower through its own silhouette; movement cancels hero windup', () => {
	const hero = sim.heroes[0],
		tower = sim.lane.structures[1]
	hero.body.place(12, 1.05, 0)
	feed('A', { pressed: [{ action: 'primary', at: { x: 18, z: 0 } }] })
	step()
	expect(hero.order.target).toBe(tower.id)
	feed('A', { move: { x: -1, z: 0 } })
	step()
	expect(hero.attack).toBeNull()
	feed('A', { order: { x: 18, z: 0 } })
	step(ticks(tune.attack.windup) + 25)
	expect(tower.hp).toBeLessThan(tower.maxHp)
})

test('lane bodies, tower tell and tethers interpolate; disposal removes smooth registrations and collision', () => {
	step(ticks(15))
	const unit = sim.lane.minions[0]
	step()
	const x = unit.body.position.x
	smoother.pose(0.5)
	expect(unit.body.mesh.position.x).toBeLessThan(x)
	const tower = sim.lane.structures[1]
	sim.heroes[0].body.place(12, 1.05, 0)
	step()
	smoother.pose(0.5)
	const locate = (id) => sim.find(id)?.body.mesh.position
	sim.laneView.update(sim.lane, sim.heroes, 0, locate)
	const scale = tower.body.visual.scale.x
	sim.laneView.update(sim.lane, sim.heroes, 0.5, locate)
	expect(tower.body.visual.scale.x).toBeGreaterThan(scale)
	sim.dispose()
	expect(smoother.size).toBe(0)
	expect(OBSTACLES.some((o) => o.kind === 'tower')).toBe(false)
	sim = null
})

test('per-tick targeting and movement fit a 4 ms budget with 120 minions', () => {
	step(ticks(15))
	const base = sim.lane.minions.slice()
	for (let i = 0; i < 108; i++) {
		const original = base[i % base.length]
		sim.lane.minions.push({
			...original,
			id: `load-${i}`,
			attack: null,
			body: sim.laneView.makeBody(
				original.body.position.x,
				original.file,
				original.team,
				original.kind,
			),
		})
	}
	for (const unit of sim.lane.minions) {
		unit.body.position.x = unit.team === 'A' ? -3 : 3
		unit.hp = unit.maxHp = 100000
	}
	step(60)
	const samples = []
	for (let i = 0; i < 120; i++) {
		const start = performance.now()
		sim.step()
		samples.push(performance.now() - start)
	}
	samples.sort((a, b) => a - b)
	console.log(`lane full tick p95: ${samples[114].toFixed(3)} ms / 4 ms`)
	expect(samples[114]).toBeLessThan(4)
})

test('tower release cadence includes its tell, and live range changes cancel a tell', () => {
	const tower = sim.lane.structures[1]
	sim.heroes[0].body.place(12, 1.05, 0)
	step(180)
	const releases = facts.filter((f) => f.type === 'projectile' && f.hero === tower.id)
	expect(releases.map((f) => f.tick)).toEqual([19, 79, 139])
	const old = tune.tower.range
	try {
		step()
		expect(tower.attack).not.toBeNull()
		tune.tower.range = 1
		step()
		expect(tower.target).toBeNull()
		expect(tower.attack).toBeNull()
	} finally {
		tune.tower.range = old
	}
})

test('minion death cancels a tell and a lost-target orb emits an expiry fact', () => {
	step(ticks(15))
	const unit = sim.lane.minions[0],
		enemy = sim.lane.minions[6]
	unit.body.position.set(0, 0.63, -2)
	enemy.body.position.set(0.8, 0.63, -2)
	step()
	expect(unit.attack).not.toBeNull()
	shoot(unit, 99999, 'B', 'B')
	step()
	expect(unit.dead).toBe(true)
	expect(unit.attack).toBeNull()
	step()
	expect(sim.find(unit.id)).toBeUndefined()
	expect(facts.some((f) => f.type === 'projectile' && f.hero === unit.id)).toBe(false)
	enemy.body.position.set(12, 0.63, 0)
	enemy.team = 'A'
	step(20)
	expect(sim.shots.some((s) => s.target === enemy.id && s.slot === 'tower')).toBe(true)
	shoot(enemy, 99999)
	step()
	expect(facts.some((f) => f.type === 'expired' && f.reason === 'targetLost')).toBe(true)
})

test('tower detours plan once per order inside an 8 ms p95 budget', () => {
	const plan = createPathPlanner({ radius: tune.hero.radius, ...tune.orders })
	const from = { x: -48, z: 0 },
		to = { x: 48, z: 0 }
	for (let i = 0; i < 10; i++) plan(from, to)
	const samples = [],
		wall = []
	for (let i = 0; i < 50; i++) {
		const start = performance.now(),
			cpu = process.cpuUsage()
		const path = plan(from, to)
		const used = process.cpuUsage(cpu)
		samples.push((used.user + used.system) / 1000)
		wall.push(performance.now() - start)
		expect(path.length).toBeGreaterThan(1)
	}
	// CPU time excludes preemption by other agents on this shared machine; report wall time too.
	samples.sort((a, b) => a - b)
	wall.sort((a, b) => a - b)
	console.log(
		`tower path p95: ${samples[47].toFixed(3)} ms CPU / 8 ms; ${wall[47].toFixed(3)} ms wall`,
	)
	expect(samples[47]).toBeLessThan(8)
})
