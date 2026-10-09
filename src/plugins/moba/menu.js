import { tune } from './tune.js'
import { hex } from '../../core/style.js'
import { createRecap } from './recap.js'
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
	returnToLobby = () => false,
}) {
	const recap = createRecap({ sim, hero, canvas: app.renderer?.domElement })
	let paused = false
	let resultShown = false
	let backHeld = false
	let endingElapsed = null
	const frozen = () => paused || !!sim.lane?.match.winner
	const resetInput = () => {
		app.intents.cancel(hero.id)
		clearCamera()
	}
	function leave() {
		resetInput()
		if (app.session.shared) {
			if (app.session.authoritative) returnToLobby()
			else app.emit('menu')
			return
		}
		app.modes.start('moba-lobby', { options: { setup } })
	}
	const restart = () => {
		resetInput()
		app.modes.start('moba', { options: { setup } })
	}
	const resumeHint = () =>
		app.input.activeDevice() === 'gamepad' ? 'B to resume' : 'Esc to resume'
	function toggle() {
		if (!ready() || sim.lane?.match.winner || !app.session.actions.includes('pause')) return
		paused = !paused
		resetInput()
		app.audio.setMusicScene(paused ? 'paused' : 'play')
		if (!paused) return app.overlay.hide()
		app.overlay.show({
			title: 'PAUSED',
			theme: 'moba-pause',
			pointerGuard: true,
			spaceConfirm: false,
			subtitle: resumeHint(),
			actions: [
				{ label: 'Resume', onSelect: toggle },
				{ label: 'Leave game', onSelect: leave },
			],
		})
	}
	function result(dt = 0, alpha = 0) {
		recap.update({
			alpha: frozen() ? 0 : alpha,
			step: app.clock.step,
			device: app.input.activeDevice?.(),
			hidden: app.overlay.visible,
		})
		if (!sim.lane?.match.winner || resultShown) return
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
			title: sim.lane?.match.winner === hero.team ? 'VICTORY' : 'DEFEAT',
			theme: sim.lane?.match.winner === hero.team ? 'moba-victory' : 'moba-defeat',
			accent: hex(sim.lane?.match.winner === 'A' ? 'teamA' : 'teamB'),
			pointerGuard: true,
			spaceConfirm: false,
			subtitle: sim.lane?.match.winner === hero.team ? 'Enemy core destroyed' : 'Your core fell',
			actions: app.session.shared
				? [
						{
							label: app.session.authoritative ? 'Return to lobby' : 'Room menu · waiting for host',
							onSelect: leave,
						},
					]
				: [
						{ label: 'Again', key: 'KeyR', keyLabel: 'R', onSelect: restart },
						{ label: 'Return to lobby', onSelect: leave },
					],
		})
		if (app.renderer) recap.showTable(document.querySelector('.overlay .dialog-card'))
	}
	run.clock.pause(frozen)
	run.intents.suspend(frozen)
	run.on('menu', toggle)
	window.addEventListener(
		'keydown',
		(event) => {
			if (event.defaultPrevented || event.repeat || event.code !== 'Escape') return
			if (app.session.shared) app.emit('menu')
			else toggle()
		},
		{ signal: run.signal },
	)
	run.system('input', () => {
		const back = !!app.input.pad()?.buttons[1]
		const pressed = back && !backHeld
		backHeld = back
		if (!ready() || !app.overlay.visible) return
		if (paused) {
			const hint = document.querySelector('.overlay[data-theme="moba-pause"] .sub')
			const text = resumeHint()
			if (hint && hint.textContent !== text) hint.textContent = text
		}
		const input = app.input.consumeMenuInput()
		if (pressed && paused && !sim.lane?.match.winner) toggle()
		else app.overlay.handleGamepad(input)
	})
	run.signal.addEventListener(
		'abort',
		() => {
			recap.dispose()
			app.overlay.hide()
		},
		{ once: true },
	)
	return {
		resume() {
			if (paused) toggle()
		},
		frozen,
		result,
		cameraControls(controls) {
			if (!hero.dead || frozen() || app.input.activeDevice() !== 'gamepad') return controls
			return {
				...controls,
				pad: false,
				pan: app.input.moveVector(),
				centred: !!app.input.pad()?.buttons[10],
			}
		},
		presentationFrozen: () => paused || resultShown,
		screen: () => (resultShown ? 'result' : paused ? 'paused' : 'match'),
		endingTime: () => endingElapsed ?? 0,
	}
}
