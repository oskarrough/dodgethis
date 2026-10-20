import { tune } from '../../tune.js'

export function dungeonLayout() {
	const s = tune.dungeon
	const bounds = { id: 'dungeon', halfX: s.radius, halfZ: s.radius, radius: s.radius }
	return {
		name: 'Dungeon',
		bounds,
		walkingBounds: bounds,
		fieldBounds: bounds,
		obstacles: [],
		boxes: [],
		pillars: [],
		spawns: { A: { x: s.entrance, z: 0 }, B: { x: -s.entrance, z: 0 }, boss: { x: 0, z: 0 } },
		spawnSpacing: s.spawnSpacing,
		lanes: [],
		structures: [],
		dummyPosts: [],
	}
}
