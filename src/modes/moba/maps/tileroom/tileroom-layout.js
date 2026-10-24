import { tune } from '../../tune.js'

// Each swatch brings a wall and a pillar, so its floor is judged beside cover and shadow.
export function tileroomLayout() {
	const s = tune.tileroom
	const bounds = { id: 'tileroom', halfX: s.halfX, halfZ: s.halfZ, thickness: 1 }
	const boxes = s.swatches.map((w) => ({
		kind: 'wall',
		x: w.x + s.wall.x,
		z: w.z + s.wall.z,
		halfX: s.wall.halfX,
		halfZ: s.wall.halfZ,
	}))
	const pillars = s.swatches.map((w) => ({
		x: w.x + s.pillar.x,
		z: w.z + s.pillar.z,
		r: s.pillar.r,
	}))
	return {
		name: 'Tile room',
		bounds,
		walkingBounds: bounds,
		fieldBounds: bounds,
		obstacles: [...pillars, ...boxes],
		boxes,
		pillars,
		spawns: { A: { x: 0, z: 0 }, B: { x: 0, z: 2 } },
		spawnSpacing: 1.5,
		lanes: [],
		structures: [],
		dummyPosts: [],
		posts: [],
	}
}
