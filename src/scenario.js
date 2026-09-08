// Serializable setup, shared by URLs, the console and the headless benchmark.
// A seed repeats gameplay decisions at fixed ticks, not browser input or FX.
export const PRESETS = {
	duel: { teamA: 1, teamB: 1 },
	'20v20': { teamA: 20, teamB: 20 },
	crowd: { teamA: 20, teamB: 20, arrows: 40 },
	hub: { phase: 'menu' },
	roundOver: { phase: 'roundOver' },
	matchOver: { phase: 'matchOver' },
}

export function scenario(options = {}) {
	const out = {
		teamA: 1,
		teamB: 3,
		arrows: 7,
		seed: 42,
		ai: true,
		paused: false,
		godmode: false,
		infiniteAmmo: false,
		phase: 'playing',
		winner: 'A',
		...options,
	}
	for (const [key, min, max] of [
		['teamA', 1, 40],
		['teamB', 1, 40],
		['arrows', 1, 200],
		['seed', 0, 4294967295],
	]) {
		if (!Number.isInteger(out[key]) || out[key] < min || out[key] > max)
			throw new Error(`${key} must be an integer from ${min} to ${max}`)
	}
	for (const key of ['ai', 'paused', 'godmode', 'infiniteAmmo']) {
		if (typeof out[key] !== 'boolean') throw new Error(`${key} must be a boolean`)
	}
	if (!['playing', 'menu', 'roundOver', 'matchOver'].includes(out.phase))
		throw new Error('Unknown phase')
	if (!['A', 'B'].includes(out.winner)) throw new Error('Unknown winner')
	return out
}

export function scenarioFromURL(search) {
	const params = new URLSearchParams(search)
	if (!params.has('debug')) return null
	const name = params.get('debug')
	if (name !== '1' && !PRESETS[name]) throw new Error(`Unknown debug preset: ${name}`)
	const options = { ...PRESETS[name] }
	for (const key of ['teamA', 'teamB', 'arrows', 'seed'])
		if (params.has(key)) options[key] = Number(params.get(key))
	for (const key of ['ai', 'paused', 'godmode', 'infiniteAmmo']) {
		if (!params.has(key)) continue
		const value = params.get(key)
		if (!['0', '1'].includes(value)) throw new Error(`${key} must be 0 or 1`)
		options[key] = value === '1'
	}
	for (const key of ['phase', 'winner']) if (params.has(key)) options[key] = params.get(key)
	return scenario(options)
}
