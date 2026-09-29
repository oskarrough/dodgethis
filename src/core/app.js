import { tune } from './tune.js'
import { createIntents, SCHEMES } from './intents.js'
import { createSmoother } from './smooth.js'

// The kernel (docs/plugin-architecture.md): plugin scopes, the five-phase loop, events, modes, the session, intents, render interpolation and keyed registration.
// DOM-free: the browser shell (browser.js) passes devices and renderers in as services and drives frame(dt).

export const STEP = 1 / 60
export const PHASES = ['input', 'intents', 'simulate', 'replicate', 'present']
const EVENTS = ['present', 'menu', 'blur', 'session']

// `services` become fields on app (scene, world, camera, input, audio, overlay, …); `services.debug.panel` renders the debug GUI.
// `services.device` is the local player's hardware: `sample(scheme)` returns this frame's sample and `reset()` forgets held keys.
export function createApp(services = {}) {
	const { debug: debugServices = {}, device = null, ...fields } = services
	const panel = debugServices.panel ?? null
	const root = new AbortController()
	const systems = Object.fromEntries(PHASES.map((p) => [p, []]))
	const listeners = Object.fromEntries(EVENTS.map((e) => [e, []]))
	const scales = []
	const holds = []
	const suspends = []
	const aimers = []
	const intents = createIntents()
	const suspended = () => suspends.some((s) => !s.signal.aborted && s.fn())
	const smoother = createSmoother()
	const modes = new Map()
	const cheats = new Map()
	const tunables = {}
	const game = {}
	let current = null
	let acc = 0

	let session = SOLO

	// Keep `item` in `list` until `signal` aborts.
	function enlist(list, item, signal) {
		list.push(item)
		onAbort(signal, () => {
			const i = list.indexOf(item)
			if (i >= 0) list.splice(i, 1)
		})
	}
	// Keyed registration: a duplicate key throws, and the key frees when `signal` aborts.
	function claim(map, key, value, signal, what) {
		if (map.has(key)) throw new Error(`${what} already registered: ${key}`)
		map.set(key, value)
		onAbort(signal, () => map.get(key) === value && map.delete(key))
	}
	function claimProperties(target, props, signal, what) {
		const descriptors = Object.getOwnPropertyDescriptors(props)
		for (const key of Object.keys(descriptors))
			if (Object.hasOwn(target, key)) throw new Error(`${what} already registered: ${key}`)
		for (const [key, d] of Object.entries(descriptors))
			Object.defineProperty(target, key, { ...d, enumerable: true, configurable: true })
		onAbort(signal, () => {
			for (const key of Object.keys(descriptors)) delete target[key]
		})
	}

	// A child scope aborts with its parent, or on its own.
	function child(parent) {
		const controller = new AbortController()
		const abort = () => controller.abort()
		if (parent.aborted) abort()
		else {
			parent.addEventListener('abort', abort, { once: true })
			onAbort(controller.signal, () => parent.removeEventListener('abort', abort))
		}
		return controller
	}

	function emit(type, payload) {
		if (!EVENTS.includes(type)) throw new Error(`Unknown event: ${type}`)
		for (const l of listeners[type].slice()) if (!l.signal.aborted) l.fn(payload)
	}

	function held() {
		return tune.physics.paused || holds.some((h) => !h.signal.aborted && h.fn())
	}

	function runPhase(phase, arg) {
		for (const s of systems[phase].slice()) if (!s.signal.aborted) s.fn(arg)
	}

	// One rendered frame. `dt` is real seconds, already clamped by the caller.
	function frame(dt) {
		let scale = 1
		for (const s of scales.slice()) if (!s.signal.aborted) scale *= s.fn(dt)
		const t = { dt, gameDt: session.shared ? dt : dt * scale, alpha: acc / STEP }
		runPhase('input', t)
		// Core fills the local frame before any mode reads it.
		if (device && current) {
			const stickAim = aimers.findLast((a) => !a.signal.aborted)?.fn ?? null
			intents.feed(session.local[0], device.sample(current.scheme, { stickAim }), suspended())
		}
		runPhase('intents', t)
		if (session.authoritative && !held()) {
			acc += t.gameDt * tune.physics.timeScale
			// Spend the step first, so a clock.reset() inside it lands on zero.
			while (acc >= STEP && !held()) {
				acc -= STEP
				runPhase('simulate', STEP)
				intents.age(STEP)
				smoother.capture()
			}
		}
		t.alpha = Math.min(acc / STEP, 1)
		runPhase('replicate', t)
		smoother.pose(t.alpha)
		runPhase('present', t)
	}

	function use(plugin, parent) {
		const controller = child(parent)
		const api = scope(controller.signal)
		try {
			const cleanup = plugin(api)
			if (typeof cleanup === 'function') onAbort(controller.signal, cleanup)
		} catch (error) {
			controller.abort()
			throw error
		}
		return () => controller.abort()
	}

	function stopMode() {
		const run = current
		current = null
		run?.controller.abort()
	}

	// Everything registered through a scope's api is removed when its signal aborts.
	function scope(signal) {
		const api = {
			...fields,
			// Scoped hooks into two services: the mode's right-stick aim, and its camera framing.
			...(fields.input && {
				input: {
					...fields.input,
					// `fn(dir, magnitude, slot) → point`: how the pad's right stick aims. The latest live one wins.
					stickAim: (fn) => enlist(aimers, { fn, signal }, signal),
				},
			}),
			...(fields.camera?.frame && {
				camera: {
					...fields.camera,
					// `fn(dt) → { eye, target, fov? }` from rendered positions; both cameras follow it, only the view shakes.
					frame(fn) {
						const remove = fields.camera.frame(fn)
						onAbort(signal, remove)
						return remove
					},
				},
			}),
			signal,
			get session() {
				return session
			},
			use: (plugin) => use(plugin, signal),
			system(phase, fn) {
				if (!PHASES.includes(phase)) throw new Error(`Unknown phase: ${phase}`)
				enlist(systems[phase], { fn, signal }, signal)
			},
			on(type, fn) {
				if (!EVENTS.includes(type)) throw new Error(`Unknown event: ${type}`)
				enlist(listeners[type], { fn, signal }, signal)
			},
			emit,
			present: (fact) => emit('present', fact),
			frame,
			// Frames by participant id. The core feeds session.local[0] from the device and online feeds remote seats; modes read, consume and cancel.
			intents: {
				get: (id) => intents.get(id),
				// Merge an untrusted frame for a participant no device here drives; check it with validIntent first.
				feed: (id, frame) => intents.feed(id, frame),
				consume: (id, action) => intents.consume(id, action),
				drain: (id) => intents.drain(id),
				press(id, action, at) {
					if (!suspended()) intents.press(id, action, at)
				},
				// Drop what one participant (or, with no id, everyone) holds or queued, and queue a cancel.
				cancel(id) {
					if (id === undefined || id === session.local[0]) device?.reset()
					intents.cancel(id)
				},
				// While any `fn()` is true the local frame is neutral; entering that state queues one cancel.
				suspend: (fn) => enlist(suspends, { fn, signal }, signal),
			},
			smooth: Object.assign(
				(object, read) => {
					const remove = smoother.add(object, read)
					const unlisten = onAbort(signal, remove)
					return () => {
						unlisten()
						remove()
					}
				},
				{ snap: (object) => smoother.snap(object) },
			),
			clock: {
				step: STEP,
				// Hitstop and other slow-motion: `fn(dt)` returns a multiplier. Every fn runs each frame; shared sessions ignore the product.
				scale: (fn) => enlist(scales, { fn, signal }, signal),
				// The simulation holds while any `fn()` is true (checked before every step), or while tune.physics.paused.
				pause: (fn) => enlist(holds, { fn, signal }, signal),
				reset() {
					acc = 0
					smoother.snapAll()
				},
				get paused() {
					return held()
				},
			},
			modes: {
				define(id, def) {
					if (typeof def?.start !== 'function') throw new Error(`Mode ${id} needs start()`)
					if (!SCHEMES[def.scheme]) throw new Error(`Mode ${id} has unknown scheme: ${def.scheme}`)
					claim(modes, id, { ...def, signal }, signal, 'Mode')
					onAbort(signal, () => current?.id === id && stopMode())
				},
				// Stop the running mode, then start `id` in a fresh run scope under `session` (solo unless given).
				start(id, { roster = [], options = {}, session: next = SOLO } = {}) {
					const def = modes.get(id)
					if (!def) throw new Error(`Unknown mode: ${id}`)
					const previous = session
					const fresh = next === SOLO ? SOLO : freezeSession(next)
					stopMode()
					session = fresh
					const controller = child(def.signal)
					const run = scope(controller.signal)
					let contract
					try {
						contract = def.start(run, { roster, options })
						for (const key of ['snapshot', 'apply', 'validFact'])
							if (typeof contract?.[key] !== 'function')
								throw new Error(`Mode ${id} start() must return ${key}()`)
					} catch (error) {
						controller.abort()
						session = previous
						throw error
					}
					intents.use(def.scheme)
					current = { id, controller, contract, scheme: def.scheme }
					if (session !== previous) emit('session', session)
					return contract
				},
				stop: stopMode,
				get active() {
					return current?.id ?? null
				},
				get current() {
					return current?.contract ?? null
				},
			},
			debug: {
				...debugServices,
				game,
				tunables,
				// A named tune section: shown in game.tune and, given `build(folder)`, as a GUI folder.
				tune(name, object, build) {
					claimProperties(tunables, { [name]: object }, signal, 'Tune section')
					const remove = panel?.tune(name, object, build)
					if (remove) onAbort(signal, remove)
				},
				cheat(label, fn) {
					claim(cheats, label, fn, signal, 'Cheat')
					const remove = panel?.cheat(label, fn)
					if (remove) onAbort(signal, remove)
				},
				// Copy `props` (getters stay live) onto window.game.
				expose: (props) => claimProperties(game, props, signal, 'Debug API'),
			},
		}
		return api
	}

	const app = scope(root.signal)
	app.dispose = () => root.abort()
	return app
}

// One local human who may use every session verb.
export const SOLO = Object.freeze({
	local: Object.freeze(['local']),
	authoritative: true,
	shared: false,
	actions: Object.freeze(['pause', 'restart', 'cheat']),
})

const VERBS = ['pause', 'restart', 'cheat']
function freezeSession({ local, authoritative, shared, actions }) {
	if (!Array.isArray(local) || !local.length || !local.every((id) => typeof id === 'string' && id))
		throw new Error('Session needs local participant ids')
	if (typeof authoritative !== 'boolean' || typeof shared !== 'boolean')
		throw new Error('Session authoritative and shared are booleans')
	if (!Array.isArray(actions) || !actions.every((a) => VERBS.includes(a)))
		throw new Error(`Session actions are some of: ${VERBS.join(' ')}`)
	return Object.freeze({
		local: Object.freeze([...local]),
		authoritative,
		shared,
		actions: Object.freeze([...actions]),
	})
}

// Run `fn` when `signal` aborts; returns the unsubscribe.
function onAbort(signal, fn) {
	if (signal.aborted) {
		fn()
		return () => {}
	}
	signal.addEventListener('abort', fn, { once: true })
	return () => signal.removeEventListener('abort', fn)
}
