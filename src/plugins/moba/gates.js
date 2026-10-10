import { tune } from './tune.js'

// Flagfall's gates: a low stone wall across each lane in front of each fort. Its own team walks
// and shoots through; enemies stop at it, their minions and bots siege it as the lane's next
// structure, and their shots hit it. When it falls it leaves rubble and the lane is open.

// Layout hook: a gate per team per lane at ±x, and each fort waits for its gate.
export function addGates(structures, lanes, x) {
	const gates = ['A', 'B'].flatMap((team) =>
		lanes.map((lane) => ({
			id: `gate-${team}-${lane.id}`,
			team,
			lane: lane.id,
			kind: 'gate',
			after: [],
			obstacle: false, // never a shared collider: the wall below is one-sided
			x: (team === 'A' ? -1 : 1) * x,
			z: lane.path[0].z,
		})),
	)
	const gated = structures.map((s) =>
		s.kind === 'fort' ? { ...s, after: [...s.after, `gate-${s.team}-${s.lane}`] } : s,
	)
	return [...gated, ...gates]
}

// Each tick, after movement: an enemy body inside a standing gate goes back out its own side.
export function holdGates(structures, units) {
	for (const gate of structures) {
		if (gate.kind !== 'gate' || gate.dead) continue
		const g = gate.body.position
		const R = gate.body.radius
		const away = gate.team === 'A' ? 1 : -1 // the side enemies come from
		for (const u of units) {
			if (u.dead || u.team === gate.team) continue
			const p = u.body.position
			const r = u.body.radius
			const dz = p.z - g.z
			if (Math.abs(dz) > R + r) continue
			const half = Math.max(tune.gate.depth / 2 + r, Math.sqrt((R + r) ** 2 - dz * dz))
			if (Math.abs(p.x - g.x) >= half) continue
			const x = g.x + away * half
			if (u.body.place) u.body.place(x, p.y, p.z)
			else p.x = x
		}
	}
}
