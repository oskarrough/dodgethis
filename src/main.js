import { followScreen } from './address.js'
import { createBrowserApp, reportBootError } from './core/browser.js'
import dodgeball from './plugins/dodgeball/index.js'
import moba from './plugins/moba/index.js'
import { parseMatchSetup, wantsDirectPlay } from './plugins/moba/setup.js'
import { mobaFront } from './plugins/moba/front/index.js'
import { createMapScope } from './plugins/moba/map.js'
import online from './plugins/online/index.js'
import { roomCode } from './plugins/online/net.js'

// Composition owns the lobby's cross-plugin destination; plugins never import each other.
try {
	const app = await createBrowserApp()
	const map = createMapScope(app.scene, app.RAPIER, app.clock.step)
	app.use((scope) =>
		dodgeball(scope, {
			hubPortal: {
				label: 'MOBA',
				onSelect: () => scope.modes.start('moba-lobby'),
			},
			lobbyExit: { onSelect: () => scope.modes.start('moba-front') },
		}),
	)
	app.use((scope) => moba(scope, map))
	app.use((scope) => mobaFront(scope, map))
	// A room link (/ABCDE) skips the splash: solo practice in the lobby while online joins the room.
	const room = roomCode(location.pathname)
	app.use((scope) => online(scope, { join: room }))
	// Registered last so app teardown aborts every run before freeing the shared world.
	app.use(() => () => map.dispose())
	// Boot, and Back or Forward onto another screen, open the screen the URL names.
	async function route(url, booting = false) {
		const query = url.searchParams
		// Joining a room or loading a replay only happens at boot.
		if (!booting && (roomCode(url.pathname) || query.has('replay'))) return location.reload()
		if (query.get('mode') === 'moba' && query.has('replay')) {
			const { mobaReplay, loadReplay } = await import('./plugins/moba/replay.js')
			app.use(mobaReplay)
			app.modes.start('moba-replay', { options: { replay: await loadReplay(query.get('replay')) } })
			return
		}
		const room = booting && roomCode(url.pathname)
		const moba = room || query.get('mode') === 'moba'
		const mode = moba
			? !room && wantsDirectPlay(query)
				? 'moba'
				: 'moba-lobby'
			: query.get('mode') === 'dodgeball'
				? 'dodgeball'
				: 'moba-front'
		if (mode === app.modes.active) return
		app.modes.start(mode, moba ? { options: { setup: parseMatchSetup(query) } } : {})
	}
	await route(new URL(location.href), true)
	followScreen(app, route)
	app.run()
} catch (err) {
	reportBootError(err)
}
