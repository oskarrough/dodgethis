import { afterEach, expect, test } from 'bun:test'
import { createApp, STEP } from '../src/core/app.js'
import { tune } from '../src/core/tune.js'

// The kernel runs without a DOM: these drive frame(dt) by hand.
const contract = () => ({ epoch: 1, snapshot: () => ({}), apply() {}, validFact: () => true })
const neutral = () => ({
	move: { x: 0, z: 0 },
	order: null,
	aim: null,
	held: {},
	pressed: [],
	released: [],
})
afterEach(() => {
	tune.physics.paused = false
	tune.physics.timeScale = 1
})

test('phases run in order, simulate on a fixed step with the remainder as alpha', () => {
	const app = createApp()
	const seen = []
	for (const phase of ['present', 'replicate', 'simulate', 'intents', 'input'])
		app.system(phase, (t) => seen.push(phase === 'simulate' ? `simulate ${t}` : phase))
	app.frame(STEP * 2.5)
	expect(seen).toEqual([
		'input',
		'intents',
		`simulate ${STEP}`,
		`simulate ${STEP}`,
		'replicate',
		'present',
	])
	let alpha
	app.system('present', (t) => (alpha = t.alpha))
	app.frame(STEP * 0.25)
	expect(alpha).toBeCloseTo(0.75, 9)
	expect(() => app.system('render', () => {})).toThrow('Unknown phase')
})

test('the clock holds, scales and resets the simulation', () => {
	const app = createApp()
	let steps = 0
	let hold = false
	app.system('simulate', () => {
		steps++
		if (steps === 2) hold = true // a step can end play mid-frame
	})
	app.clock.pause(() => hold)
	app.frame(STEP * 5)
	expect(steps).toBe(2)
	hold = false
	app.clock.reset()
	tune.physics.paused = true
	app.frame(STEP * 5)
	expect(steps).toBe(2)
	expect(app.clock.paused).toBe(true)
	tune.physics.paused = false

	const dts = []
	app.clock.scale((dt) => (dts.push(dt), 0.5))
	let gameDt
	app.system('intents', (t) => (gameDt = t.gameDt))
	app.frame(STEP * 4)
	expect(dts).toEqual([STEP * 4])
	expect(gameDt).toBeCloseTo(STEP * 2, 9)
	expect(steps).toBe(4)
})

test('a reset inside a step leaves no debt', () => {
	const app = createApp()
	let steps = 0
	app.system('simulate', () => {
		steps++
		app.clock.reset()
	})
	app.frame(STEP * 3)
	app.frame(STEP)
	expect(steps).toBe(2)
})

test('a plugin loses everything it registered when its scope aborts', () => {
	const app = createApp()
	const calls = []
	let cleaned = 0
	const dispose = app.use((scoped) => {
		scoped.system('present', () => calls.push('present'))
		scoped.on('present', (fact) => calls.push(fact.type))
		scoped.clock.pause(() => true)
		scoped.debug.tune('mode', { speed: 1 })
		scoped.debug.expose({ answer: 42 })
		return () => cleaned++
	})
	app.present({ type: 'shot' })
	app.frame(STEP)
	expect(calls).toEqual(['shot', 'present'])
	expect(app.clock.paused).toBe(true)
	expect(app.debug.game.answer).toBe(42)
	dispose()
	app.present({ type: 'shot' })
	app.frame(STEP)
	expect(calls).toEqual(['shot', 'present'])
	expect(app.clock.paused).toBe(false)
	expect(app.debug.tunables.mode).toBeUndefined()
	expect(app.debug.game.answer).toBeUndefined()
	expect(cleaned).toBe(1)
})

test('a plugin that throws leaves nothing behind', () => {
	const app = createApp()
	expect(() =>
		app.use((scoped) => {
			scoped.on('menu', () => {
				throw new Error('should be gone')
			})
			throw new Error('boom')
		}),
	).toThrow('boom')
	expect(() => app.emit('menu')).not.toThrow()
})

test('only the core events exist', () => {
	const app = createApp()
	for (const type of ['present', 'menu', 'blur', 'session']) app.on(type, () => {})
	expect(() => app.on('hit', () => {})).toThrow('Unknown event')
	expect(() => app.emit('hit')).toThrow('Unknown event')
})

test('keyed registrations throw on duplicates and free on abort', () => {
	const app = createApp()
	const dispose = app.use((scoped) => {
		scoped.debug.tune('arrow', {})
		scoped.debug.cheat('Start 20v20', () => {})
		scoped.debug.expose({ round: null })
		scoped.modes.define('dodgeball', { scheme: 'direct', start: contract })
	})
	expect(() => app.debug.tune('arrow', {})).toThrow('already registered: arrow')
	expect(() => app.debug.cheat('Start 20v20', () => {})).toThrow('already registered')
	expect(() => app.debug.expose({ round: 1 })).toThrow('already registered: round')
	expect(() => app.modes.define('dodgeball', { scheme: 'direct', start: contract })).toThrow(
		'already registered',
	)
	dispose()
	app.debug.tune('arrow', {})
	app.debug.cheat('Start 20v20', () => {})
	app.debug.expose({ round: 1 })
	app.modes.define('dodgeball', { scheme: 'direct', start: contract })
})

test('exposed getters stay live', () => {
	const app = createApp()
	let round = 1
	app.debug.expose({
		get round() {
			return round
		},
	})
	round = 2
	expect(app.debug.game.round).toBe(2)
})

