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

export function matchLink(href, setup, botsOnly = false) {
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
		debug: '',
	}))
		url.searchParams.set(key, value)
	if (botsOnly) url.searchParams.set('bots-only', '')
	return url.href
}
