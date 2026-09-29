import { createBrowserApp, reportBootError } from './core/browser.js'
import dodgeball from './plugins/dodgeball/index.js'
import moba from './plugins/moba/index.js'
import { mobaFront } from './plugins/moba/front/index.js'
import online from './plugins/online/index.js'

// Composition only: the core, its plugins, and the mode that boots. ?mode=moba boots moba until a hub can offer it.
try {
	const app = await createBrowserApp()
	app.use(dodgeball)
	app.use(moba)
	app.use(mobaFront)
	app.use(online)
	app.modes.start(
		new URLSearchParams(location.search).get('mode') === 'moba' ? 'moba-front' : 'dodgeball',
	)
	app.run()
} catch (err) {
	reportBootError(err)
}