test('one mode runs at a time, in a run scope disposed on stop', () => {
	const app = createApp()
	const log = []
	for (const id of ['dodgeball', 'moba'])
		app.modes.define(id, {
			scheme: id === 'moba' ? 'pointClick' : 'direct',
			start(run, { roster, options }) {
				log.push(`start ${id} ${roster.length} ${options.seed}`)
				run.system('simulate', () => log.push(`step ${id}`))
				run.signal.addEventListener('abort', () => log.push(`stop ${id}`))
				return contract()
			},
		})
	const api = app.modes.start('dodgeball', { roster: [{ id: 'local' }], options: { seed: 7 } })
	expect(app.modes.active).toBe('dodgeball')
	expect(app.modes.current).toBe(api)
	app.frame(STEP)
	app.modes.start('moba')
	app.frame(STEP)
	app.modes.stop()
	app.frame(STEP)
	expect(log).toEqual([
		'start dodgeball 1 7',
		'step dodgeball',
		'stop dodgeball',
		'start moba 0 undefined',
		'step moba',
		'stop moba',
	])
	expect(app.modes.active).toBeNull()
	expect(() => app.modes.start('golf')).toThrow('Unknown mode')
})

test('a mode must declare a scheme and return the replication contract', () => {
	const app = createApp()
	expect(() => app.modes.define('a', { scheme: 'keys', start: contract })).toThrow('unknown scheme')
	let leaked = false
	app.modes.define('b', {
		scheme: 'direct',
		start(run) {
			run.system('present', () => (leaked = true))
			return { epoch: 1, snapshot() {} }
		},
	})
	expect(() => app.modes.start('b')).toThrow('must return apply()')
	app.frame(STEP)
	expect(leaked).toBe(false)
	expect(app.modes.active).toBeNull()
})

test('disposing the defining plugin stops its mode', () => {
	const app = createApp()
	let stopped = false
	const dispose = app.use((scoped) =>
		scoped.modes.define('dodgeball', {
			scheme: 'direct',
			start(run) {
				run.signal.addEventListener('abort', () => (stopped = true))
				return contract()
			},
		}),
	)
	app.modes.start('dodgeball')
	dispose()
	expect(stopped).toBe(true)
	expect(app.modes.active).toBeNull()
})

test('the session is solo until a mode starts under another, which only the authority simulates', () => {
	const app = createApp()
	expect(app.session).toEqual({
		local: ['local'],
		authoritative: true,
		shared: false,
		actions: ['pause', 'restart', 'cheat'],
	})
	expect(Object.isFrozen(app.session)).toBe(true)
	const seen = []
	const steps = []
	app.on('session', (s) => seen.push(s.local[0]))
	app.modes.define('m', {
		scheme: 'direct',
		start(run) {
			run.system('simulate', () => steps.push(run.session.authoritative))
			return contract()
		},
	})
	const guest = { local: ['p2'], authoritative: false, shared: true, actions: [] }
	app.modes.start('m', { session: guest })
	expect(app.session).toEqual(guest)
	expect(Object.isFrozen(app.session.actions)).toBe(true)
	app.frame(STEP * 3)
	expect(steps).toEqual([])
	expect(() => app.modes.start('m', { session: { ...guest, actions: ['fly'] } })).toThrow('actions')
	expect(app.modes.active).toBe('m') // a bad session stops nothing
	app.modes.start('m')
	app.frame(STEP)
	expect(steps).toEqual([true])
	expect(seen).toEqual(['p2', 'local'])
})

test('remote seats are fed directly; suspension and a targeted cancel touch only the local player', () => {
	const resets = []
	const app = createApp({ device: { sample: () => neutral(), reset: () => resets.push('reset') } })
	let hold = true
	app.intents.suspend(() => hold)
	app.modes.define('m', { scheme: 'direct', start: contract })
	app.modes.start('m')
	app.intents.feed('p2', { ...neutral(), move: { x: 1, z: 0 } })
	app.intents.press('local', 'slot2') // dropped while suspended
	app.frame(STEP / 2)
	expect(app.intents.get('p2').move).toEqual({ x: 1, z: 0 })
	expect(app.intents.get('local').pressed.map((e) => e.action)).toEqual(['cancel'])
	app.intents.cancel('p2')
	expect(resets).toEqual([])
	expect(app.intents.get('p2').move).toEqual({ x: 0, z: 0 })
	expect(app.intents.get('p2').pressed.map((e) => e.action)).toEqual(['cancel'])
	app.intents.cancel('local')
	expect(resets).toEqual(['reset'])
})

test('services pass through to every scope, and the panel sees tune and cheat', () => {
	const shown = []
	const panel = {
		tune: (name, object, build) => build && (build(name, object), () => shown.push(`-${name}`)),
		cheat: (label) => (shown.push(label), () => shown.push(`-${label}`)),
	}
	const app = createApp({ scene: 'scene', debug: { panel, perf: 'perf' } })
	const dispose = app.use((scoped) => {
		expect(scoped.scene).toBe('scene')
		expect(scoped.debug.perf).toBe('perf')
		scoped.debug.tune('ai', {}, (name) => shown.push(name))
		scoped.debug.tune('camera', {})
		scoped.debug.cheat('Step', () => {})
	})
	dispose()
	expect(shown).toEqual(['ai', 'Step', '-ai', '-Step'])
})
