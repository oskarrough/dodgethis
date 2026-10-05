import { createBrowserApp, reportBootError } from './core/browser.js'
import dodgeball from './plugins/dodgeball/index.js'
import moba from './plugins/moba/index.js'
import { parseMatchSetup, wantsDirectPlay } from './plugins/moba/setup.js'
import { mobaFront } from './plugins/moba/front/index.js'
import { createMapScope } from './plugins/moba/map.js'
import online from './plugins/online/index.js'

// Composition owns the hub's cross-plugin destination; plugins never import each other.
try {
	const app = await createBrowserApp()
	const map = createMapScope(app.scene, app.RAPIER, app.clock.step)
	app.use((scope) =>
		dodgeball(scope, {
			hubPortal: {
				label: 'MOBA',
				onSelect() {
					const url = new URL(location.href)
					url.searchParams.set('mode', 'moba')
					history.replaceState(null, '', url)
					scope.modes.start('moba-lobby')
				},
			},
			hubExit: { onSelect: () => scope.modes.start('moba-front') },
		}),
	)
	app.use((scope) => moba(scope, map))
	app.use((scope) => mobaFront(scope, map))
	app.use(online)
	// Registered last so app teardown aborts every run before freeing the shared world.
	app.use(() => () => map.dispose())
	const query = new URLSearchParams(location.search)
	if (query.get('mode') === 'moba' && query.has('replay')) {
		const { mobaReplay, loadReplay } = await import('./plugins/moba/replay.js')
		app.use(mobaReplay)
		app.modes.start('moba-replay', { options: { replay: await loadReplay(query.get('replay')) } })
	} else if (query.get('mode') === 'moba') {
		const setup = parseMatchSetup(query)
		app.modes.start(wantsDirectPlay(query) ? 'moba' : 'moba-lobby', {
			options: { setup },
		})
	} else if (query.get('mode') === 'dodgeball') app.modes.start('dodgeball')
	// A fresh visit lands on the splash, where the mode is chosen.
	else app.modes.start('moba-front')
	app.run()
} catch (err) {
	reportBootError(err)
}
