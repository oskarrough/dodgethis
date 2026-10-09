import { createLink } from './link.js'
import { MAX_PLAYERS, Net } from './net.js'
import { createOnlineSession } from './online-session.js'
import { createOnlineUi } from './online-ui.js'

// Online play. A started match restarts the running mode under a shared session with the lobby's roster; the link carries it.
// Leaving restarts that mode solo. Online never names the mode, and the mode never learns it is online.
export default function online(app) {
	const net = new Net({
		capacity: () => app.modes.current?.capacity ?? MAX_PLAYERS,
		validJoinData: (data) => app.modes.current?.validJoinData?.(data) ?? true,
	})
	let link = null
	let mode = null

	function stop() {
		if (!link) return
		const solo = app.modes.current?.soloStart?.()
		link.dispose()
		link = null
		app.modes.start(solo?.mode ?? mode, solo?.args)
	}

	const session = createOnlineSession(net, {
		modeId: () => app.modes.active,
		joinData: () => app.modes.current?.joinData?.(),
		rosterSelections: () => app.modes.current?.roomRoster?.() ?? [],
		onChange(state, message) {
			if (link && state && app.session.shared)
				for (const participant of app.modes.current?.roomRoster?.() ?? [])
					if (!state.humans.some((h) => h.id === participant.id))
						app.modes.current?.removeParticipant?.(participant.id)
			ui.render(state, message)
			app.debug.panel?.setInert(!!state)
		},
		onStart(roster, matchId, hostMode) {
			link?.dispose()
			link = null
			mode = hostMode
			const previousMode = app.modes.active
			try {
				app.modes.start(mode, {
					roster,
					session: { local: [net.id], authoritative: net.isHost, shared: true, actions: [] },
				})
			} catch (error) {
				session.leave()
				if (previousMode) app.modes.start(previousMode)
				ui.show(`Could not start the host's game: ${error.message}`)
				return
			}
			link = createLink({
				net,
				matchId,
				roster,
				contract: () => app.modes.current,
				intents: app.intents,
				present: app.present,
				onLost(message) {
					session.leave()
					ui.show(message)
				},
			})
			ui.hide()
			if (app.modes.current?.roomLobby) session.setRoomPhase(true)
		},
		onAbort(message) {
			stop()
			mode = null
			if (session.state || message) ui.show(message)
		},
		onMessage(type, data, from) {
			link?.receive(type, data, from)
		},
		onBackToLobby() {
			if (!app.modes.current?.returnToLobby?.()) return false
			ui.hide()
			return true
		},
		onPeerLeave(id) {
			const current = app.modes.current
			const removed = current?.removeParticipant?.(id) ?? false
			if (removed && session.state.humans.length === 1 && !current.roomLobby)
				current.returnToLobby?.()
			return removed
		},
	})
	const ui = createOnlineUi(session, { inMatch: () => !!link, signal: app.signal })

	// The panel is a modal: it holds the local player's input, and the solo game under it, but never a shared match.
	app.intents.suspend(() => ui.open)
	app.clock.pause(() => ui.open && !link)
	app.on('session', (next) => {
		if (!link) return
		if (!next.shared) {
			// The replacement run is already live; leaving must not restart it again.
			link.dispose()
			link = null
			session.leave()
			ui.hide()
			return
		}
		ui.hide()
		if (app.modes.current?.roomLobby != null) session.setRoomPhase(app.modes.current.roomLobby)
	})
	app.on('present', (fact) => link?.record(fact))
	app.system('replicate', ({ dt }) => link?.update(dt))
	app.on('menu', () => {
		if (link && !ui.open) ui.show()
	})

	app.debug.expose({
		online: session,
		get link() {
			return link
		},
	})

	return () => {
		link?.dispose()
		link = null
	}
}
