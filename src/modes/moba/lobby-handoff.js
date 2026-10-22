import { HEROES } from './heroes.js'
import { onlineMaps, maps } from './maps/all-maps.js'
import { tune } from './tune.js'

// Both lobby screens accept exactly the same validated transport handoff.
export function validLobbyHandoff(next, { setup, sim, readySeats }) {
	const isParty = !!maps[setup.map].party
	const roster = next?.roster
	const matchSetup = next?.setup
	return !(
		!Array.isArray(roster) ||
		(isParty
			? roster.length < 1 || roster.length > readySeats.seats.length
			: roster.length !== readySeats.seats.length) ||
		new Set(roster.map((p) => p?.id)).size !== roster.length ||
		!roster.every(
			(p) =>
				typeof p?.id === 'string' &&
				['A', 'B'].includes(p.team) &&
				HEROES[p.heroId]?.playable &&
				['human', 'bot'].includes(p.controller),
		) ||
		roster.filter((p) => p.controller === 'human').length !== sim.heroes.length ||
		!sim.heroes.every((h) => roster.some((p) => p.id === h.id && p.controller === 'human')) ||
		(isParty
			? !roster.every((p) => p.team === 'A')
			: !['A', 'B'].every(
					(team) =>
						roster.filter((p) => p.team === team).length ===
						readySeats.seats.filter((s) => s.team === team).length,
				)) ||
		(isParty && matchSetup?.map !== setup.map) ||
		!onlineMaps.includes(matchSetup?.map) ||
		!['easy', 'normal', 'hard'].includes(matchSetup.difficulty) ||
		!Number.isSafeInteger(matchSetup.seed) ||
		matchSetup.seed < 0 ||
		matchSetup.seed > tune.testing.seedMax
	)
}
