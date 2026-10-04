import { tune } from './tune.js'
import { HEROES, heroDefinition } from './heroes.js'

// Front screens and direct entry use the same validated match setup.
export function parseMatchSetup(query, options = {}, warn = console.warn) {
	const read = (param, value, fallback, valid) => {
		if (value == null) return fallback
		if (valid(value)) return value
		warn(`MOBA: invalid ${param}=${JSON.stringify(value)}; using ${fallback}`)
		return fallback
	}
	const seed = options.seed ?? query.get('seed')
	return {
		...(options.tryMode ? { tryMode: parseTrySetup(query, options.tryMode, warn) } : {}),
		edgePan: [true, '1', 'true'].includes(
			read('edgePan', options.edgePan ?? query.get('edgePan'), tune.follow.edgePan, (v) =>
				[true, false, '1', '0', 'true', 'false'].includes(v),
			),
		),
		map: read('map', options.map ?? query.get('map'), 'lane', (v) => v === 'lane'),
		difficulty: read('bots', options.difficulty ?? query.get('bots'), 'easy', (v) =>
			['easy', 'normal', 'hard'].includes(v),
		),
		heroId: read(
			'hero',
			options.heroId ?? query.get('hero'),
			'fletcher',
			(v) => Object.hasOwn(HEROES, v) && heroDefinition(v).playable === true,
		),
		seed: Number(
			read(
				'seed',
				seed,
				tune.bots.seed,
				(v) =>
					(typeof v === 'number' || (typeof v === 'string' && /^\d+$/.test(v))) &&
					Number.isInteger(Number(v)) &&
					Number(v) >= 0 &&
					Number(v) <= tune.testing.seedMax,
			),
		),
	}
}

export function wantsDirectPlay(query, warn = console.warn) {
	if (!query.has('play')) return false
	if (['', '1', 'true'].includes(query.get('play'))) return true
	if (['0', 'false'].includes(query.get('play'))) return false
	warn(`MOBA: invalid play=${JSON.stringify(query.get('play'))}; using false`)
	return false
}

// Try Mode is separate from match selection: an ordinary setup keeps its old shape.
export function parseTrySetup(query, options = {}, warn = console.warn) {
	const read = (key, fallback, valid, convert = (v) => v) => {
		const value = options[key] ?? query.get(key)
		if (value == null) return fallback
		if (valid(value)) return convert(value)
		warn(`MOBA: invalid ${key}; using default`)
		return fallback
	}
	const bool = (key, fallback) =>
		read(
			key,
			fallback,
			(v) => [true, false, '1', '0', 'true', 'false'].includes(v),
			(v) => [true, '1', 'true'].includes(v),
		)
	const numeric = (v) =>
		(typeof v === 'number' || (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v))) &&
		Number.isFinite(Number(v))
	const playable = (id) => Object.hasOwn(HEROES, id) && heroDefinition(id).playable === true
	const rosterValue = options.tryRoster ?? query.get('tryRoster')
	let tryRoster
	if (rosterValue != null) {
		try {
			const roster = typeof rosterValue === 'string' ? JSON.parse(rosterValue) : rosterValue
			if (
				!Array.isArray(roster) ||
				roster.length >= tune.testing.rosterMax ||
				!roster.every(
					(s) => ['A', 'B'].includes(s.team) && playable(s.heroId) && typeof s.bot === 'boolean',
				)
			)
				throw new Error('Invalid roster')
			tryRoster = roster.map(({ team, heroId, bot }) => ({ team, heroId, bot }))
		} catch {
			warn('MOBA: invalid tryRoster; using default')
		}
	}
	return {
		noCooldowns: bool('noCooldowns', false),
		godMode: bool('godMode', false),
		waves: bool('waves', true),
		botsEnabled: bool('botsEnabled', true),
		paused: bool('paused', false),
		speed: read(
			'speed',
			tune.testing.speed,
			(v) => numeric(v) && Number(v) >= tune.testing.speedMin && Number(v) <= tune.testing.speedMax,
			Number,
		),
		level: read(
			'level',
			tune.hero.level,
			(v) =>
				numeric(v) &&
				Number.isInteger(Number(v)) &&
				Number(v) >= tune.hero.level &&
				Number(v) <= tune.levels.cap,
			Number,
		),
		allyHero: read('allyHero', 'fletcher', playable),
		enemyHero: read('enemyHero', 'fletcher', playable),
		allyBot: bool('allyBot', false),
		enemyBot: bool('enemyBot', false),
		...(tryRoster === undefined ? {} : { tryRoster }),
	}
}

export function matchLink(href, setup, botsOnly = false, training = setup.tryMode) {
	const url = new URL(href)
	url.search = ''
	url.hash = ''
	for (const [key, value] of Object.entries({
		mode: 'moba',
		play: '',
		map: setup.map,
		bots: setup.difficulty,
		hero: setup.heroId,
		seed: setup.seed,
		edgePan: String(setup.edgePan ?? tune.follow.edgePan),
		debug: '',
	}))
		url.searchParams.set(key, value)
	if (training) {
		for (const [key, value] of Object.entries(training))
			url.searchParams.set(key, key === 'tryRoster' ? JSON.stringify(value) : String(value))
	}
	if (botsOnly) url.searchParams.set('bots-only', '')
	return url.href
}
