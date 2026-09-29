import { tune as coreTune } from '../../core/tune.js'
import { tune } from './tune.js'
import { PRESETS, scenario } from './scenario.js'

// Debug scenarios, single-stepping, GUI cheats and dodgeball's half of window.game. `flow()` is the live flow; `blocked()` is true when the session withholds cheats.
export function createSandbox(app, { flow, blocked, updateHud }) {
	const { perf, stats } = app.debug

	function start(options = {}) {
		if (blocked()) throw new Error('This session does not allow scenarios')
		const setup = scenario(options) // validate before replacing the current round
		const f = flow()
		f.cancelTransition()
		tune.ai.enabled = setup.ai
		coreTune.physics.paused = setup.paused
		coreTune.physics.timeScale = 1
		app.clock.reset()
		tune.cheats.godmode = setup.godmode
		tune.cheats.infiniteAmmo = setup.infiniteAmmo
		if (setup.phase === 'menu') f.enterHub()
		else {
			f.startMatch(setup.teamB, {
				allies: setup.teamA - 1,
				arrowCount: setup.arrows,
				seed: setup.seed,
				layout: setup.layout,
				hp: setup.hp,
			})
			if (setup.phase === 'roundOver') f.endRound(setup.winner)
			if (setup.phase === 'matchOver') {
				f.match.wins[setup.winner] = f.match.needed
				f.endMatch(setup.winner)
			}
		}
		perf.enabled = true
		perf.reset()
		stats.perf = null
		updateHud()
		return snapshot()
	}

	function snapshot() {
		const f = flow()
		return {
			phase: f.phase,
			match: { ...f.match, wins: { ...f.match.wins } },
			paused: coreTune.physics.paused || f.phase === 'paused',
			units: f.round.units.map((u) => ({
				id: u.id,
				team: u.team,
				human: u.isHuman,
				alive: u.alive,
				position: { ...u.position },
				heldArrow: u.heldArrow?.id ?? null,
			})),
			arrows: f.round.arrows.map((a) => ({
				id: a.id,
				state: a.state,
				kind: a.kind,
				position: { ...a.position },
			})),
		}
	}

	function step(ticks = 1) {
		if (blocked()) throw new Error('This session does not allow single-stepping')
		if (!coreTune.physics.paused) throw new Error('Pause before single-stepping')
		if (!Number.isInteger(ticks) || ticks < 1 || ticks > 3600)
			throw new Error('ticks must be 1..3600')
		const f = flow()
		for (let i = 0; i < ticks && (f.phase === 'playing' || f.phase === 'menu'); i++) {
			f.round.step(app.clock.step, { x: 0, z: 0 })
			f.round.lateUpdate()
		}
		updateHud()
		return snapshot()
	}

	// GUI cheats read the current round on every call, surviving scene rebuilds.
	for (const [label, fn] of [
		['Start 20v20', () => start(PRESETS['20v20'])],
		[
			'Step one tick (paused)',
			() => {
				coreTune.physics.paused = true
				step()
			},
		],
		['+ enemy ( = )', () => flow()?.round?.addUnit('B')],
		['- enemy ( - )', () => flow()?.round?.removeUnit('B')],
		['+ ally ( ] )', () => flow()?.round?.addUnit('A')],
		['- ally ( [ )', () => flow()?.round?.removeUnit('A')],
	])
		app.debug.cheat(label, () => !blocked() && fn())

	app.debug.expose({
		get round() {
			return flow()?.round
		},
		get phase() {
			return flow()?.phase
		},
		start,
		preset(name, overrides = {}) {
			if (!PRESETS[name]) throw new Error(`Unknown preset: ${name}`)
			return start({ ...PRESETS[name], ...overrides })
		},
		snapshot,
		pause(value = true) {
			coreTune.physics.paused = value
			app.clock.reset()
		},
		step,
		hub: () => !blocked() && flow()?.enterHub(),
		restart: () => !blocked() && flow()?.restartRound(),
	})

	return { start, snapshot, step }
}
