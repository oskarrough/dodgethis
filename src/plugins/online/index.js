import { createLink } from './link.js'
import { Net } from './net.js'
import { createOnlineSession } from './online-session.js'
import { createOnlineUi } from './online-ui.js'

// Online play. A started match restarts the running mode under a shared session with the lobby's roster; the link carries it.
// Leaving restarts that mode solo. Online never names the mode, and the mode never learns it is online.
export default function online(app) {
	const net = new Net()
	let link = null
	let mode = null

	function stop() {
		if (!link) return
		link.dispose()
		link = null
		app.modes.start(mode)
	}

	const session = createOnlineSession(net, {
		onChange(state, message) {
			ui.render(state, message)
			app.debug.panel?.setInert(!!state)
		},
		onStart(roster, matchId) {
			link?.dispose()
			link = null
			mode ??= app.modes.active
			const contract = app.modes.start(mode, {
				roster,
				session: { local: [net.id], authoritative: net.isHost, shared: true, actions: [] },
			})
			link = createLink({
				net,
				matchId,
				roster,
				contract,
				intents: app.intents,
				present: app.present,
				onLost(message) {
					session.leave()
					ui.show(message)
				},
			})
			ui.hide()
		},
		onAbort(message) {
			stop()
			mode = null
			if (session.state || message) ui.show(message)
		},
		onMessage(type, data, from) {
			link?.receive(type, data, from)
		},
	})
	const ui = createOnlineUi(session, { inMatch: () => !!link })

	// The panel is a modal: it holds the local player's input, and the solo game under it, but never a shared match.
	app.intents.suspend(() => ui.open)
	app.clock.pause(() => ui.open && !link)
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
