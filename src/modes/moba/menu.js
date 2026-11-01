import { tune } from './tune.js'
import { controls, setQuickCast } from '../../core/controls.js'
import { hex } from '../../core/style.js'
import { createCornerNav } from '../../core/corner-nav.js'
import { createRecap } from './recap.js'
import { tune as front } from './front/tune.js'
import { el } from '../../core/dom.js'
import { runResult } from './run-result.js'
import { hintMemory } from './mechanics/hints/hints-memory.js'
import './menu.css'

// The map's name in the manual's Japanese running head.
const MAP_KANA = { overthrow: '転覆', flagfall: '旗落とし' }

// A door with an arrow out of it: Leave, on the pause and the run's result page.
const DOOR =
	'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4.5H5.5v15H10"/><path d="M9.5 12h10.5M16.5 8.2 20.3 12l-3.8 3.8"/></svg>'

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
	roster = [],
}) {
	const recap = createRecap({ sim, hero, canvas: app.renderer?.domElement, paper })
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
		if (sim.dungeon && (!app.session.shared || app.session.authoritative)) return returnToLobby()
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
	// A dungeon run starts over with the same party and difficulty: the seats it was dealt.
	const runAgain = () => {
		resetInput()
		app.modes.start('moba', { roster: structuredClone(roster), options: { setup } })
	}
	function door(button) {
		button?.classList.add('pause-leave')
		button?.prepend(el('span', 'pause-door', null, DOOR))
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
			volumes: true,
			pointerGuard: true,
			spaceConfirm: false,
			actions: [
				{ label: 'Resume', onSelect: toggle },
				{ label: 'Leave', onSelect: quit },
				// A setting, not an action: the last cursor stop, drawn small under the two. The
				// controls preset lives on the top-right tile.
				{ label: 'Quick cast', onSelect: toggleQuickCast },
				// Off hides the first-time hints; on again starts their lessons over (mechanics/hints).
				{ label: 'Hints', onSelect: toggleHints },
			],
		})
		const card = document.querySelector('.overlay[data-theme="moba-pause"] .dialog-card')
		if (card) pausePage(card)
	}
	// The checkbox flips in place so the selection stays put.
	function toggleQuickCast() {
		setQuickCast(!controls.quickCast)
		document
			.querySelector('.overlay[data-theme="moba-pause"] .pause-quick')
			?.setAttribute('aria-checked', String(controls.quickCast))
	}
	function toggleHints() {
		hintMemory.setOn(!hintMemory.on)
		document
			.querySelector('.overlay[data-theme="moba-pause"] .pause-hints')
			?.setAttribute('aria-checked', String(hintMemory.on))
	}
	// The front end's paper for anything that stops play: the map's wash, day or night, and the
	// two team inks (menu.css).
	function paper(node) {
		const map = setup.map ?? 'overthrow'
		node.classList.add('moba-paper')
		node.dataset.light = front.skin.light[map] ?? 'day'
		node.style.setProperty('--page-wash', front.skin.wash[map] ?? front.skin.wash.bonus)
		node.style.setProperty('--page-mine', hex(hero.team === 'A' ? 'teamA' : 'teamB'))
		node.style.setProperty('--page-theirs', hex(hero.team === 'A' ? 'teamB' : 'teamA'))
		return node
	}
	// The shared overlay card as a manual page on that paper: the running head and the page's
	// word in Japanese down the sheet.
	function page(card, kind, kana) {
		const map = setup.map ?? 'overthrow'
		paper(card).classList.add('moba-page', kind)
		el(
			'header',
			'page-head',
			card,
			`<span>Dodgethis <span lang="ja">取扱説明書</span></span><span>${map}<span lang="ja">${MAP_KANA[map] ?? ''}</span></span>`,
		).setAttribute('aria-hidden', 'true')
		el('p', 'page-kana', card, kana).setAttribute('aria-hidden', 'true')
	}
	// The pause page is a wash over the stopped world, not a sheet: the top bar stays up and says
	// how the match stands, so the page holds only what you can do.
	function pausePage(card) {
		paper(card).classList.add('moba-page', 'moba-pause')
		const [, leaveButton, quick, hintsButton] = card.querySelectorAll('.actions button')
		door(leaveButton)
		for (const [button, on, name] of [
			[quick, controls.quickCast, 'pause-quick'],
			[hintsButton, hintMemory.on, 'pause-hints'],
		]) {
			if (!button) continue
			button.classList.add('pause-check', name)
			button.setAttribute('role', 'checkbox')
			button.setAttribute('aria-checked', String(on))
			button.prepend(
				el(
					'span',
					'pause-box',
					null,
					'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
				),
			)
		}
	}
	function result(dt = 0) {
		recap.update({
			device: app.input.activeDevice?.(),
			hidden: app.overlay.visible,
		})
		recap.updateBoard(board && !app.overlay.visible && !resultShown)
		if (!sim.lane?.match.winner || resultShown) return
		const won = sim.lane.match.winner === hero.team
		if (endingElapsed === null) {
			endingElapsed = 0
			resetInput()
			const core = sim.lane.structures?.find((unit) => unit.kind === 'core' && unit.dead)
			if (core) focusCore(core.body.position)
			// A run's end: the camera rests on the last to fall and the music gives way to the wind.
			if (sim.dungeon) {
				const fallen = won ? sim.dungeon.encounters.find((e) => e.last)?.units[0] : hero
				if (fallen) focusCore(fallen.body.position)
				app.audio.setMusicScene('wind')
			}
		}
		endingElapsed += Math.max(0, dt)
		if (endingElapsed < (sim.dungeon ? tune.hud.runEnding : tune.hud.ending)) return
		resultShown = true
		app.audio.setMusicScene('paused')
		// A run's page draws its own end (run-result.js); its ways on are again and home.
		const solo = sim.dungeon && !app.session.shared
		app.overlay.show({
			title: sim.lane?.match.winner === hero.team ? 'VICTORY' : 'DEFEAT',
			theme: sim.lane?.match.winner === hero.team ? 'moba-victory' : 'moba-defeat',
			accent: hex(sim.lane?.match.winner === 'A' ? 'teamA' : 'teamB'),
			pointerGuard: true,
			spaceConfirm: false,
			// A dungeon's marks show who fell; a lane says how the core went.
			subtitle: sim.dungeon ? '' : won ? 'Enemy core destroyed' : 'Your core fell',
			actions: solo
				? [
						{ label: 'Try again', key: 'KeyR', keyLabel: 'R', onSelect: runAgain },
						{ label: 'Leave', onSelect: quit },
					]
				: app.session.shared
					? [
							{
								label: app.session.authoritative
									? 'Return to lobby'
									: 'Room menu · waiting for host',
								onSelect: leave,
							},
							share,
						]
					: [
							{ label: 'Again', key: 'KeyR', keyLabel: 'R', onSelect: restart },
							{ label: 'Return to lobby', onSelect: leave },
							share,
						],
		})
		const card = document.querySelector('.overlay .dialog-card')
		if (!app.renderer || !card) return
		if (sim.dungeon) runResult(card, { sim, hero })
		else recap.showTable(card)
		page(card, 'moba-result', won ? '勝利' : '敗北')
		if (solo) door(card.querySelectorAll('.actions button')[1])
	}
	// The result card's brag: a line of the match and the link the address bar shows, the room's in a shared match.
	const share = {
		label: 'Copy link',
		async onSelect() {
			const won = sim.lane?.match.winner === hero.team
			const row = sim.matchStats?.[hero.id]
			const name = (id) => id[0].toUpperCase() + id.slice(1)
			const text = [
				`${won ? 'Won' : 'Lost'} on ${name(setup.map ?? 'overthrow')} as ${name(hero.heroId)}${row ? `: ${row.kills} kills, ${row.deaths} deaths` : ''}.`,
				`${app.session.shared ? 'Rematch' : 'Your turn'}: ${location.href}`,
			].join('\n')
			try {
				await navigator.clipboard.writeText(text)
			} catch {
				// Plain-http LAN play has no async clipboard; the card sits under the curtain, so copy from inside it.
				const area = el('textarea', '', document.querySelector('.overlay .dialog-card'))
				area.value = text
				area.select()
				document.execCommand('copy')
				area.remove()
			}
			share.label = 'Copied'
			for (const label of document.querySelectorAll('.overlay .actions .label'))
				if (label.textContent === 'Copy link') label.textContent = 'Copied'
		},
	}
	run.clock.pause(frozen)
	run.intents.suspend(frozen)
	run.on('menu', toggle)
	window.addEventListener(
		'keydown',
		(event) => {
			if (event.ctrlKey || event.metaKey || event.altKey) return
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
		const input = app.input.consumeMenuInput()
		if (!ready() || !app.overlay.visible) return
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
