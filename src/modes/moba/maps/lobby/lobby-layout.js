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
		obstacles: [
			...lobbyRimCover(),
			{ kind: 'lobby-bell', x: tune.lobby.bell.x, z: tune.lobby.bell.z, r: tune.lobby.bell.cover },
		],
		boxes: [],
		pillars: [],
		spawns: { A: tune.lobby.marks[0], B: tune.lobby.marks[tune.lobby.capacity / 2] },
		spawnSpacing: tune.map.spawnSpacing,
		lanes: [],
		structures: [],
		dummyPosts: tune.lobby.dummyPosts,
	}
}

// The acequia's frame: positions on the paving's rings, whose z is squashed like the floor's.
const squash = () =>
	tune.lobby.floor.halfZ / Math.max(tune.lobby.floor.halfX, tune.lobby.floor.halfZ)
const DEG = Math.PI / 180

// Where (x, z) sits against the channel: `ring` metres off its middle line (negative toward the
// centre), `angle` in degrees, `wet` when it is in the water.
export function channelAt(x, z) {
	const c = tune.lobby.channel
	const rz = z / squash()
	const angle = Math.atan2(rz, x) / DEG
	const ring = Math.hypot(x, rz) - c.r
	return { ring, angle, wet: Math.abs(ring) < c.half && angle > c.from && angle < c.to }
}

// The point on the channel's middle line at `angle` degrees, clamped to its span.
export function channelPoint(angle) {
	const c = tune.lobby.channel
	const a = Math.max(c.from, Math.min(c.to, angle)) * DEG
	return { x: Math.cos(a) * c.r, z: Math.sin(a) * c.r * squash() }
}
