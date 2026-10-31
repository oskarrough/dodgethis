import { tune } from '../../tune.js'

// How hard a dungeon run is, as one number (`tune.dial`): each hero in the party counts one, bots
// included, and the difficulty picked in the lobby moves it by its spot. Wardens and pack guards
// read their health and damage off it; `tempo` and `mechanics` wait for the fights that will read
// them. Read live, so the debug panel's dial turns a fight already under way.
export function createDial(partySize, difficulty = 'normal') {
	const d = () => tune.dial
	const value = () => partySize + (d().spots[difficulty] ?? 0)
	const scale = (per) => Math.max(d().floor, 1 + per * (value() - d().at))
	return {
		get value() {
			return value()
		},
		hp: () => scale(d().hp),
		damage: () => scale(d().damage),
		tempo: () => scale(d().tempo),
		mechanics: () => d().mechanics * (value() - d().at),
	}
}
