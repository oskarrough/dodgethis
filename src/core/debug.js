import { createTuner } from './tuner.js'
import { createRegistry } from './registry.js'
import { tune } from './tune.js'

// Leveled console logging + a ring buffer you can dump or surface in the HUD.
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 }
const ring = []
const RING_MAX = 200

function emit(level, args) {
	if (LEVELS[level] < LEVELS[tune.debug.logLevel]) return
	const line = `[${level}] ${args.map(stringify).join(' ')}`
	ring.push(line)
	if (ring.length > RING_MAX) ring.shift()
	const fn = level === 'debug' ? console.log : console[level]
	fn('%c dodgethis ', 'background:#5db4ff;color:#0b0e14;border-radius:3px', ...args)
}

function stringify(v) {
	if (typeof v === 'string') return v
	try {
		return JSON.stringify(v)
	} catch {
		return String(v)
	}
}

export const log = {
	debug: (...a) => emit('debug', a),
	info: (...a) => emit('info', a),
	warn: (...a) => emit('warn', a),
	error: (...a) => emit('error', a),
	history: () => ring.slice(),
	dump: () => console.log(ring.join('\n')),
}

// Inspect combat history on screen; entries also reach log.info's ring buffer for log.dump().
export function createCombatLog(selector = '.combat', max = 12) {
	const el = document.querySelector(selector)
	const rows = []

	let pending = false
	function push(msg, kind = '') {
		log.info('[combat]', msg)
		rows.push({ msg, kind })
		if (rows.length > max) rows.shift()
		if (!el || el.hidden || pending) return
		pending = true
		requestAnimationFrame(flush)
	}

	function flush() {
		pending = false
		el.replaceChildren(
			...rows.map((r) => {
				const div = document.createElement('div')
				div.className = 'row' + (r.kind ? ' ' + r.kind : '')
				div.textContent = '▸ ' + r.msg
				return div
			}),
		)
	}

	return { push }
}

// The panel behind app.debug: the Tuner over a registry of tune sections. A tune path mirrors the
// tune object, so `bots/easy` is tune.bots.easy; `engine/…` holds src/core's own. Cheats are buttons
// in "cheats". Every value in a section reaches the Tuner; a section's builder adds hand-made controls.
export function createDebugPanel() {
	const registry = createRegistry()
	const tuner = createTuner(registry)
	const adding = (...args) => {
		const remove = registry.add(...args)
		tuner.refresh()
		return () => {
			remove()
			tuner.refresh()
		}
	}
	return {
		// `options`: { notes, featured, units, onChange }, see registry.js; `build(folder, object)` adds controls.
		tune(path, object, options, build) {
			if (typeof options === 'function') [options, build] = [{}, options]
			return adding(path, object, options, build && ((f) => build(f, object)))
		},
		cheat: (label, fn) => adding('cheats', {}, {}, (f) => f.add({ [label]: fn }, label)),
		// Backquote opens and hides the tuner.
		show: () => tuner.show(true),
		hide: () => tuner.show(false),
		setInert: (inert) => tuner.setInert(inert),
	}
}
