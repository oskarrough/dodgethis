import { createBrowserApp, reportBootError } from './core/browser.js'
import dodgeball from './plugins/dodgeball/index.js'
import moba from './plugins/moba/index.js'
import { mobaFront } from './plugins/moba/front/index.js'
import online from './plugins/online/index.js'

// Composition owns the hub's cross-plugin destination; plugins never import each other.
try {
	const app = await createBrowserApp()
	app.use((scope) =>
		dodgeball(scope, {
			hubPortal: {
				label: 'MOBA',
				onSelect() {
					const url = new URL(location.href)
					url.searchParams.set('mode', 'moba')
					history.replaceState(null, '', url)
					scope.modes.start('moba-front')
				},
			},
		}),
	)
	app.use(moba)
	app.use(mobaFront)
	app.use(online)
	const query = new URLSearchParams(location.search)
	if (query.get('mode') === 'moba' && query.has('replay')) {
		const { mobaReplay, loadReplay } = await import('./plugins/moba/replay.js')
		app.use(mobaReplay)
		app.modes.start('moba-replay', { options: { replay: await loadReplay(query.get('replay')) } })
	} else app.modes.start(query.get('mode') === 'moba' ? 'moba-front' : 'dodgeball')
	app.run()
} catch (err) {
	reportBootError(err)
}
