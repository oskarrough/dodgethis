import { tune } from './tune.js'
import { DEFAULT_MAP, playableMaps, maps } from './maps/all-maps.js'
import { DEFAULT_HERO, HEROES, heroDefinition } from './heroes.js'
import { botRandom } from './bots.js'

// Maps that changed their id, so old links still land.
const renamedMaps = { hollowMesa: 'altamesa' }

// Heroes that changed their id, so old links (?hero=fletcher) still land.
const renamedHeroes = {
	fletcher: 'ibis',
	mitts: 'kappa',
	pong: 'carambola',
	coach: 'mandador',
	hook: 'lasso',
	brew: 'oolong',
	wata: 'undine',
	mender: 'salvia',
}
const heroParam = (id) => renamedHeroes[id] ?? id

// Front screens and direct entry use the same validated match setup.
export function parseMatchSetup(query, options = {}, warn = console.warn) {
	const read = (param, value, fallback, valid) => {
		if (value == null) return fallback
		if (valid(value)) return value
		warn(`MOBA: invalid ${param}=${JSON.stringify(value)}; using ${fallback}`)
		return fallback
	}
	const seed = options.seed ?? query.get('seed')
	const mapId = options.map ?? query.get('map')
	const mapParam = renamedMaps[mapId] ?? mapId
	const map = read('map', mapParam, DEFAULT_MAP, (v) => playableMaps.includes(v))
	const lights = tune[map]?.lights ?? {}
	const party = !!maps[mapParam]?.party
	const playable = (id) =>
		Object.hasOwn(HEROES, id) &&
		(options.shared && !party ? heroDefinition(id).listed : heroDefinition(id).playable) === true
	const picks =
		options.picks &&
		Object.fromEntries(
			Object.entries(options.picks).map(([id, pick]) => [
				id,
				{
					heroId: read('hero', heroParam(pick.heroId), undefined, playable),
					...(pick.team == null
						? {}
						: {
								team: read('team', pick.team, 'A', (v) => ['A', 'B'].includes(v)),
							}),
				},
			]),
		)
	return {
		...(picks ? { picks } : {}),
		...(options.tryMode ? { tryMode: parseTrySetup(query, options.tryMode, warn) } : {}),
		edgePan: [true, '1', 'true'].includes(
			read('edgePan', options.edgePan ?? query.get('edgePan'), tune.follow.edgePan, (v) =>
				[true, false, '1', '0', 'true', 'false'].includes(v),
			),
		),
		map,
		light: read(
			'light',
			options.light ?? query.get('light'),
			'random',
			(v) => v === 'random' || Object.hasOwn(lights, v),
		),
		difficulty: read('bots', options.difficulty ?? query.get('bots'), 'easy', (v) =>
			['easy', 'normal', 'hard'].includes(v),
		),
		heroId: read('hero', heroParam(options.heroId ?? query.get('hero')), DEFAULT_HERO, playable),
		// Re-parsing a parsed setup keeps whether a seed was asked for, not just its value.
		seeded: options.seeded ?? seed != null,
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

const lightDefaults = new Map()

// morning/dusk, night/moonrise, dawn/noon and sunset/blueHour are map-owned patches.
// Restore the original sections first: a new match must not inherit yesterday's dusk.
export function applyMatchLight({ map, light, seed }) {
	const settings = tune[map]
	const presets = settings?.lights
	const names = Object.keys(presets ?? {})
	if (!names.length) return 'random'
	const name = Object.hasOwn(presets, light)
		? light
		: names[Math.floor(botRandom(seed, `${map}:light`)() * names.length)]
	if (!lightDefaults.has(map)) {
		const sections = new Set(Object.values(presets).flatMap(Object.keys))
		lightDefaults.set(
			map,
			Object.fromEntries([...sections].map((key) => [key, structuredClone(settings[key])])),
		)
	}
	// Preserve nested object identities: the live colour and shadow bindings retain them.
	function merge(target, patch) {
		for (const [key, value] of Object.entries(patch)) {
			if (value && typeof value === 'object' && !Array.isArray(value)) merge(target[key], value)
			else target[key] = structuredClone(value)
		}
	}
	merge(settings, lightDefaults.get(map))
	merge(settings, presets[name])
	return name
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
		allyHero: read('allyHero', DEFAULT_HERO, playable),
		enemyHero: read('enemyHero', DEFAULT_HERO, playable),
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
		light: setup.light ?? 'random',
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
