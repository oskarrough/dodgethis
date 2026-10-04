import GUI from 'lil-gui'
import { tune } from './tune.js'

// --- Logging -----------------------------------------------------------------
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

// --- Combat log --------------------------------------------------------------
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

// --- GUI ---------------------------------------------------------------------
// The panel behind app.debug: each tune section with a `build(folder)` becomes a folder, each cheat a button in "cheats".
export function createDebugPanel() {
	const gui = new GUI({ title: 'dodgethis / debug' })
	const folders = new Map()
	function folder(name) {
		if (!folders.has(name)) folders.set(name, gui.addFolder(name).close())
		return folders.get(name)
	}
	// Remove only what this registration added; drop the folder once it is empty.
	function adding(name, add) {
		const f = folder(name)
		const before = new Set(f.controllers)
		add(f)
		const added = f.controllers.filter((c) => !before.has(c))
		return () => {
			for (const c of added) c.destroy()
			if (!f.controllers.length && !f.folders.length) {
				f.destroy()
				folders.delete(name)
			}
		}
	}
	gui.close()
	return {
		tune: (name, object, build) => build && adding(name, (f) => build(f, object)),
		cheat: (label, fn) => adding('cheats', (f) => f.add({ run: fn }, 'run').name(label)),
		show: () => gui.show(),
		hide: () => gui.hide(),
		setInert(inert) {
			gui.domElement.inert = inert
		},
	}
}
