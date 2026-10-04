import { tune } from './tune.js'
import { hex } from '../../core/style.js'
import './menu.css'

// Simulation stops on the winning tick; presentation finishes before the result card.
export function createMatchMenu({
	app,
	run,
	sim,
	hero,
	clearCamera,
	focusCore = () => {},
	ready = () => true,
	difficulty = 'easy',
	setup = { difficulty },
}) {
	let paused = false
	let resultShown = false
	let backHeld = false
	let endingElapsed = null
	const frozen = () => paused || !!sim.lane.match.winner
	const resetInput = () => {
		app.intents.cancel(hero.id)
		clearCamera()
	}
	function leave(heroSelect) {
		resetInput()
		app.modes.start('moba-front', { options: { hero: heroSelect, setup } })
	}
	const restart = () => {
		resetInput()
		app.modes.start('moba', { options: { setup } })
	}
	function toggle() {
		if (!ready() || sim.lane.match.winner || !app.session.actions.includes('pause')) return
		paused = !paused
		resetInput()
		app.audio.setMusicScene(paused ? 'paused' : 'play')
		if (!paused) return app.overlay.hide()
		app.overlay.show({
			title: 'PAUSED',
			theme: 'moba-pause',
			pointerGuard: true,
			spaceConfirm: false,
			subtitle: 'Esc / B / Start · resume',
			actions: [
				{ label: 'Resume', onSelect: toggle },
				{ label: 'Restart', key: 'KeyR', keyLabel: 'R', onSelect: restart },
				{ label: 'Hero select', onSelect: () => leave(true) },
				{ label: 'Modes', onSelect: () => leave(false) },
			],
		})
	}
	function result(dt = 0) {
		if (!sim.lane.match.winner || resultShown) return
		if (endingElapsed === null) {
			endingElapsed = 0
			resetInput()
			const core = sim.lane.structures?.find((unit) => unit.kind === 'core' && unit.dead)
			if (core) focusCore(core.body.position)
		}
		endingElapsed += Math.max(0, dt)
		if (endingElapsed < tune.hud.ending) return
		resultShown = true
		app.audio.setMusicScene('paused')
		app.overlay.show({
			title: sim.lane.match.winner === hero.team ? 'VICTORY' : 'DEFEAT',
			theme: sim.lane.match.winner === hero.team ? 'moba-victory' : 'moba-defeat',
			accent: hex(sim.lane.match.winner === 'A' ? 'teamA' : 'teamB'),
			pointerGuard: true,
			spaceConfirm: false,
			subtitle: sim.lane.match.winner === hero.team ? 'Enemy core destroyed' : 'Your core fell',
			actions: [
				{ label: 'Again', key: 'KeyR', keyLabel: 'R', onSelect: restart },
				{ label: 'Hero', onSelect: () => leave(true) },
				{ label: 'Modes', onSelect: () => leave(false) },
			],
		})
	}
	run.clock.pause(frozen)
	run.intents.suspend(frozen)
	run.on('menu', toggle)
	window.addEventListener(
		'keydown',
		(event) => {
			if (event.defaultPrevented || event.repeat || event.code !== 'Escape') return
			toggle()
		},
		{ signal: run.signal },
	)
	run.system('input', () => {
		const back = !!app.input.pad()?.buttons[1]
		const pressed = back && !backHeld
		backHeld = back
		if (!ready() || !app.overlay.visible) return
		const input = app.input.consumeMenuInput()
		if (pressed && paused && !sim.lane.match.winner) toggle()
		else app.overlay.handleGamepad(input)
	})
	run.signal.addEventListener('abort', () => app.overlay.hide(), { once: true })
	return {
		resume() {
			if (paused) toggle()
		},
		frozen,
		result,
		presentationFrozen: () => paused || resultShown,
		endingTime: () => endingElapsed ?? 0,
	}
}
