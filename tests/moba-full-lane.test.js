import { beforeEach, afterEach, expect, test } from 'bun:test'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { STEP } from '../src/core/app.js'
import { createIntents, neutralFrame, validIntent } from '../src/core/intents.js'
import { createSim } from '../src/plugins/moba/sim.js'
import { buildColliders, walkable } from '../src/plugins/moba/obstacles.js'
import { validFact } from '../src/plugins/moba/index.js'
import { createFeedback } from '../src/plugins/moba/feedback.js'
import { createJuice } from '../src/core/juice.js'
import { inReach } from '../src/plugins/moba/lane.js'
import { tune } from '../src/plugins/moba/tune.js'

await RAPIER.init({})
let sim, world, intents, facts, unbuild, scene
const ticks = (seconds) => Math.round(seconds / STEP)
function boot(
	scripted = [],
	seats = [
		{ id: 'A', team: 'A' },
		{ id: 'B', team: 'B' },
	],
) {
	world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
	world.timestep = STEP
	unbuild = buildColliders(world, RAPIER)
	intents = createIntents()
	intents.use('pointClick')
	facts = []
	scene = new THREE.Scene()
	sim = createSim({
		scene,
		world,
		RAPIER,
		intents,
		lane: true,
		heroes: seats,
		scripted,
		present: (fact) => facts.push(fact),
	})
}
function step(n = 1) {
	for (let i = 0; i < n; i++) {
		sim.step()
		intents.age(STEP)
	}
}
function shot(target, damage, team = 'A', slot = 'primary', owner = team) {
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
const structure = (kind, team = 'B') =>
	sim.lane.structures.find((u) => u.kind === kind && u.team === team)
beforeEach(() => boot())
afterEach(() => {
	sim.dispose()
	unbuild()
	world.free()
})

test('pre-Ball structure HP scales to defending team size, not attacking team size', () => {
	for (const u of sim.lane.structures) expect(u.maxHp).toBeCloseTo(tune[u.kind].hp / 3)
	sim.dispose()
	unbuild()
	world.free()
	boot(
		[],
		[
			{ id: 'a1', team: 'A' },
			{ id: 'a2', team: 'A' },
			{ id: 'a3', team: 'A' },
			{ id: 'b1', team: 'B' },
			{ id: 'b2', team: 'B' },
		],
	)
	for (const u of sim.lane.structures)
		expect(u.maxHp).toBeCloseTo(tune[u.kind].hp * (u.team === 'A' ? 1 : 2 / 3))
})

test('both invulnerability chains shield all damage and unlock one link at a time; rubble loses collision', () => {
	for (const team of ['A', 'B']) {
		const killer = team === 'A' ? 'B' : 'A'
		const tower = structure('tower', team),
			fort = structure('fort', team),
			core = structure('core', team)
		for (const slot of ['primary', 'slot1', 'slot3', 'melee']) {
			shot(fort, 10000, killer, slot)
			step()
			shot(core, 10000, killer, slot)
			step()
		}
		expect(fort.hp).toBe(fort.maxHp)
		expect(core.hp).toBe(core.maxHp)
		expect(sim.lane.vulnerable(fort)).toBe(false)
		shot(tower, tower.hp, killer)
		step()
		expect(sim.lane.vulnerable(fort)).toBe(true)
		expect(sim.lane.vulnerable(core)).toBe(false)
		expect(sim.obstacles.some((o) => o.id === tower.id)).toBe(false)
		shot(fort, 400, killer, 'slot1')
		step()
		expect(fort.hp).toBe(fort.maxHp - 100)
		shot(fort, fort.hp, killer)
		step()
		expect(sim.lane.vulnerable(core)).toBe(true)
		expect(sim.obstacles.some((o) => o.id === fort.id)).toBe(false)
	}
	expect(facts.filter((f) => f.type === 'shielded')).toHaveLength(16)
	expect(facts.every(validFact)).toBe(true)
})

test('wizard globe belongs to the killer even without soak; enemy heroes cannot collect', () => {
	step(ticks(15))
	const wizard = sim.lane.minions.find((u) => u.kind === 'wizard' && u.team === 'B')
	shot(wizard, wizard.hp, 'A', 'primary', 'minion-fixture')
	step()
	const globe = sim.lane.globes[0]
	expect(globe.team).toBe('A')
	expect(sim.lane.teams.A.xp).toBe(0)
	const a = sim.heroes[0],
		b = sim.heroes[1]
	b.hp = 700
	b.body.place(globe.pos.x, 1.05, globe.pos.z)
	step()
	expect(sim.lane.globes).toHaveLength(1)
	expect(b.hp).toBe(700)
	a.hp = 700
	a.body.place(globe.pos.x, 1.05, globe.pos.z)
	step()
	expect(a.hp).toBe(700 + 1400 * tune.globes.heal)
	expect(sim.lane.globes).toHaveLength(0)
	expect(facts.some((f) => f.type === 'globe' && f.state === 'pickup' && f.target === 'A')).toBe(
		true,
	)
})

test('globes expire on the fixed clock and never heal a corpse', () => {
	sim.lane.globes.push({ id: 1, team: 'A', pos: { x: -48, y: 0.6, z: 0 }, expires: ticks(1) })
	const h = sim.heroes[0]
	h.dead = true
	h.hp = 0
	h.respawnTick = ticks(100)
	step(ticks(1) - 1)
	expect(sim.lane.globes).toHaveLength(1)
	expect(h.hp).toBe(0)
	step()
	expect(sim.lane.globes).toHaveLength(0)
	expect(facts.at(-1).state).toBe('expired')
})

test('core kill emits one win and freezes every timer, shot, wave and hero until restart', () => {
	for (const kind of ['tower', 'fort', 'core']) {
		const u = structure(kind)
		shot(u, u.hp)
		step()
	}
	expect(sim.lane.match.winner).toBe('A')
	expect(facts.filter((f) => f.type === 'matchOver')).toHaveLength(1)
	const snapshot = sim.snapshot(),
		count = facts.length
	intents.feed('A', {
		...neutralFrame(),
		order: { x: 0, z: 0 },
		pressed: [{ action: 'slot1', at: { x: 0, z: 0 } }],
	})
	step(ticks(40))
	expect(sim.snapshot()).toEqual(snapshot)
	expect(facts).toHaveLength(count)
})

test('shared XP levels scale living and dead heroes, cap at 10, and reward takedowns', () => {
	const a = sim.heroes[0],
		b = sim.heroes[1]
	a.hp = 700
	sim.lane.addXp('A', 600, a.body.position)
	expect(a.level).toBe(2)
	expect(a.maxHp).toBe(1456)
	expect(a.hp).toBe(756)
	a.dead = true
	a.hp = 0
	a.respawnTick = sim.tick + 1
	sim.lane.addXp('A', 700, a.body.position)
	expect(a.level).toBe(3)
	expect(a.hp).toBe(0)
	step()
	expect(a.hp).toBe(a.maxHp)
	sim.lane.addXp('A', 100000, a.body.position)
	expect(a.level).toBe(10)
	expect(sim.lane.teams.A.level).toBe(10)
	expect(a.maxHp).toBeCloseTo(tune.hero.hp * 1.36)
	sim.lane.addXp('B', 600, b.body.position)
	const previous = sim.lane.teams.A.xp
	shot(b, b.hp)
	step()
	expect(sim.lane.teams.A.xp - previous).toBe(tune.levels.takedown + 2 * tune.levels.victimLevel)
	expect(b.respawnTick - sim.tick).toBe(ticks(tune.respawn.base + 2 * tune.respawn.perLevel))
})

test('levels increase damage from real intent-driven basics, Q and Rain', () => {
	const a = sim.heroes[0],
		b = sim.heroes[1]
	a.body.place(-2, 1.05, 0)
	b.body.place(2, 1.05, 0)
	sim.lane.addXp('A', tune.levels.first, a.body.position)
	const multiplier = 1 + tune.levels.growth
	intents.feed('A', { ...neutralFrame(), pressed: [{ action: 'slot1', at: { x: 2, z: 0 } }] })
	step(ticks(0.5))
	expect(b.hp).toBeCloseTo(b.maxHp - tune.loose.damage * multiplier)
	const beforeBasic = b.hp
	intents.feed('A', { ...neutralFrame(), order: { x: 2, z: 0 } })
	step(ticks(0.4))
	expect(b.hp).toBeCloseTo(beforeBasic - tune.attack.damage * multiplier)
	const beforeRain = b.hp
	intents.feed('A', {
		...neutralFrame(),
		pressed: [{ action: 'slot3', at: { x: 2, z: 0 } }, { action: 'stop' }],
	})
	step(ticks(1))
	// Stop deliberately clears buffered abilities; a fresh E is the legal cast.
	expect(b.hp).toBe(beforeRain)
	intents.feed('A', { ...neutralFrame(), pressed: [{ action: 'slot3', at: { x: 2, z: 0 } }] })
	step(ticks(1))
	expect(b.hp).toBeCloseTo(beforeRain - tune.rain.damage * multiplier)
})

for (const state of ['cast', 'windup', 'dash', 'projectile'])
	test(`lane death/respawn during ${state} clears timed state without erasing a released shot`, () => {
		const a = sim.heroes[0],
			b = sim.heroes[1]
		a.body.place(-2, 1.05, 0)
		b.body.place(2, 1.05, 0)
		const frame =
			state === 'windup'
				? { order: { x: 2, z: 0 } }
				: { pressed: [{ action: state === 'dash' ? 'slot2' : 'slot1', at: { x: 10, z: 0 } }] }
		intents.feed('A', { ...neutralFrame(), ...frame })
		step(state === 'projectile' ? ticks(tune.loose.castPoint) : 1)
		if (state === 'cast') expect(a.cast).not.toBeNull()
		if (state === 'windup') expect(a.attack.phase).toBe('windup')
		if (state === 'dash') expect(a.body.dashing).toBe(true)
		if (state === 'projectile') expect(sim.shots.some((s) => s.owner === 'A')).toBe(true)
		shot(a, a.hp, 'B')
		step()
		expect(a.dead).toBe(true)
		expect(a.cast).toBeNull()
		expect(a.attack).toBeNull()
		expect(a.order).toBeNull()
		step(a.respawnTick - sim.tick)
		expect(a.dead).toBe(false)
		expect(a.hp).toBe(a.maxHp)
		expect(a.body.dashing).toBe(false)
		expect(a.cast).toBeNull()
		expect(a.order).toBeNull()
	})

test('own base heals 10% max HP per second, never an enemy base or dead hero; trickle starts at 30 s', () => {
	const a = sim.heroes[0]
	a.hp = 700
	step(ticks(1))
	expect(a.hp).toBeCloseTo(840)
	for (const guard of sim.lane.structures) guard.attackTick = Infinity
	a.body.place(48, 1.05, 0)
	a.hp = 700
	step(ticks(1))
	expect(a.hp).toBe(700)
	step(ticks(28) - 1)
	expect(sim.lane.teams.A.xp).toBe(0)
	step()
	expect(sim.lane.teams.A.xp).toBe(8)
	expect(sim.lane.teams.B.xp).toBe(8)
})

test('fort/core domes, distinct poses, cracks and globe interpolation dispose cleanly', () => {
	const fort = structure('fort'),
		core = structure('core')
	sim.laneView.update(sim.lane, sim.heroes, 0, (id) => sim.find(id)?.body.mesh.position)
	expect(fort.body.dome.visible).toBe(true)
	expect(core.body.dome.visible).toBe(true)
	shot(structure('tower'), 2400)
	step()
	sim.laneView.update(sim.lane, sim.heroes, 0.5, (id) => sim.find(id)?.body.mesh.position)
	expect(fort.body.dome.visible).toBe(false)
	expect(core.body.dome.visible).toBe(true)
	core.hp = core.maxHp / 3
	core.attack = { left: 10, total: 18 }
	sim.laneView.update(sim.lane, sim.heroes, 0, () => null)
	const rotation = core.body.crystal.rotation.y,
		lift = core.body.visual.position.y
	sim.laneView.update(sim.lane, sim.heroes, 0.5, () => null)
	expect(core.body.crystal.rotation.y).toBeGreaterThan(rotation)
	expect(core.body.visual.position.y).toBeGreaterThan(lift)
	expect(core.body.cracks.every((c) => c.visible)).toBe(true)
})

test('five-minute intent-driven scripted match: whole population stays walkable, no stuck units, sane shared XP', () => {
	sim.dispose()
	unbuild()
	world.free()
	boot(['A', 'B'])
	const histories = new Map()
	const xp = { A: 0, B: 0 }
	for (let t = 0; t < ticks(300); t++) {
		step()
		if (t % ticks(1) !== 0) continue
		for (const hero of sim.heroes) expect(validIntent(intents.get(hero.id))).toBe(true)
		for (const unit of [...sim.heroes, ...sim.lane.minions]) {
			if (unit.dead) {
				histories.delete(unit.id)
				continue
			}
			const p = unit.body.position
			expect(Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(unit.hp)).toBe(true)
			expect(walkable(p.x, p.z, unit.body.radius, 0, sim.obstacles)).toBe(true)
			const old = histories.get(unit.id)
			if (!old || Math.hypot(p.x - old.x, p.z - old.z) >= 2)
				histories.set(unit.id, { x: p.x, z: p.z, t })
			else if (t - old.t >= ticks(30)) {
				// Holding a base, waiting behind a guard or fighting is not a stuck route.
				const target = sim.find(unit.kind ? unit.target : unit.order?.target)
				const fighting =
					target &&
					inReach(unit, target, unit.kind ? tune.minions[unit.kind].range : tune.orders.attackRange)
				expect(
					fighting ||
						(!unit.kind &&
							(unit.order === null ||
								Math.hypot(unit.order.goal.x - p.x, unit.order.goal.z - p.z) <=
									tune.orders.arrival)),
				).toBe(true)
				histories.set(unit.id, { x: p.x, z: p.z, t })
			}
		}
		for (const team of ['A', 'B']) {
			const state = sim.lane.teams[team]
			expect(state.xp).toBeGreaterThanOrEqual(xp[team])
			expect(state.xp).toBeLessThan(15000)
			expect(state.level).toBeGreaterThanOrEqual(1)
			expect(state.level).toBeLessThanOrEqual(tune.levels.cap)
			xp[team] = state.xp
		}
	}
	expect(sim.tick).toBe(ticks(300))
	expect(facts.some((f) => f.type === 'structureDown')).toBe(true)
	for (const team of ['A', 'B']) {
		expect(xp[team]).toBeGreaterThan(8 * 270)
		expect(sim.lane.teams[team].level).toBeGreaterThan(3)
		expect(facts.some((f) => f.type === 'cast' && f.hero === team && f.slot === 'slot1')).toBe(true)
	}
	expect(facts.every(validFact)).toBe(true)
	console.log('five-minute XP', sim.lane.teams, 'living minions', sim.lane.minions.length)
}, 60000)

for (const [scripted, limit] of [
	[['B'], 600],
	[['A', 'B'], 1200],
])
	test(`real play ${scripted.length === 1 ? 'scripted vs idle' : 'scripted vs scripted'} destroys a core before ${limit / 60} minutes`, () => {
		sim.dispose()
		unbuild()
		world.free()
		boot(scripted)
		while (!sim.lane.match.winner && sim.tick < ticks(limit)) step()
		expect(sim.lane.match.winner).not.toBeNull()
		if (scripted.length === 1) expect(sim.lane.match.winner).toBe('B')
		const winner = sim.lane.match.winner
		const defeated = winner === 'A' ? 'B' : 'A'
		expect(
			facts.filter((f) => f.type === 'structureDown' && f.team === winner).map((f) => f.target),
		).toEqual(['tower', 'fort', 'core'].map((kind) => `${kind}-${defeated}`))
		expect(facts.filter((f) => f.type === 'matchOver')).toHaveLength(1)
		expect(facts.every(validFact)).toBe(true)
		console.log('real-play win', scripted, sim.tick * STEP, sim.lane.teams)
	}, 120000)

test('shielded structures are not picks; unlock restores picking and a shield hit flashes only its dome', () => {
	const fort = structure('fort')
	expect(sim.pick('A', fort.body.position)).toBeNull()
	const h = sim.heroes[0]
	h.body.place(fort.body.position.x - 6, 1.05, 0)
	intents.feed('A', {
		...neutralFrame(),
		pressed: [{ action: 'primary', at: { x: fort.body.position.x, z: 0 } }],
	})
	step()
	expect(h.order).toBeNull()
	sim.laneView.shield(fort.body)
	sim.laneView.update(sim.lane, sim.heroes, 0.5, () => null)
	expect(fort.body.dome.scale.x).toBeGreaterThan(1)
	expect(structure('core').body.dome.scale.x).toBe(1)
	shot(structure('tower'), structure('tower').hp)
	step()
	expect(sim.pick('A', fort.body.position).id).toBe(fort.id)
})

test('passive and enemy XP are silent; local earned XP gets one popup and cue; structure death never clones a corpse', () => {
	const previous = globalThis.document
	globalThis.document = { querySelector: () => null }
	const juice = createJuice(scene)
	const cues = [],
		popups = [],
		banners = []
	const feedback = createFeedback({
		juice,
		sim,
		local: 'A',
		view: {
			xp: (...args) => popups.push(args),
			unbolt() {},
			ping() {
				throw new Error('Shield reused an aggro ping')
			},
		},
		sfx: {
			xp: () => cues.push('xp'),
			shielded: () => cues.push('shielded'),
			structureDown: () => cues.push('structureDown'),
		},
		camera: { kick() {}, shake() {} },
		hud: { banner: (text) => banners.push(text) },
	})
	try {
		const point = { x: 0, y: 0, z: 0 }
		for (const fact of [{ team: 'A', passive: true }, { team: 'B' }, { team: 'A' }])
			feedback.present({ type: 'xp', amount: 8, point, ...fact })
		expect(cues).toEqual(['xp'])
		expect(popups).toHaveLength(1)
		feedback.present({ type: 'shielded', target: structure('fort').id, projectile: 1, point })
		expect(structure('fort').body.shieldFlash).toBe(tune.laneView.shieldLife)
		shot(structure('tower'), structure('tower').hp)
		step()
		const fort = structure('fort')
		shot(fort, fort.hp)
		step()
		const before = scene.children.length
		feedback.present(facts.find((f) => f.type === 'death' && f.target === fort.id))
		feedback.present(facts.find((f) => f.type === 'structureDown' && f.target === fort.id))
		juice.update(1)
		expect(scene.children.length).toBe(before)
		expect(fort.body.visual.parent).toBeNull()
		expect(fort.body.mesh.children.every((child) => child !== fort.body.visual)).toBe(true)
		expect(banners).toEqual(['Enemy fort destroyed'])
		for (const u of sim.lane.structures.filter((u) => u.dead))
			expect(u.body.visual.parent).toBeNull()
		step(ticks(30) - sim.tick)
		expect(facts.filter((f) => f.type === 'xp' && f.passive)).toHaveLength(2)
	} finally {
		juice.dispose()
		if (previous === undefined) delete globalThis.document
		else globalThis.document = previous
	}
})
