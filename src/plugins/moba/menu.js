import { tune } from './tune.js'
import { controls, setQuickCast } from '../../core/controls.js'
import { hex } from '../../core/style.js'
import { createCornerNav } from '../../core/corner-nav.js'
import { createRecap } from './recap.js'
import { clock } from './tooltip.js'
import { tune as front } from './front/tune.js'
import { el } from '../../core/dom.js'
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
	// Leaving from pause goes home to the splash; the result card's way out stays the lobby.
	function quit() {
		if (app.session.shared) return leave()
		resetInput()
		app.modes.start('moba-front', { options: { setup, heldKeys: ['Enter'] } })
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
				{ label: 'Leave game', onSelect: quit },
				// A setting, not an action: the last cursor stop, drawn as a checkbox under the two.
				{ label: 'Quick cast', onSelect: toggleQuickCast },
			],
		})
		const card = document.querySelector('.overlay[data-theme="moba-pause"] .dialog-card')
		if (card) pausePage(card)
	}
	// The checkbox flips in place so the selection stays put.
	function toggleQuickCast() {
		setQuickCast(!controls.quickCast)
		document
			.querySelector('.overlay[data-theme="moba-pause"] .pause-check')
			?.setAttribute('aria-checked', String(controls.quickCast))
	}
	// Dresses the shared overlay card as a manual page: captions, the facts of the match, and the
	// paused world as its figure. Readouts are printed; only the overlay's buttons are framed.
	function pausePage(card) {
		const map = setup.map ?? 'overthrow'
		const mine = hero.team
		const kills = { A: 0, B: 0 }
		for (const row of Object.values(sim.matchStats ?? {}))
			if (row.team) kills[row.team === 'A' ? 'B' : 'A'] += row.deaths
		const heroId = hero.heroId ?? 'fletcher'
		const level = hero.level ?? sim.lane?.teams?.[mine].level ?? 1
		card.classList.add('moba-pause')
		card.style.setProperty('--pause-wash', front.skin.wash[map] ?? front.skin.wash.bonus)
		card.style.setProperty('--pause-mine', hex(mine === 'A' ? 'teamA' : 'teamB'))
		card.style.setProperty('--pause-theirs', hex(mine === 'A' ? 'teamB' : 'teamA'))
		const fact = (label, value, kana) =>
			`<div><small>${label}<span lang="ja">${kana}</span></small><b>${value}</b></div>`
		const facts = el(
			'div',
			'pause-facts',
			card,
			fact('Time', clock(sim.tick * app.clock.step), '時間') +
				fact(
					'Takedowns',
					`<i class="mine">${kills[mine]}</i>–<i class="theirs">${kills[mine === 'A' ? 'B' : 'A']}</i>`,
					'撃破',
				) +
				fact('Hero', `${heroId[0].toUpperCase()}${heroId.slice(1)} <em>Lv ${level}</em>`, '勇者'),
		)
		facts.setAttribute('aria-label', 'Match so far')
		el(
			'header',
			'pause-head',
			card,
			`<span>Dodgethis <span lang="ja">取扱説明書</span></span><span>${map}</span><span>P. 07</span>`,
		).setAttribute('aria-hidden', 'true')
		el('p', 'pause-kana', card, 'ポーズ').setAttribute('aria-hidden', 'true')
		el(
			'p',
			'pause-figure',
			card,
			'<span>Fig. 1</span> The match, held where you left it.',
		).setAttribute('aria-hidden', 'true')
		const quick = card.querySelectorAll('.actions button')[2]
		if (!quick) return
		quick.classList.add('pause-check')
		quick.setAttribute('role', 'checkbox')
		quick.setAttribute('aria-checked', String(controls.quickCast))
		quick.prepend(
			el(
				'span',
				'pause-box',
				null,
				'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
			),
		)
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
