import { beforeEach, afterEach, expect, test } from 'bun:test'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { STEP } from '../src/core/app.js'
import { createIntents, neutralFrame } from '../src/core/intents.js'
import { createSmoother } from '../src/core/smooth.js'
import { createSim } from '../src/plugins/moba/sim.js'
import { buildColliders, OBSTACLES, walkable, segmentClear } from '../src/plugins/moba/obstacles.js'
import { createFeedback } from '../src/plugins/moba/feedback.js'
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

test('first wave at 15 s, six per side; every 30 s thereafter (second at 45 s), meet near mid by 28 s', () => {
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
	expect(sim.lane.minions).toHaveLength(12)
	for (const unit of sim.lane.minions) expect(Math.abs(unit.body.position.x)).toBeLessThan(6)
	for (const u of sim.lane.minions) {
		expect(Math.abs(u.body.position.z)).toBeLessThanOrEqual(tune.waves.laneZ)
		expect(walkable(u.body.position.x, u.body.position.z, u.body.radius, 0, sim.obstacles)).toBe(
			true,
		)
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

test('minions prefer minion, then structure, then hero; help forces the diving hero', () => {
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
	expect(minion.target).toBe('B')
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
		const start = process.cpuUsage()
		sim.step()
		const used = process.cpuUsage(start)
		samples.push((used.user + used.system) / 1000)
	}
	samples.sort((a, b) => a - b)
	console.log(`lane full tick median: ${samples[60].toFixed(3)} ms CPU / 4 ms`)
	expect(samples[60]).toBeLessThan(4)
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

test('a tower kills its first minion, then fires at the next without a return-to-file state', () => {
	step(ticks(15))
	const [first, second] = sim.lane.minions.filter((u) => u.team === 'A')
	for (const unit of sim.lane.minions)
		if (unit !== first && unit !== second) {
			unit.dead = true
			unit.body.retire()
		}
	first.hp = 1
	first.body.position.set(15, 0.63, 0)
	second.hp = 1000
	second.body.position.set(13, 0.63, 2)
	step(180)
	expect(first.dead).toBe(true)
	const tower = sim.lane.structures[1]
	expect(tower.returning).toBeUndefined()
	expect(
		facts.some(
			(f) =>
				f.type === 'projectile' &&
				f.hero === tower.id &&
				f.tick > facts.find((f) => f.type === 'death' && f.target === first.id).tick,
		),
	).toBe(true)
	expect(second.hp).toBeLessThan(1000)
})

test('a hero kiting along the lane exhausts an 8 m chase leash, and the minion walks back', () => {
	step(ticks(15))
	const unit = sim.lane.minions[0],
		hero = sim.heroes[1]
	for (const other of sim.lane.minions)
		if (other !== unit) {
			other.dead = true
			other.body.retire()
		}
	unit.body.position.set(-8, 0.63, -2)
	hero.body.place(-4, 1.05, -2)
	feed('B', { move: { x: 0.7, z: 0 } })
	step()
	expect(unit.target).toBe('B')
	const origin = { ...unit.aggroOrigin }
	let n = 0
	while (!unit.returning && n++ < 240) step()
	expect(unit.returning).toBe(true)
	expect(Math.hypot(unit.body.position.x - origin.x, unit.body.position.z - origin.z)).toBeLessThan(
		tune.waves.leash + tune.minions.melee.speed * STEP,
	)
	expect(unit.target).toBeNull()
	while (unit.returning && n++ < 500) step()
	expect(unit.returning).toBe(false)
	expect(Math.abs(unit.body.position.x - origin.x)).toBeLessThan(0.2)
	expect(Math.abs(unit.body.position.z - unit.file)).toBeLessThan(0.2)
	step(60)
	expect(unit.returnGoal).toBeNull()
	expect(unit.body.position.x).toBeGreaterThan(origin.x + 1)
})

test('fresh call-for-help overrides a minion return leg', () => {
	step(ticks(15))
	const unit = sim.lane.minions[0]
	unit.body.position.set(0, 0.63, 1)
	unit.returning = true
	unit.returnGoal = { x: -4, z: unit.file }
	unit.path = null
	unit.target = null
	sim.heroes[0].body.place(-1, 1.05, 1)
	sim.heroes[1].body.place(2, 1.05, 1)
	shoot(sim.heroes[0], 1, 'B', 'B')
	step()
	expect(unit.returning).toBe(false)
	expect(unit.target).toBe('B')
	step()
	expect(unit.target).toBe('B')
})

test('repeated hero hits refresh the hold without resetting the tower tell or spamming aggro', () => {
	step(ticks(15))
	const tower = sim.lane.structures[1]
	sim.lane.minions[0].body.position.set(14, 0.63, 0)
	sim.heroes[0].body.place(12, 1.05, 3)
	sim.heroes[1].body.place(19, 1.05, 3)
	step()
	expect(tower.target).toBe(sim.lane.minions[0].id)
	shoot(sim.heroes[1], 1)
	step()
	const start = sim.tick
	for (let i = 0; i < 24; i++) {
		shoot(sim.heroes[1], 1)
		step()
	}
	expect(facts.filter((f) => f.type === 'aggro' && f.source === tower.id)).toHaveLength(1)
	expect(
		facts.some((f) => f.type === 'projectile' && f.hero === tower.id && f.tick === start + 19),
	).toBe(true)
	expect(tower.aggroUntil).toBe(sim.tick + ticks(2))
})

test('two lane sims and a training sim own independent obstacles through kills and disposal', () => {
	const extras = []
	const make = (lane) => {
		const otherWorld = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
		otherWorld.timestep = STEP
		const unbuildOther = buildColliders(otherWorld, RAPIER)
		const otherIntents = createIntents()
		otherIntents.use('pointClick')
		const other = createSim({
			scene: new THREE.Scene(),
			world: otherWorld,
			RAPIER,
			intents: otherIntents,
			heroes: [{ id: 'local', team: 'A' }],
			lane,
		})
		extras.push({ other, otherWorld, unbuildOther })
		return other
	}
	try {
		const second = make(true),
			training = make(false)
		expect(sim.obstacles.filter((o) => o.kind === 'tower')).toHaveLength(2)
		expect(second.obstacles.filter((o) => o.kind === 'tower')).toHaveLength(2)
		expect(training.obstacles).toEqual(OBSTACLES)
		expect(walkable(18, 0, 0.45, 0, training.obstacles)).toBe(true)
		expect(walkable(18, 0, 0.45, 0, second.obstacles)).toBe(false)
		shoot(sim.lane.structures[1], 99999)
		step()
		expect(walkable(18, 0, 0.45, 0, sim.obstacles)).toBe(true)
		expect(segmentClear({ x: 16, z: 0 }, { x: 20, z: 0 }, 0, second.obstacles)).toBe(false)
		sim.dispose()
		sim = null
		for (let i = 0; i < ticks(28); i++) second.step()
		expect(second.lane.minions).toHaveLength(12)
		expect(second.lane.minions.every((u) => Math.abs(u.body.position.x) < 6)).toBe(true)
		expect(OBSTACLES.some((o) => o.kind === 'tower')).toBe(false)
	} finally {
		for (const { other, otherWorld, unbuildOther } of extras) {
			other.dispose()
			unbuildOther()
			otherWorld.free()
		}
	}
})

test('aggro flashes its guard tether; only the local victim gets one warning ping per tick', () => {
	const oldDocument = globalThis.document
	globalThis.document = { querySelector: () => null }
	try {
		const pings = [],
			flashes = []
		const feedback = createFeedback({
			sim: { ...sim, laneView: { aggro: (body) => flashes.push(body) } },
			local: 'A',
			view: { ping: (...args) => pings.push(args) },
		})
		for (const target of ['B', 'A', 'A'])
			feedback.present({
				type: 'aggro',
				source: 'tower-B',
				target,
				tick: 1,
				point: { x: 18, z: 0 },
			})
		expect(flashes).toHaveLength(3)
		expect(pings).toHaveLength(1)
		expect(pings[0][0]).toBe('aggro')
		expect(pings[0][2].follow).toBe('A')
	} finally {
		if (oldDocument === undefined) delete globalThis.document
		else globalThis.document = oldDocument
	}
})

test('minion tells are distinct, interpolate, and span at least 20 pixels at the default camera', () => {
	step(ticks(15))
	const units = ['melee', 'ranged', 'wizard'].map((kind) =>
		sim.lane.minions.find((u) => u.kind === kind),
	)
	const camera = new THREE.PerspectiveCamera(tune.follow.fov, 1280 / 576, 0.1, 100)
	camera.position.set(0, tune.follow.height, tune.follow.back)
	camera.lookAt(0, 0, 0)
	camera.updateMatrixWorld()
	for (const [i, unit] of units.entries()) {
		unit.body.position.set((i - 1) * 2, 0.63, 0)
		unit.attack = { left: 9, total: 18 }
		unit.yaw = Math.PI / 2
		unit.body.face(unit.yaw)
	}
	smoother.capture()
	smoother.pose(1)
	sim.laneView.update(sim.lane, sim.heroes, 0, () => null)
	const shapes = new Set()
	for (const unit of units) {
		const tell = unit.body.tell,
			fill = tell.children[1]
		expect(tell.visible).toBe(true)
		shapes.add(fill.geometry.type + fill.geometry.parameters.segments)
		sim.laneView.update(sim.lane, sim.heroes, 0, () => null)
		const scale = fill.scale.x
		sim.laneView.update(sim.lane, sim.heroes, 0.5, () => null)
		expect(fill.scale.x).toBeGreaterThan(scale)
		scene.updateMatrixWorld(true)
		const p = tell.getWorldPosition(new THREE.Vector3())
		const left = p
			.clone()
			.add(new THREE.Vector3(-tune.laneView.tellSize / 2, 0, 0))
			.project(camera)
		const right = p
			.clone()
			.add(new THREE.Vector3(tune.laneView.tellSize / 2, 0, 0))
			.project(camera)
		expect((right.x - left.x) * 640).toBeGreaterThanOrEqual(20)
		unit.attack = null
	}
	expect(shapes.size).toBe(3)
	sim.laneView.update(sim.lane, sim.heroes, 0, () => null)
	for (const unit of units) expect(unit.body.tell.visible).toBe(false)
})

test('tower detours fit an 8 ms median CPU budget across repeated runs', () => {
	const plan = createPathPlanner({ radius: tune.hero.radius, ...tune.orders }, sim.obstacles)
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
		`tower path median: ${samples[25].toFixed(3)} ms CPU / 8 ms; ${wall[25].toFixed(3)} ms wall`,
	)
	expect(samples[25]).toBeLessThan(8)
})
