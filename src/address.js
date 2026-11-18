// The address bar follows the screen: one present-phase system writes the URL that reopens it.
// Splash is `/`, a lobby `/?mode=moba&map&hero&bots`, a match adds `play`, a room is `/CODE`, dodgeball `?mode=dodgeball`.
// Leaving the splash pushes an entry, so Back returns to it; every other change replaces the current one.
// `route(url)` is main.js's boot routing, rerun when Back or Forward lands on another screen.

// Dev and look switches outlive every screen; match switches only outlive lobby and match.
const KEEP = ['debug', 'skin']
const KEEP_IN_MATCH = ['seed', 'edgePan', 'bots-only', 'lobby']
// A dodgeball debug scenario (dodgeball/scenario.js) reads these on reload.
const KEEP_IN_DODGEBALL = [
	'teamA',
	'teamB',
	'arrows',
	'seed',
	'hp',
	'ai',
	'paused',
	'godmode',
	'infiniteAmmo',
]

export function addressFor({ mode, screen, setup, room }, from) {
	const url = new URL('/', from)
	const keep = (keys) => {
		for (const key of keys)
			if (from.searchParams.has(key)) url.searchParams.set(key, from.searchParams.get(key))
	}
	if (room) url.pathname = `/${room}`
	else if (mode === 'dodgeball') {
		url.searchParams.set('mode', 'dodgeball')
		keep(KEEP_IN_DODGEBALL)
	} else if ((mode === 'moba-lobby' || mode === 'moba') && setup) {
		url.searchParams.set('mode', 'moba')
		// A finished match has nothing to reopen; its URL is the lobby with the same choices.
		if (mode === 'moba' && screen !== 'result') url.searchParams.set('play', '')
		url.searchParams.set('map', setup.map)
		url.searchParams.set('hero', setup.heroId)
		url.searchParams.set('bots', setup.difficulty)
		keep(KEEP_IN_MATCH)
	}
	keep(KEEP)
	// Flags read bare: `?debug`, not `?debug=`.
	return url.href.replace(/=(?=&|$)/g, '')
}

export function followScreen(app, route) {
	let lastMode = null
	let backing = false
	// What the last address was built from; a frame that changes none of it builds nothing.
	let seenMode, seenScreen, seenRoom, seenMap, seenHero, seenBots, seenHref
	window.addEventListener('popstate', () => {
		backing = false
		route(new URL(location.href))
	})
	app.system('present', () => {
		const mode = app.modes.active
		// A replay is opened by its own link and never writes one.
		if (!mode || mode === 'moba-replay' || backing) return
		const game = app.debug.game
		const { screen, room } = game
		const setup = game.moba?.setup ?? game.portalParty?.setup
		if (
			mode === seenMode &&
			screen === seenScreen &&
			room === seenRoom &&
			setup?.map === seenMap &&
			setup?.heroId === seenHero &&
			setup?.difficulty === seenBots &&
			location.href === seenHref
		)
			return
		const href = addressFor({ mode, screen, setup, room }, new URL(location.href))
		const left = lastMode === 'moba-front' && mode !== 'moba-front'
		lastMode = mode
		if (href !== location.href) {
			if (left) history.pushState({ fromSplash: true }, '', href)
			else if (mode === 'moba-front' && history.state?.fromSplash) {
				// Back to the splash we pushed from: step back instead of stacking another `/`.
				backing = true
				history.back()
			} else history.replaceState(history.state, '', href)
		}
		seenMode = mode
		seenScreen = screen
		seenRoom = room
		seenMap = setup?.map
		seenHero = setup?.heroId
		seenBots = setup?.difficulty
		seenHref = location.href
	})
}
