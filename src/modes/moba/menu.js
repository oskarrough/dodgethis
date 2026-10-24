import { tune } from './tune.js'
import { controls, cyclePreset, onPreset, setQuickCast } from '../../core/controls.js'
import { PRESETS } from '../../core/intents.js'
import { hex } from '../../core/style.js'
import { createCornerNav } from '../../core/corner-nav.js'
import { createRecap } from './recap.js'
import { clock } from './tooltip.js'
import { tune as front } from './front/tune.js'
import { el } from '../../core/dom.js'
import { DEFAULT_HERO } from './heroes.js'
import './menu.css'

// The map's name in the manual's Japanese running head.
const MAP_KANA = { overthrow: '転覆', flagfall: '旗落とし' }

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
	const recap = createRecap({ sim, hero, canvas: app.renderer?.domElement, paper })
	// The Warden's room says its goal here; a dungeon says it in the top bar.
	const goal =
		sim.boss && !sim.boss.bosses
			? el(
					'p',
					'dungeon-goal',
					document.body,
					'Keep your party alive; the Warden turns on whoever hurts it most.',
				)
			: null
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
		if (sim.boss && (!app.session.shared || app.session.authoritative)) return returnToLobby()
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
		presetAction.label = presetLabel()
		app.overlay.show({
			title: 'PAUSED',
			theme: 'moba-pause',
			pointerGuard: true,
			spaceConfirm: false,
			actions: [
				{ label: 'Resume', onSelect: toggle },
				{ label: sim.boss ? 'Party lobby' : 'Leave game', onSelect: sim.boss ? leave : quit },
				// Settings, not actions: the last cursor stops, drawn small under the two.
				{ label: 'Quick cast', onSelect: toggleQuickCast },
				presetAction,
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
	const presetLabel = () => `Controls: ${PRESETS[controls.preset]?.name ?? PRESETS.moba.name}`
	// Cycles MOBA → WASD → keyboard only in place, dropping any held aim from the old bindings.
	const presetAction = { label: presetLabel(), onSelect: nextPreset }
	function nextPreset() {
		cyclePreset()
		app.intents.cancel(hero.id)
	}
	// The top-right tile cycles it too, even under the open page.
	const offPreset = onPreset(() => {
		presetAction.label = presetLabel()
		const label = document.querySelector('.overlay[data-theme="moba-pause"] .pause-preset .label')
		if (label) label.textContent = presetAction.label
	})
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
	// The pause page adds the facts of the match. Readouts are printed; only the overlay's
	// buttons are framed.
	function pausePage(card) {
		const mine = hero.team
		const kills = { A: 0, B: 0 }
		for (const row of Object.values(sim.matchStats ?? {}))
			if (row.team) kills[row.team === 'A' ? 'B' : 'A'] += row.deaths
		const heroId = hero.heroId ?? DEFAULT_HERO
		const level = hero.level ?? sim.lane?.teams?.[mine].level ?? 1
		page(card, 'moba-pause', 'ポーズ')
		const fact = (label, value, kana) =>
			`<div><small>${label}<span lang="ja">${kana}</span></small><b>${value}</b></div>`
		const facts = el(
			'div',
			'pause-facts',
			card,
			fact('Time', clock(sim.tick * app.clock.step), '時間') +
				fact(
					sim.boss ? 'Opponent' : 'Takedowns',
					sim.boss
						? 'Warden'
						: `<i class="mine">${kills[mine]}</i>–<i class="theirs">${kills[mine === 'A' ? 'B' : 'A']}</i>`,
					'撃破',
				) +
				fact('Hero', `${heroId[0].toUpperCase()}${heroId.slice(1)} <em>Lv ${level}</em>`, '勇者'),
		)
		facts.setAttribute('aria-label', 'Match so far')
		const [, , quick, preset] = card.querySelectorAll('.actions button')
		preset?.classList.add('pause-check', 'pause-preset')
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
	function result(dt = 0) {
		recap.update({
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
		recap.showTable(card)
		page(card, 'moba-result', sim.lane.match.winner === hero.team ? '勝利' : '敗北')
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
			offPreset()
			goal?.remove()
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
