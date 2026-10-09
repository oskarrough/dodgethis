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
