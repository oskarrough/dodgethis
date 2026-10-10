import { tune } from './tune.js'

// Flagfall's gates, two kinds on one mechanic. A gatehouse is a low stone tower across each lane in
// front of each fort; a laser gate is an energy wall between two posts across each lane between the
// fort and the core. Their own team walks and shoots through; enemies stop at them, their minions
// and bots siege them as the lane's next structure, and their shots hit them. A fallen gatehouse
// leaves rubble, a fallen laser gate two stubs, and the lane is open.
export const GATES = new Set(['gatehouse', 'laser'])

// Layout hook: per team per lane a front gate (`frontGate`, a gatehouse unless the map says laser) at ±gatehouseX that the fort waits for, and a laser
// gate at ±laserX that waits for the fort; the core waits for any laser gate instead of any fort.
export function addGates(structures, lanes, { gatehouseX, laserX, frontGate = 'gatehouse' }) {
	const gate = (kind, team, lane, x, after, slot = kind) => ({
		id: `${slot}-${team}-${lane.id}`,
		team,
		lane: lane.id,
		kind,
		after,
		obstacle: false, // never a shared collider: the wall below is one-sided
		x: (team === 'A' ? -1 : 1) * x,
		z: lane.path[0].z,
	})
	const gates = ['A', 'B'].flatMap((team) =>
		lanes.flatMap((lane) => [
			gate(frontGate, team, lane, gatehouseX, [], 'front'),
			gate('laser', team, lane, laserX, [`fort-${team}-${lane.id}`]),
		]),
	)
	const gated = structures.map((s) => {
		if (s.kind === 'fort') return { ...s, after: [...s.after, `front-${s.team}-${s.lane}`] }
		if (s.kind === 'core')
			return { ...s, after: { ...s.after, any: lanes.map((l) => `laser-${s.team}-${l.id}`) } }
		return s
	})
	return [...gated, ...gates]
}

// Each tick, after movement: an enemy body inside a standing gate goes back out its own side.
export function holdGates(structures, units) {
	for (const gate of structures) {
		if (!GATES.has(gate.kind) || gate.dead) continue
		const g = gate.body.position
		const R = gate.body.radius
		const away = gate.team === 'A' ? 1 : -1 // the side enemies come from
		for (const u of units) {
			if (u.dead || u.team === gate.team) continue
			const p = u.body.position
			const r = u.body.radius
			const dz = p.z - g.z
			if (Math.abs(dz) > R + r) continue
			const half = Math.max(tune[gate.kind].depth / 2 + r, Math.sqrt((R + r) ** 2 - dz * dz))
			if (Math.abs(p.x - g.x) >= half) continue
			const x = g.x + away * half
			if (u.body.place) u.body.place(x, p.y, p.z)
			else p.x = x
		}
	}
}

// What players read for a structure kind: the laser kind is a "laser gate".
export const structureName = (kind) => (kind === 'laser' ? 'laser gate' : kind)
