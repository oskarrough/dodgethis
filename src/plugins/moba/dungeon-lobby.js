import { listedHeroes, DEFAULT_HERO } from './heroes.js'
import { tune } from './tune.js'
import { createBackdrop } from './front/backdrop.js'
import { startLoading } from './front/descent.js'
import { applySkin } from './front/skin.js'
import { validLobbyHandoff } from './lobby-handoff.js'
import { playUse } from './sounds.js'
import './dungeon-lobby.css'

// The party uses the ordinary lobby sim and wire protocol, but has no world-space UI.
export function createDungeonLobby({ app, run, sim, hero, setup, options }) {
	const readySeats = sim.readySeats
	const choices = listedHeroes({ ...setup, party: true, debug: true })
	const el = options.el ?? document.createElement('main')
	let backdrop = options.backdrop ?? null
	backdrop?.el.remove()
	el.className = 'moba-front dungeon-lobby'
	el.dataset.screen = 'lobby'
	el.setAttribute('aria-label', 'Dungeon party')
	applySkin(el)
	el.innerHTML = `<div class="dungeon-party-shell">
		<nav aria-label="Party navigation"><button type="button" data-back>Back</button><button type="button" class="online-entry">Play online</button></nav>
		<header><p class="dungeon-party-kicker">Co-op / 1–${tune.lobby.partyCapacity} heroes</p><h1 class="skin-title">Dungeon</h1><p>Assemble your party. Face the Warden.</p></header>
		<section aria-label="Your party"><div class="dungeon-party-heading"><h2>Your party</h2><span data-count></span></div><ol class="dungeon-party-rows"></ol></section>
		<footer><p data-status role="status"></p><button type="button" data-launch></button></footer>
	</div>`
	document.body.append(el)
	document.body.classList.add('dungeon-party-open')
	app.audio.setMusicScene('wind')
	let ending = false
	// A DOM-only lobby must not queue GPU work behind its hidden canvas. Descent
	// resumes drawing before the lobby scope hands the renderer to the match.
	run.renderDemand(() => ending)
	let transferred = false
	let handoff = null
	let loadingQueued = false
	let drawn = ''
	const names = new Map()
	const rows = el.querySelector('.dungeon-party-rows')
	const launch = el.querySelector('[data-launch]')
	const status = el.querySelector('[data-status]')
	const online = el.querySelector('.online-entry')
	let previousPad = app.input.pad()?.buttons.slice() ?? []
	const label = (id) => names.get(id) ?? (id === hero.id ? 'You' : 'Player')
	const humans = () => readySeats.seats.filter((s) => s.occupant && !s.occupant.bot)
	const waiting = () => humans().filter((s) => s.occupant.id !== hero.id && !s.full)
	const rowViews = readySeats.seats.map((seat, index) => {
		const row = document.createElement('li')
		row.innerHTML = `<span class="dungeon-party-number">${String(index + 1).padStart(2, '0')}</span><div class="dungeon-party-person"><strong></strong><small></small></div><select></select><span class="dungeon-party-ready"></span><button type="button" data-bot></button>`
		const select = row.querySelector('select')
		for (const choice of choices) select.add(new Option(choice.name, choice.id))
		select.onchange = () => pickHero(seat.id, select.value)
		row.querySelector('[data-bot]').onclick = () => editBot(seat.id)
		rows.append(row)
		return {
			row,
			select,
			name: row.querySelector('strong'),
			detail: row.querySelector('small'),
			ready: row.querySelector('.dungeon-party-ready'),
			bot: row.querySelector('[data-bot]'),
		}
	})
	function syncPick() {
		setup.heroId = hero.heroId
		setup.picks[hero.id] = { ...setup.picks[hero.id], heroId: hero.heroId, team: 'A' }
	}
	function pickHero(seatId, heroId) {
		if (ending) return false
		const seat = readySeats.seats.find((s) => s.id === seatId)
		const occupant = seat?.occupant
		const index = choices.findIndex((h) => h.id === heroId)
		if (!occupant || index < 0) return false
		if (occupant.bot) {
			if (!app.session.authoritative) return false
			if (!readySeats.claim(seat.id, { ...occupant, heroId }, sim.tick)) return false
			setup.picks[occupant.id] = { heroId, team: 'A' }
			return true
		}
		if (occupant.id !== hero.id) return false
		// A pick's existing point payload carries the dropdown index, not a walking target.
		run.intents.press(hero.id, 'pick', { x: index, z: 0 })
		return true
	}
	function editBot(seatId) {
		if (ending || !app.session.authoritative) return false
		const seat = readySeats.seats.find((s) => s.id === seatId)
		if (!seat || (seat.occupant && !seat.occupant.bot)) return false
		if (seat.occupant) {
			delete setup.picks[seat.occupant.id]
			readySeats.release(seat.occupant.id, sim.tick)
		} else {
			let serial = 1
			while (readySeats.seatOf(`bot-A-${serial}`)) serial++
			const added = readySeats.claim(
				seat.id,
				{
					id: `bot-A-${serial}`,
					heroId: DEFAULT_HERO,
					bot: true,
					joinOrder: readySeats.seats.length + serial,
				},
				sim.tick,
			)
			if (added) setup.picks[`bot-A-${serial}`] = { heroId: DEFAULT_HERO, team: 'A' }
		}
		return true
	}
	function activate() {
		if (ending) return false
		if (app.session.authoritative && waiting().length) return false
		const own = readySeats.seatOf(hero.id)
		if (!own) return false
		const action = !app.session.authoritative && own.full ? 'cancel' : 'ready'
		run.intents.press(hero.id, action, action === 'ready' ? readySeats.readyPoint() : null)
		return true
	}
	function back() {
		if (ending) return
		if (app.session.shared) {
			app.emit('menu')
			return
		}
		syncPick()
		transferred = true
		app.modes.start('moba-front', { options: { setup, ...(backdrop ? { backdrop } : {}) } })
	}
	launch.onclick = activate
	el.querySelector('[data-back]').onclick = back
	window.addEventListener(
		'keydown',
		(event) => {
			if (
				ending ||
				event.repeat ||
				event.ctrlKey ||
				event.metaKey ||
				event.altKey ||
				document.querySelector('dialog[open]')
			)
				return
			if (event.target?.closest?.('input, select, textarea, button, .lil-gui')) return
			if (event.code === 'Enter') {
				event.preventDefault()
				activate()
			}
			if (event.code === 'Escape') {
				event.preventDefault()
				back()
			}
		},
		{ signal: run.signal },
	)
	function update() {
		const buttons = app.input.pad()?.buttons ?? []
		const down = (i) => buttons[i] && !previousPad[i]
		if (!ending && !el.inert && !document.querySelector('dialog[open]')) {
			const controls = [...el.querySelectorAll('button, select')].filter(
				(node) => !node.disabled && !node.hidden,
			)
			const focused = document.activeElement
			if (down(12) || down(13)) {
				const direction = down(12) ? -1 : 1
				controls[
					(controls.indexOf(focused) + direction + controls.length) % controls.length
				]?.focus()
			}
			if ((down(14) || down(15)) && focused?.matches('select') && el.contains(focused)) {
				const index = choices.findIndex((h) => h.id === focused.value)
				focused.value = choices[(index + (down(14) ? -1 : 1) + choices.length) % choices.length].id
				focused.onchange()
			}
			if (down(0)) {
				if (!el.contains(focused)) launch.click()
				else if (focused.matches('button')) focused.click()
			}
			if (down(9)) activate()
			if (down(1)) back()
		}
		previousPad = buttons.slice()
		if (run.signal.aborted) return
		syncPick()
		const state = JSON.stringify([
			app.session.authoritative,
			app.session.shared,
			[...names],
			readySeats.seats.map((s) => [s.occupant, s.full]),
			sim.heroes.map((h) => [h.id, h.heroId]),
		])
		if (drawn === state) return
		drawn = state
		for (const [i, seat] of readySeats.seats.entries()) {
			const view = rowViews[i]
			const occupant = seat.occupant
			const own = occupant?.id === hero.id
			const host =
				occupant &&
				!occupant.bot &&
				(occupant.joinOrder === 0 || (own && app.session.authoritative))
			view.row.dataset.kind = occupant ? (occupant.bot ? 'bot' : 'human') : 'empty'
			view.row.dataset.ready = String(!!occupant && seat.full)
			view.name.textContent = !occupant ? 'Empty' : occupant.bot ? 'Bot' : label(occupant.id)
			view.detail.textContent = !occupant
				? 'No hero joins from this row'
				: occupant.bot
					? 'Host-controlled companion'
					: own
						? names.has(hero.id)
							? 'You'
							: 'Your hero'
						: 'Chooses their own hero'
			view.select.hidden = !occupant
			view.select.disabled = ending || !(own || (occupant?.bot && app.session.authoritative))
			view.select.setAttribute('aria-label', `Hero for ${view.name.textContent}, row ${i + 1}`)
			if (occupant)
				view.select.value = sim.heroes.find((h) => h.id === occupant.id)?.heroId ?? occupant.heroId
			view.ready.textContent = !occupant ? '—' : host ? 'Host' : seat.full ? 'Ready' : 'Not ready'
			view.bot.hidden = !app.session.authoritative || (!!occupant && !occupant.bot)
			view.bot.disabled = ending
			view.bot.textContent = occupant ? 'Remove bot' : 'Add bot'
			view.bot.setAttribute('aria-label', `${view.bot.textContent}, row ${i + 1}`)
		}
		// The host starts rather than pre-readies; don't tell guests to await a host ready toggle.
		const pending = app.session.authoritative
			? waiting()
			: waiting().filter((s) => s.occupant.joinOrder !== 0)
		const ownReady = readySeats.seatOf(hero.id)?.full
		launch.textContent = app.session.authoritative
			? app.session.shared
				? 'Start dungeon'
				: 'Enter dungeon'
			: ownReady
				? 'Not ready'
				: 'Ready'
		launch.disabled = ending || (app.session.authoritative && pending.length > 0)
		launch.setAttribute('aria-pressed', String(!!ownReady))
		status.textContent = ending
			? 'Entering dungeon…'
			: app.session.authoritative
				? pending.length
					? `Waiting for ${pending.map((s) => label(s.occupant.id)).join(', ')} to ready up.`
					: 'Party ready. Launch when you are.'
				: !ownReady
					? 'Choose your hero, then mark yourself ready.'
					: pending.length
						? `Waiting for ${pending.map((s) => label(s.occupant.id)).join(', ')} to ready up.`
						: 'Ready. Waiting for the host to start the dungeon.'
		online.textContent = app.session.shared ? 'Invite / Online party' : 'Play online'
		el.querySelector('[data-count]').textContent =
			`${readySeats.seats.filter((s) => s.occupant).length} / ${readySeats.seats.length}`
	}
	function loadLane() {
		ending = transferred = true
		drawn = ''
		update()
		document.body.classList.remove('dungeon-party-open')
		backdrop ??= createBackdrop()
		playUse(app.audio, 'lobby.start')
		startLoading(app, {
			el,
			backdrop,
			setup: handoff.setup,
			difficulty: handoff.setup.difficulty,
			roster: handoff.roster,
			handoff,
		})
	}
	function beginLoading() {
		if (ending || !app.session.authoritative || !readySeats.allReady()) return
		syncPick()
		const roster = readySeats.laneRoster(hero.id, setup.difficulty, setup.seed)
		setup.picks = Object.fromEntries(roster.map((p) => [p.id, { heroId: p.heroId, team: 'A' }]))
		handoff = { setup: structuredClone(setup), roster }
		loadLane()
	}
	update()
	run.debug.expose({
		get screen() {
			return ending ? 'descent' : 'lobby'
		},
		dungeonParty: { sim, setup, readySeats, pickHero, editBot, activate, snapshot: sim.snapshot },
	})
	run.signal.addEventListener(
		'abort',
		() => {
			document.body.classList.remove('dungeon-party-open')
			el.remove()
			if (!transferred) backdrop?.dispose()
		},
		{ once: true },
	)
	return {
		get handoff() {
			return handoff
		},
		names(byId) {
			names.clear()
			for (const [id, name] of Object.entries(byId)) if (name) names.set(id, name)
			update()
		},
		follow(next) {
			if (app.session.authoritative || !app.session.shared) return false
			if (ending) return true
			if (!validLobbyHandoff(next, { setup, sim, readySeats })) return false
			handoff = structuredClone(next)
			handoff.setup.edgePan = setup.edgePan
			loadLane()
			return true
		},
		frozen: () => false,
		presentationFrozen: () => false,
		resume() {},
		result() {},
		touchMode: () => false,
		inspectAim: () => null,
		prepareInput() {
			const frame = app.intents.get(hero.id)
			frame.move = { x: 0, z: 0 }
			frame.order = frame.aim = null
			frame.held = {}
			for (const edge of frame.pressed.slice())
				if (!['pick', 'ready', 'cancel', 'stop'].includes(edge.action))
					run.intents.consume(hero.id, edge.action)
		},
		step() {
			for (const human of sim.heroes) {
				const frame = app.intents.get(human.id)
				const picks = frame.pressed.filter((e) => e.action === 'pick')
				for (const edge of picks) run.intents.consume(human.id, edge.action)
				const at = picks.at(-1)?.at
				const choice = at?.z === 0 && Number.isInteger(at.x) ? choices[at.x] : null
				if (choice && choice.id !== human.heroId) sim.swapHero(human.id, choice.id)
			}
		},
		afterStep() {
			if (app.session.authoritative && waiting().length && readySeats.seatOf(hero.id)?.full)
				readySeats.cancel(hero.id, sim.tick)
			if (ending || loadingQueued || !app.session.authoritative || !readySeats.allReady()) return
			loadingQueued = true
			queueMicrotask(() => {
				loadingQueued = false
				if (!run.signal.aborted) beginLoading()
			})
		},
		update,
		hudFrame: () => ({
			lobby: true,
			inspectionDisabled: true,
			inspectables: [],
			hero,
			sim,
			step: app.clock.step,
			localTeam: 'A',
			cooldowns: hero.cd.slice(0, 3).map(() => 0),
			hp: hero.hp,
			maxHp: hero.maxHp,
			respawn: null,
		}),
	}
}
