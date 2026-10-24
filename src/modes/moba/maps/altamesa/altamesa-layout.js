import { tune } from '../../tune.js'

export function altamesaLayout() {
	const s = tune.altamesa
	const bounds = {
		id: 'altamesa',
		halfX: s.halfX,
		halfZ: s.halfZ,
		thickness: s.thickness,
	}
	const boxes = s.boxes.map((b) => ({ ...b }))
	const pillars = s.pillars.map((p) => ({ ...p }))
	return {
		name: 'Altamesa',
		bounds,
		walkingBounds: bounds,
		fieldBounds: bounds,
		obstacles: [...pillars, ...boxes],
		boxes,
		pillars,
		spawns: { A: { ...s.entrance }, B: { x: s.entrance.x, z: s.entrance.z + 8 } },
		spawnSpacing: s.spawnSpacing,
		lanes: [],
		structures: [],
		dummyPosts: [],
		encounters: s.encounters.map((e) => ({ ...e })),
		wings: [...s.wings],
		waystones: s.waystones.map((w) => ({ ...w })),
		packs: s.packs.map((p) => ({ ...p })),
	}
}
