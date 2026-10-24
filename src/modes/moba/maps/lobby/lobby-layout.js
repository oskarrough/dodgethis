import { tune } from '../../tune.js'

// Overlapping round cover follows the glazed ellipse. Its inner surface is the lip;
// the same descriptors contain bodies and supply shots and held previews with cushion normals.
function lobbyRimCover() {
	const s = tune.lobby.floor
	return Array.from({ length: s.segments }, (_, i) => {
		const a = (i / s.segments) * Math.PI * 2
		const nx = Math.cos(a) / s.halfX,
			nz = Math.sin(a) / s.halfZ,
			d = Math.hypot(nx, nz)
		return {
			kind: 'lobby-rim',
			x: Math.cos(a) * s.halfX + (nx / d) * s.rim.width,
			z: Math.sin(a) * s.halfZ + (nz / d) * s.rim.width,
			r: s.rim.width,
		}
	})
}

export function lobbyLayout() {
	const s = tune.lobby.floor
	return {
		name: 'Lobby',
		bounds: tune.lobby.bounds,
		walkingBounds: tune.lobby.bounds,
		fieldBounds: { halfX: s.halfX + s.rim.width, halfZ: s.halfZ + s.rim.width },
		obstacles: lobbyRimCover(),
		boxes: [],
		pillars: [],
		spawns: { A: tune.lobby.marks[0], B: tune.lobby.marks[tune.lobby.capacity / 2] },
		spawnSpacing: tune.map.spawnSpacing,
		lanes: [],
		structures: [],
		dummyPosts: tune.lobby.dummyPosts,
	}
}
