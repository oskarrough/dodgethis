// The arena's shared truth. Court geometry, the collider, spawns, ammo scatter,
// landing clamps, dash limits and AI edge steering all read these numbers, so
// changing the court's size once moves every one of them together.
//
// DOM-free on purpose: tests and headless rounds import this without a canvas.
//
// The insets below are deliberately different from each other. They are separate
// gameplay policies, not one margin that got copied around:
//   landing — where a loosed shot may come to rest, so scarce ammo stays reachable
//   aiEdge  — where a brain stops steering outward, so bots don't walk into the void
//   aiKite  — where a circle-strafing bot flips its handedness instead of grinding
//   rim     — the painted warning band, which has no collision at all
// Walking off the edge stays possible for everyone. Only the AI is fenced.
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

// Zero the outward component of a movement vector at the boundary. Used by the
// AI so brains stop suiciding, and by the dash so a burst can't fling you off.
export function blockOutward(move, x, z, inset = 0) {
	const b = bounds(inset)
	if ((x >= b.x && move.x > 0) || (x <= -b.x && move.x < 0)) move.x = 0
	if ((z >= b.z && move.z > 0) || (z <= -b.z && move.z < 0)) move.z = 0
	return move
}

// Where a team's units line up at the start of a round. Team A stands at +z.
export function spawnPoint(team, index = 0, count = 1) {
	const z = team === 'A' ? ARENA.spawnZ : -ARENA.spawnZ
	const x = count > 1 ? (index - (count - 1) / 2) * ARENA.enemySpacing : 0
	return [x, 0, z]
}

// Deterministic scatter for ammo and visual fixtures. Pass a seed to get the
// same court twice; omit it and each round is fresh. Keeping decoration on its
// own generator means changing sparkles can never change a match.
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
