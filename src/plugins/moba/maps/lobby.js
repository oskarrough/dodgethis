import { tune } from '../tune.js'
import { overthrowLayout } from './overthrow.js'

export function lobbyLayout() {
	const court = overthrowLayout()
	return {
		name: 'Lobby',
		bounds: tune.lobby.bounds,
		walkingBounds: tune.lobby.bounds,
		fieldBounds: court.bounds, // Walking is bounded; casts retain the open shooting field.
		obstacles: court.boxes,
		boxes: [],
		pillars: [],
		spawns: { A: tune.lobby.marks[0], B: tune.lobby.marks[tune.lobby.capacity / 2] },
		spawnSpacing: tune.map.spawnSpacing,
		lanes: [],
		structures: [],
		dummyPosts: tune.lobby.dummyPosts,
	}
}

// Hand-imported by maps/index.js until the lobby gets its folder (docs/mods.md, step 7).
export const lobby = {
	kind: 'lobby',
	layout: lobbyLayout,
	pieces: ['dummies'],
	palette: () => ({}),
	debugTune: null,
	online: true,
}
