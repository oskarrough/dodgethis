import GUI from 'lil-gui'
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

// The panel behind app.debug. A tune path is a folder path that mirrors the tune object, so
// `bots/easy` is tune.bots.easy; `engine/…` holds src/core's own and stays last. Cheats are buttons in "cheats".
export function createDebugPanel() {
	const gui = new GUI({ title: 'dodgethis / debug' })
	const folders = new Map()
	function folder(path) {
		if (folders.has(path)) return folders.get(path)
		const cut = path.lastIndexOf('/')
		const parent = cut < 0 ? gui : folder(path.slice(0, cut))
		const f = parent.addFolder(path.slice(cut + 1)).close()
		folders.set(path, f)
		if (parent === gui && path !== 'engine' && folders.has('engine'))
			gui.$children.append(folders.get('engine').domElement)
		return f
	}
	// Remove only what this registration added, then drop folders left empty.
	function adding(path, add) {
		const f = folder(path)
		const before = new Set(f.children)
		add(f)
		const added = f.children.filter((c) => !before.has(c))
		refilter()
		return () => {
			for (const c of added) c.destroy()
			for (let p = path; p; p = p.slice(0, Math.max(0, p.lastIndexOf('/')))) {
				const empty = folders.get(p)
				if (!empty || empty.children.length) break
				empty.destroy()
				folders.delete(p)
			}
		}
	}
	const refilter = addFilter(gui)
	gui.close()
	return {
		tune: (path, object, build) => build && adding(path, (f) => build(f, object)),
		cheat: (label, fn) => adding('cheats', (f) => f.add({ run: fn }, 'run').name(label)),
		show: () => gui.show(),
		hide: () => gui.hide(),
		setInert(inert) {
			gui.domElement.inert = inert
		},
	}
}

// Typing narrows the panel to folders and controls whose names match, opening folders on the way.
// Clearing it shows everything again and closes what the filter opened.
function addFilter(gui) {
	const input = document.createElement('input')
	input.type = 'search'
	input.placeholder = 'filter…'
	input.className = 'debug-filter'
	input.style.cssText =
		'display:block;box-sizing:border-box;width:calc(100% - 8px);margin:4px;padding:4px 6px;border:0;border-radius:2px;font:inherit;background:var(--widget-color);color:var(--text-color)'
	gui.$title.after(input)
	gui.onOpenClose((changed) => {
		if (changed === gui) input.style.display = gui._closed ? 'none' : 'block'
	})
	const opened = new Set()
	function visit(folder, query, inherited) {
		let any = false
		for (const c of folder.controllers) {
			const show = inherited || c._name.toLowerCase().includes(query)
			c.show(show)
			any ||= show
		}
		for (const f of folder.folders) {
			const named = inherited || f._title.toLowerCase().includes(query)
			const inside = visit(f, query, named)
			f.show(named || inside)
			if (query && inside && f._closed) {
				f.open()
				opened.add(f)
			}
			any ||= named || inside
		}
		return any
	}
	let shown = ''
	function refilter() {
		const query = input.value.trim().toLowerCase()
		if (!query && !shown) return
		if (!query) {
			for (const f of opened) f.close()
			opened.clear()
		}
		shown = query
		visit(gui, query, !query)
	}
	input.addEventListener('input', refilter)
	// Keep typing out of the game; Backquote still toggles the panel and Escape leaves the box.
	input.addEventListener('keydown', (event) => {
		if (event.code === 'Backquote') return
		if (event.code === 'Escape') input.blur()
		event.stopPropagation()
	})
	input.addEventListener('keyup', (event) => event.stopPropagation())
	return refilter
}
