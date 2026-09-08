// DOM-free shared arena dimensions drive geometry, physics, spawns, ammo, and movement; distinct landing, AI-edge, AI-kite, and visual-rim insets preserve separate policies while allowing falls.
export const ARENA = {
	width: 11,
	depth: 24,
	thickness: 1,
	top: 0, // Y of the walking surface
	killY: -5, // fall below this and you're out
	spawnZ: 8, // |z| where the two teams line up
	enemySpacing: 3, // lateral gap between enemies on the back line
	ammoInsetX: 2, // ammo scatters inside these, so nothing spawns on the rim
	ammoInsetZ: 6,
	inset: {
		landing: 0.5,
		aiEdge: 0.9,
		aiKite: 1.6,
		rim: 0.35,
	},
}

// Half-extents of the walkable area, pulled in by `inset` on every side.
export function bounds(inset = 0) {
	return { x: ARENA.width / 2 - inset, z: ARENA.depth / 2 - inset }
}

export function clamp(x, z, inset = 0) {
	const b = bounds(inset)
	return {
		x: Math.max(-b.x, Math.min(b.x, x)),
		z: Math.max(-b.z, Math.min(b.z, z)),
	}
}

export function onCourt(x, z, inset = 0) {
	const b = bounds(inset)
	return Math.abs(x) <= b.x && Math.abs(z) <= b.z
}

// Zero outward movement at a boundary for AI steering and edge-safe dashes.
export function blockOutward(move, x, z, inset = 0) {
	const b = bounds(inset)
	if ((x >= b.x && move.x > 0) || (x <= -b.x && move.x < 0)) move.x = 0
	if ((z >= b.z && move.z > 0) || (z <= -b.z && move.z < 0)) move.z = 0
	return move
}

// Where a team's units line up at the start of a round. Team A stands at +z.
export function spawnPoint(team, index = 0, count = 1) {
	const columns = Math.min(count, 7)
	const spacing = Math.min(ARENA.enemySpacing, (ARENA.width - 2 * ARENA.inset.aiEdge) / columns)
	const x = ((index % columns) - (columns - 1) / 2) * spacing
	const z = ARENA.spawnZ - Math.floor(index / columns) * 1.4
	return [x, 0, team === 'A' ? z : -z]
}

// Seeded gameplay scatter repeats independently of visual randomness; an omitted seed stays fresh.
export function makeRng(seed) {
	if (seed === undefined) return Math.random
	let s = seed >>> 0 || 1
	return function rng() {
		s ^= s << 13
		s ^= s >>> 17
		s ^= s << 5
		s >>>= 0
		return s / 4294967296
	}
}

// A scattered ammo position inside the safe region.
export function ammoPoint(rng = Math.random) {
	return {
		x: (rng() - 0.5) * (ARENA.width - ARENA.ammoInsetX),
		z: (rng() - 0.5) * (ARENA.depth - ARENA.ammoInsetZ),
	}
}

// Search the team's half using live physics positions so same-frame additions cannot overlap.
export function freeSpawnPoint(team, units, radius) {
	const separation = radius * 2 + 0.1
	const b = bounds(Math.max(ARENA.inset.aiEdge, radius + 0.1))
	const columns = Math.floor((2 * b.x) / separation)
	for (let z = Math.min(ARENA.spawnZ, b.z); z >= 1; z -= separation) {
		for (let i = 0; i <= columns; i++) {
			const x = (i - columns / 2) * separation
			const pz = team === 'A' ? z : -z
			if (
				units.every((u) => {
					if (!u.alive) return true
					const p = u.body.translation()
					return Math.hypot(x - p.x, pz - p.z) >= separation
				})
			)
				return [x, 0, pz]
		}
	}
	return null
}
