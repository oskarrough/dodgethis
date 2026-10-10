import { tune } from './tune.js'
import { controls, setQuickCast } from '../../core/controls.js'
import { hex } from '../../core/style.js'
import { createCornerNav } from '../../core/corner-nav.js'
import { createRecap } from './recap.js'
import './menu.css'

const MENU_ICON =
	'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6.5h14M5 12h14M5 17.5h14" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>'

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
	let selectHeld = false
	let board = false
	let endingElapsed = null
	const frozen = () => paused || !!sim.lane?.match.winner
	const resetInput = () => {
		controls.attackArmed = false
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
			actions: [
				{ label: 'Resume', onSelect: toggle },
				quickCastAction(),
				{ label: 'Leave game', onSelect: leave },
			],
		})
	}
	// The label is rewritten in place so the selection stays put.
	const quickCastLabel = () => `Quick cast: ${controls.quickCast ? 'on' : 'off'}`
	function quickCastAction() {
		const action = {
			label: quickCastLabel(),
			onSelect() {
				setQuickCast(!controls.quickCast)
				action.label = quickCastLabel()
				const labels = document.querySelectorAll('.overlay[data-theme="moba-pause"] .label')
				for (const label of labels)
					if (label.textContent.startsWith('Quick cast')) label.textContent = action.label
			},
		}
		return action
	}
	function result(dt = 0, alpha = 0) {
		recap.update({
			alpha: frozen() ? 0 : alpha,
			step: app.clock.step,
			device: app.input.activeDevice?.(),
			hidden: app.overlay.visible,
		})
		recap.updateBoard(board && !app.overlay.visible && !resultShown)
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
			if (event.code !== 'Tab' || event.defaultPrevented || app.overlay.visible) return
			if (event.target?.closest?.('input, textarea, select, [contenteditable]')) return
			event.preventDefault()
			if (!event.repeat) board = !board
		},
		{ signal: run.signal },
	)
	const openMenu = () => (app.session.shared ? app.emit('menu') : toggle())
	window.addEventListener(
		'keydown',
		(event) => {
			if (event.defaultPrevented || event.repeat || event.code !== 'Escape') return
			// Esc first drops a held aim or an armed attack-move (the intents sampler sees the same key).
			if (!paused && (controls.attackArmed || Object.keys(app.intents.get(hero.id).held).length))
				return
			openMenu()
		},
		{ signal: run.signal },
	)
	// The visible way out: the lobby's corner tile, wearing a menu icon. It sits off the canvas,
	// so a click never reaches the move orders.
	const corner = app.renderer ? createCornerNav(document.body, { label: 'Menu' }) : null
	if (corner) {
		corner.online.remove()
		corner.back.innerHTML = MENU_ICON
		corner.back.onclick = openMenu
	}
	run.system('input', () => {
		const back = !!app.input.pad()?.buttons[1]
		const pressed = back && !backHeld
		backHeld = back
		const select = !!app.input.pad()?.buttons[8]
		if (select && !selectHeld && !app.overlay.visible) board = !board
		selectHeld = select
		if (!ready() || !app.overlay.visible) return
		const input = app.input.consumeMenuInput()
		if (pressed && paused && !sim.lane?.match.winner) toggle()
		else app.overlay.handleGamepad(input)
	})
	run.signal.addEventListener(
		'abort',
		() => {
			recap.dispose()
			corner?.el.remove()
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
