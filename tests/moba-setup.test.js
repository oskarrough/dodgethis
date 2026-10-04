import { expect, test } from 'bun:test'
import { parseMatchSetup, wantsDirectPlay, matchLink } from '../src/plugins/moba/setup.js'
import { tune } from '../src/plugins/moba/tune.js'
import { HEROES, heroDefinition } from '../src/plugins/moba/heroes.js'

const defaults = {
	map: 'lane',
	difficulty: 'easy',
	heroId: 'fletcher',
	seed: tune.bots.seed,
	edgePan: true,
}
test('missing params use the front-screen defaults without warnings', () => {
	const warnings = []
	expect(parseMatchSetup(new URLSearchParams(), {}, (w) => warnings.push(w))).toEqual(defaults)
	expect(wantsDirectPlay(new URLSearchParams())).toBe(false)
	expect(warnings).toEqual([])
})
test.each([
	['map', 'lane', 'map', 'lane'],
	['bots', 'easy', 'difficulty', 'easy'],
	['bots', 'normal', 'difficulty', 'normal'],
	['bots', 'hard', 'difficulty', 'hard'],
	['hero', 'fletcher', 'heroId', 'fletcher'],
	['seed', '0', 'seed', 0],
	['seed', '27', 'seed', 27],
	['seed', '4294967295', 'seed', 4294967295],
])('%s=%s parses', (param, value, field, expected) => {
	const warnings = []
	expect(
		parseMatchSetup(new URLSearchParams({ [param]: value }), {}, (w) => warnings.push(w))[field],
	).toBe(expected)
	expect(warnings).toEqual([])
})
test.each([
	['map', 'arena', 'map'],
	['map', '', 'map'],
	['bots', 'HARD', 'difficulty'],
	['bots', '', 'difficulty'],
	['hero', 'carom', 'heroId'],
	['hero', '', 'heroId'],
	...['', '-1', '1.5', 'NaN', 'Infinity', '1e3', '0x10', ' 2 ', '4294967296'].map((v) => [
		'seed',
		v,
		'seed',
	]),
])('%s=%s warns and falls back', (param, value, field) => {
	const warnings = []
	expect(
		parseMatchSetup(new URLSearchParams({ [param]: value }), {}, (w) => warnings.push(w))[field],
	).toBe(defaults[field])
	expect(warnings.length).toBe(1)
	expect(warnings[0]).toContain(param)
})
test.each([
	['', true],
	['1', true],
	['true', true],
	['0', false],
	['false', false],
	['yes', false],
	['TRUE', false],
])('play=%s parses or warns', (value, expected) => {
	const warnings = []
	expect(wantsDirectPlay(new URLSearchParams({ play: value }), (w) => warnings.push(w))).toBe(
		expected,
	)
	expect(warnings.length).toBe(['yes', 'TRUE'].includes(value) ? 1 : 0)
})
test('front-screen selections override URL values and copy links round-trip the running setup', () => {
	const setup = parseMatchSetup(new URLSearchParams('bots=hard&seed=3'), {
		difficulty: 'normal',
		seed: 0,
	})
	const url = new URL(matchLink('https://example.test/?replay=old&bots=hard#old', setup))
	expect(url.searchParams.get('mode')).toBe('moba')
	expect(wantsDirectPlay(url.searchParams)).toBe(true)
	expect(url.searchParams.has('debug')).toBe(true)
	expect(url.searchParams.has('replay')).toBe(false)
	expect(url.searchParams.has('bots-only')).toBe(false)
	expect(url.hash).toBe('')
	expect(parseMatchSetup(url.searchParams)).toEqual(setup)
	expect(new URL(matchLink(url.href, setup, true)).searchParams.has('bots-only')).toBe(true)
})

test('hero links accept exactly the playable definitions, including newly completed kits', () => {
	for (const id of [...Object.keys(HEROES), 'missing']) {
		const warnings = []
		const playable = Object.hasOwn(HEROES, id) && heroDefinition(id).playable
		const setup = parseMatchSetup(new URLSearchParams({ hero: id }), {}, (w) => warnings.push(w))
		expect(setup.heroId).toBe(playable ? id : 'fletcher')
		expect(warnings.length).toBe(playable ? 0 : 1)
	}
})

test.each([NaN, Infinity, -1, 1.5, 4294967296, {}, [2], true].map((seed) => [seed]))(
	'invalid option seed %s falls back',
	(seed) => {
		const warnings = []
		expect(parseMatchSetup(new URLSearchParams(), { seed }, (w) => warnings.push(w)).seed).toBe(
			defaults.seed,
		)
		expect(warnings.length).toBe(1)
	},
)
