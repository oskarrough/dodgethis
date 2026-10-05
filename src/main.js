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
	// Composition releases MOBA resources after the old run aborts, before another mode boots.
	const use = (plugin) =>
		app.use((scope) => {
			const define = scope.modes.define
			scope.modes.define = (id, mode) =>
				define(id, {
					...mode,
					start(run, args) {
						if (id !== 'moba' && id !== 'moba-front') map.dispose()
						return mode.start(run, args)
					},
				})
			return plugin(scope)
		})
	use((scope) =>
		dodgeball(scope, {
			hubPortal: {
				label: 'MOBA',
				onSelect() {
					const url = new URL(location.href)
					url.searchParams.set('mode', 'moba')
					history.replaceState(null, '', url)
					scope.modes.start('moba-front', { options: { screen: 'difficulty' } })
				},
			},
			hubExit: { onSelect: () => scope.modes.start('moba-front') },
		}),
	)
	use((scope) => moba(scope, map))
	use((scope) => mobaFront(scope, map))
	use(online)
	// Registered last so app teardown aborts every run before freeing the shared world.
	app.use(() => () => map.dispose())
	const query = new URLSearchParams(location.search)
	if (query.get('mode') === 'moba' && query.has('replay')) {
		const { mobaReplay, loadReplay } = await import('./plugins/moba/replay.js')
		use(mobaReplay)
		app.modes.start('moba-replay', { options: { replay: await loadReplay(query.get('replay')) } })
	} else if (query.get('mode') === 'moba') {
		const setup = parseMatchSetup(query)
		app.modes.start(wantsDirectPlay(query) ? 'moba' : 'moba-front', {
			options: { setup, screen: 'difficulty' },
		})
	} else if (query.get('mode') === 'dodgeball') app.modes.start('dodgeball')
	// A fresh visit lands on the splash, where the mode is chosen.
	else app.modes.start('moba-front')
	app.run()
} catch (err) {
	reportBootError(err)
}
