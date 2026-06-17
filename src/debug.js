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
// An on-screen, persistent record of what the game did: shots, hits, pickups,
// eliminations, round results. This is the primary tool for inspecting behavior
// (the plan calls for logging built in). Every entry also goes to log.info, so
// the console ring buffer keeps the full history for log.dump().
export function createCombatLog(selector = '.combat', max = 12) {
	const el = document.querySelector(selector)
	const rows = []

	function push(msg, kind = '') {
		log.info('[combat]', msg)
		rows.push({ msg, kind })
		if (rows.length > max) rows.shift()
		if (!el) return
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
// Returns the GUI so callers can add game-specific folders later (teams,
// players, AI difficulty). `onChange` fires whenever any control moves.
// `cheats` carries live sandbox actions (addEnemy/removeEnemy/addAlly/removeAlly)
// the main loop binds to the current round; they show up as buttons here.
export function createDebugGui(onChange = () => {}, cheats = {}) {
	const gui = new GUI({ title: 'dodgethis / debug' })

	const phys = gui.addFolder('physics')
	phys.add(tune.physics, 'gravity', -30, 0, 0.1).onChange(onChange)
	phys.add(tune.physics, 'restitution', 0, 1, 0.01)
	phys.add(tune.physics, 'timeScale', 0, 2, 0.05)
	phys.add(tune.physics, 'paused')

	const player = gui.addFolder('player')
	player.add(tune.player, 'speed', 1, 20, 0.5)
	player.add(tune.player, 'dashMul', 1, 5, 0.1).name('dash ×')
	player.add(tune.player, 'dashTime', 0.05, 0.4, 0.01).name('dash time (s)')
	player.add(tune.player, 'dashCooldown', 0.1, 2, 0.05).name('dash cooldown (s)')

	const arrow = gui.addFolder('arrow')
	arrow.add(tune.arrow, 'maxSpeed', 10, 60, 0.5).name('max speed')
	arrow.add(tune.arrow, 'launchAngle', 0, 60, 1).name('launch angle')
	arrow.add(tune.arrow, 'linearDamping', 0, 2, 0.01).onChange(onChange)

	const wpn = gui.addFolder('weapons')
	wpn.add(tune.weapons, 'chargeTime', 0.3, 2, 0.05).name('charge time (s)')
	wpn.add(tune.weapons, 'chargeMin', 8, 30, 0.5).name('charge min spd')
	wpn.add(tune.weapons, 'chargeMax', 12, 50, 0.5).name('charge max spd')
	wpn.add(tune.weapons, 'perfectWindow', 0.02, 0.3, 0.01).name('perfect window')
	wpn.add(tune.weapons, 'perfectMult', 1, 2.5, 0.05).name('perfect ×')
	wpn.add(tune.weapons, 'bowlSpeed', 6, 30, 0.5).name('bowl speed')
	wpn.add(tune.weapons, 'bowlRadius', 0.15, 1, 0.05).name('bowl radius')
	wpn.add(tune.weapons, 'bowlDensity', 1, 10, 0.5).name('bowl density')
	wpn.add(tune.weapons, 'bowlStop', 0.5, 8, 0.25).name('bowl stop spd')

	const ai = gui.addFolder('ai')
	ai.add(tune.ai, 'enabled')
	ai.add(tune.ai, 'reaction', 0, 2, 0.05).name('reaction (s)')
	ai.add(tune.ai, 'jitter', 0, 0.6, 0.01).name('aim jitter (rad)')
	ai.add(tune.ai, 'standoff', 2, 18, 0.5).name('standoff (m)')

	const fx = gui.addFolder('fx')
	fx.add(tune.fx, 'sound')
	fx.add(tune.fx, 'volume', 0, 1, 0.05)
	fx.add(tune.fx, 'shake')
	fx.add(tune.fx, 'trails')
	fx.add(tune.fx, 'deathTime', 0.25, 3, 0.05).name('death length ×')

	// Cheats / sandbox. godmode toggles live (also bound to the G key in main).
	const ch = gui.addFolder('cheats')
	ch.add(tune.cheats, 'godmode').name('godmode (G)').listen()
	if (cheats.addEnemy) ch.add(cheats, 'addEnemy').name('+ enemy ( = )')
	if (cheats.removeEnemy) ch.add(cheats, 'removeEnemy').name('- enemy ( - )')
	if (cheats.addAlly) ch.add(cheats, 'addAlly').name('+ ally ( ] )')
	if (cheats.removeAlly) ch.add(cheats, 'removeAlly').name('- ally ( [ )')

	const dbg = gui.addFolder('debug')
	dbg.add(tune.debug, 'showColliders').onChange(onChange)
	dbg.add(tune.debug, 'logLevel', ['debug', 'info', 'warn', 'error'])
	dbg.add({ dumpLog: () => log.dump() }, 'dumpLog').name('dump log → console')

	gui.close()
	return gui
}
