import { expect, test } from 'bun:test'
import { scenario, scenarioFromURL } from '../src/scenario.js'
import { createPerformanceMonitor } from '../src/performance.js'

test('a shareable URL names exact rosters, seed, ammo and controls', () => {
	expect(scenarioFromURL('')).toBeNull()
	expect(scenarioFromURL('?debug')).toBeNull()
	expect(scenarioFromURL('?debug=20v20&seed=17&arrows=40&paused=1&ai=0')).toMatchObject({
		teamA: 20,
		teamB: 20,
		seed: 17,
		arrows: 40,
		paused: true,
		ai: false,
	})
	expect(scenarioFromURL('?debug=matchOver&winner=B').phase).toBe('matchOver')
	for (const url of [
		'?debug=bad',
		'?debug=1&teamA=0',
		'?debug=1&teamB=20.5',
		'?debug=1&arrows=Infinity',
		'?debug=1&paused=false',
		'?debug=1&seed=-1',
	])
		expect(() => scenarioFromURL(url)).toThrow()
	expect(() => scenario({ teamB: 10000 })).toThrow()
})

test('performance history stays bounded, measures raw intervals and resets', () => {
	const perf = createPerformanceMonitor(3)
	for (const frame of [1000, 5, 6, 10])
		perf.record({ frame, simulation: 1, presentation: 0.5, render: 2, cpu: 4 })
	expect(perf.report()).toMatchObject({ samples: 3, ms: { frame: { mean: 7, p95: 10, max: 10 } } })
	perf.reset()
	expect(perf.report()).toMatchObject({ samples: 0, fps: null })
})
