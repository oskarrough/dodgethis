import { createLink } from './link.js'
import { MAX_PLAYERS, Net } from './net.js'
import { createOnlineSession } from './online-session.js'
import { createOnlineUi } from './online-ui.js'

// Online play. A started match restarts the running mode under a shared session with the lobby's roster; the link carries it.
// Leaving restarts that mode solo. Online never names the mode, and the mode never learns it is online.
// `join` is a room code from a link: the first frame joins it, and a dead code stays solo with a notice.
export default function online(app, { join = null } = {}) {
	const net = new Net({
		capacity: () => app.modes.current?.capacity ?? MAX_PLAYERS,
		validJoinData: (data) => app.modes.current?.validJoinData?.(data) ?? true,
	})
	let link = null
	let mode = null
	let joining = null

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
		hasRoomLobby: () => app.modes.current?.roomLobby === true,
		openSeats: () => app.modes.current?.openSeats?.() ?? false,
		seatLate: (joiner) => app.modes.current?.seatLate?.(joiner) ?? null,
		onSeat: (peerId, id) => link?.seat(peerId, id),
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
			const humans = session.state.humans
			const local = humans.find((h) => h.peerId === net.id)?.id ?? net.id
			try {
				app.modes.start(mode, {
					roster,
					session: { local: [local], authoritative: net.isHost, shared: true, actions: [] },
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
				local,
				peers: humans.filter((h) => h.peerId !== net.id),
				contract: () => app.modes.current,
				intents: app.intents,
				present: app.present,
				onLost(message) {
					session.leave()
					ui.show(message)
				},
				onSilent: (peerId) => net.drop(peerId),
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
			// A lane that hands the seat to a bot plays on; one that dropped the hero regroups.
			if (
				removed &&
				session.state.humans.length === 1 &&
				!current.roomLobby &&
				!current.openSeats?.()
			)
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
	app.system('replicate', ({ dt }) => {
		if (join) joinByLink(join)
		link?.update(dt)
	})
	async function joinByLink(code) {
		join = null
		joining = code
		try {
			await session.join(code)
		} catch (error) {
			if (session.state) return
			ui.show(`${error.message}. You're playing solo.`)
		} finally {
			joining = null
		}
	}
	app.on('menu', () => {
		if (link && !ui.open) ui.show()
	})

	const keepalive = setInterval(() => link?.keepalive(), 1000)
	app.debug.expose({
		online: session,
		// The room the address bar names: the one we're in, or the link's while it is joining.
		get room() {
			return session.state?.code ?? join ?? joining
		},
		get link() {
			return link
		},
	})

	return () => {
		clearInterval(keepalive)
		link?.dispose()
		link = null
	}
}
