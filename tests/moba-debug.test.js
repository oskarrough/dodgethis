import { afterEach, expect, test } from 'bun:test'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { createApp, STEP } from '../src/core/app.js'
import { tune as coreTune } from '../src/core/tune.js'
import { tune } from '../src/plugins/moba/tune.js'
import { createSim } from '../src/plugins/moba/sim.js'
import { practiceRoster } from '../src/plugins/moba/bots.js'
import { buildColliders } from '../src/plugins/moba/obstacles.js'
import { createMatchDebug } from '../src/plugins/moba/debug.js'
import { parseMatchSetup } from '../src/plugins/moba/setup.js'

await RAPIER.init({})
const fixtures = []
afterEach(() => {
	for (const { app, world } of fixtures.splice(0)) {
		app.dispose()
		world.free()
	}
	coreTune.physics.paused = false
	coreTune.physics.timeScale = 1
})
function match({ ready = () => true, session } = {}) {
	const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
	world.timestep = STEP
	const app = createApp()
	const fixture = { app, world, menuPaused: false }
	fixtures.push(fixture)
	app.modes.define('moba', {
		scheme: 'pointClick',
		start(run) {
			const unbuild = buildColliders(world, RAPIER)
			const local = app.session.local[0]
			const setup = parseMatchSetup(new URLSearchParams('bots=hard&seed=27'))
			const seats = practiceRoster(local, setup.difficulty)
			// Put the local participant last to catch heroes[0] shortcuts.
			seats.push(seats.shift())
			const sim = createSim({
				scene: new THREE.Scene(),
				world,
				RAPIER,
				intents: run.intents,
				heroes: seats,
				bots: seats.filter((s) => s.id !== local),
				lane: true,
				seed: setup.seed,
			})
			fixture.sim = sim
			run.clock.pause(() => fixture.menuPaused || !!sim.lane.match.winner)
			fixture.controls = createMatchDebug({
				app,
				run,
				sim,
				local,
				setup,
				ready,
				botsOnly: false,
				clearCamera() {},
				menu: {
					frozen: () => fixture.menuPaused || !!sim.lane.match.winner,
					presentationFrozen: () => fixture.menuPaused,
					resume: () => {
						fixture.menuPaused = false
					},
				},
			})
			run.system('simulate', (dt) => sim.step(dt))
			run.signal.addEventListener(
				'abort',
				() => {
					sim.dispose()
					unbuild()
				},
				{ once: true },
			)
			return { snapshot: sim.snapshot, apply: () => false, validFact: () => false }
		},
	})
	app.modes.start('moba', { session })
	return fixture
}
test('pause stops the real sim; each step advances exactly one tick at any speed and stays paused', () => {
	const { app, sim, controls } = match()
	app.frame(STEP * 1.5)
	expect(sim.tick).toBe(1)
	controls.paused = true
	const before = sim.snapshot()
	for (let i = 0; i < 30; i++) app.frame(0.1)
	expect(sim.snapshot()).toEqual(before)
	for (const speed of [0.25, 1, 4]) {
		controls.speed = speed
		const tick = sim.tick
		expect(controls.step()).toBe(true)
		expect(sim.tick).toBe(tick + 1)
		app.frame(1)
		expect(sim.tick).toBe(tick + 1)
		expect(controls.paused).toBe(true)
	}
	controls.speed = 1
	controls.paused = false
	app.frame(STEP)
	expect(sim.tick).toBe(5)
})
test('speed is per-run, bounded, and live; a new mode removes old holds and scales', () => {
	const one = match(),
		two = match()
	one.controls.speed = 4
	one.app.frame(STEP)
	two.app.frame(STEP)
	expect(one.sim.tick).toBe(4)
	expect(two.sim.tick).toBe(1)
	const warn = console.warn
	const warnings = []
	console.warn = (...args) => warnings.push(args)
	try {
		for (const v of [0, -1, NaN, Infinity, tune.testing.speedMax + tune.testing.speedStep])
			one.controls.speed = v
	} finally {
		console.warn = warn
	}
	expect(warnings.length).toBe(5)
	expect(one.controls.speed).toBe(4)
	one.controls.paused = true
	one.app.modes.start('moba')
	expect(one.controls.paused).toBe(false)
	expect(one.controls.speed).toBe(1)
	one.app.frame(STEP)
	expect(one.sim.tick).toBe(1)
})
test('step from the match menu stays paused; loading, winner and shared sessions cannot step or cheat', () => {
	let ready = false
	const fixture = match({ ready: () => ready })
	expect(fixture.controls.step()).toBe(false)
	ready = true
	fixture.menuPaused = true
	expect(fixture.controls.step()).toBe(true)
	expect(fixture.menuPaused).toBe(false)
	fixture.app.frame(1)
	expect(fixture.sim.tick).toBe(1)
	fixture.sim.lane.match.winner = 'B'
	// Ending presentation can resume after stepping onto the winning tick.
	fixture.controls.paused = false
	expect(fixture.controls.paused).toBe(false)
	expect(fixture.controls.step()).toBe(false)
	expect(fixture.controls.respawn()).toBe(false)
	expect(fixture.controls.resetCooldowns()).toBe(false)
	const shared = match({
		session: { local: ['guest'], authoritative: true, shared: true, actions: ['cheat'] },
	})
	expect(shared.controls.step()).toBe(false)
	coreTune.physics.paused = true
	expect(shared.app.clock.paused).toBe(true)
	expect(shared.app.clock.stepOnce()).toBe(false)
})
test('reset cooldowns and respawn operate on the local participant, not the first hero', () => {
	const { sim, controls } = match()
	const local = sim.heroes.find((h) => h.id === 'local')
	local.cd.fill(90)
	sim.heroes[0].cd.fill(50)
	expect(controls.resetCooldowns()).toBe(true)
	expect(local.cd.every((v) => v === 0)).toBe(true)
	expect(sim.heroes[0].cd.every((v) => v === 50)).toBe(true)
	expect(controls.respawn()).toBe(false)
	// A dead-body fixture; timed death/cast cleanup is covered by sim lifecycle tests.
	local.dead = true
	local.corpse = local.body
	local.body.retire()
	local.hp = 0
	local.respawnTick = sim.tick + 100
	expect(controls.resetCooldowns()).toBe(false)
	expect(controls.respawn()).toBe(true)
	expect(local.dead).toBe(false)
	expect(local.hp).toBe(local.maxHp)
	expect(local.respawnTick).toBe(null)
})
test('copy writes the setup link to the clipboard and reports failures', async () => {
	const { controls } = match()
	const oldLocation = globalThis.location,
		oldNavigator = globalThis.navigator,
		warn = console.warn
	let copied
	globalThis.location = { href: 'https://example.test/?mode=moba&seed=1' }
	globalThis.navigator = {
		clipboard: {
			writeText: async (text) => {
				copied = text
			},
		},
	}
	try {
		expect(await controls.copyLink()).toBe(true)
		expect(controls.linkStatus).toBe('Copied')
		expect(parseMatchSetup(new URL(copied).searchParams).seed).toBe(27)
		navigator.clipboard.writeText = async () => {
			throw new Error('Permission denied')
		}
		console.warn = () => {}
		expect(await controls.copyLink()).toBe(false)
		expect(controls.linkStatus).toContain('failed')
	} finally {
		globalThis.location = oldLocation
		globalThis.navigator = oldNavigator
		console.warn = warn
	}
})
