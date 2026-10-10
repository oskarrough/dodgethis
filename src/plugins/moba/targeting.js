import { tune, profile } from './tune.js'
import { clampMap } from './obstacles.js'
import { dirOf } from './sim-kit.js'

const TAU = Math.PI * 2

// Read-only queries over the sim's live units: what a click, an attack-move or the pad's stick lands on.
export function createTargeting({ heroes, dummies, lane, ball, field }) {
	// Everyone who can be shot, targeted or picked, as plain circles.
	const units = () => [
		...heroes.filter((h) => !h.dead).map((h) => ({ id: h.id, team: h.team, unit: h, hero: true })),
		...dummies.filter((d) => !d.dead).map((d) => ({ id: d.id, team: d.team, unit: d, hero: true })),
		...(lane
			? [...lane.minions, ...lane.structures]
					.filter((u) => !u.dead)
					.map((u) => ({ id: u.id, team: u.team, unit: u, hero: false }))
			: []),
	]
	const enemiesOf = (team) =>
		units()
			.filter((u) => u.team !== team)
			.map((u) => ({
				...u,
				x: u.unit.body.position.x,
				z: u.unit.body.position.z,
				radius: u.unit.body.radius,
			}))
	const find = (id) =>
		heroes.find((h) => h.id === id && !h.dead) ??
		dummies.find((d) => d.id === id && !d.dead) ??
		lane?.find(id)

	// The enemy an order point lands on: the unit's silhouette on the ground, its axis projected along the view, so a click on a torso counts.
	function pick(team, p) {
		const lean = tune.follow.back / tune.follow.height
		const tall = 2 * (profile.halfHeight + profile.radius)
		let best = null
		let bestD = Infinity
		for (const e of enemiesOf(team)) {
			if (lane && !lane.vulnerable(e.unit)) continue
			const sz = e.z - tall * lean
			const s = Math.max(0, Math.min(1, (e.z - p.z) / (e.z - sz || 1)))
			const d = Math.hypot(p.x - e.x, p.z - (e.z + (sz - e.z) * s)) - e.radius
			if (
				d <= tune.orders.pick &&
				(!best || (e.hero && !best.hero) || (e.hero === best.hero && d < bestD))
			) {
				best = e
				bestD = d
			}
		}
		return best
	}

	// LoL-style attack-move: the vulnerable enemy nearest the click (edge to point), within reach of it. Ties go to the lower id.
	function nearestToClick(team, p) {
		let best = null
		let bestD = Infinity
		for (const e of enemiesOf(team)) {
			if (lane && !lane.vulnerable(e.unit)) continue
			const d = Math.hypot(p.x - e.x, p.z - e.z) - e.radius
			if (d > tune.orders.attackMovePick) continue
			if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && String(e.id) < String(best.id))) {
				best = e
				bestD = d
			}
		}
		return best
	}

	// The pad's right stick for hero `id` (docs/moba-plan.md, "Controls"): range × remap, a 10° assist toward enemy heroes on Q,
	// and with the stick at rest the nearest enemy hero in range, then the facing.
	function stickAim(id, dir, magnitude, slot) {
		const h = heroes.find((x) => x.id === id)
		if (!h) return null
		const p = h.body.position
		const ability = h.definition.abilities[slot ?? 'slot1']
		const range = ball?.carrying(h)
			? tune.ball.range
			: (ability?.stats.range ?? h.definition.basic?.range ?? 0)
		const a = tune.stickAim
		if (!dir) {
			let best = null
			let bestD = range
			for (const e of enemiesOf(h.team).filter((e) => e.hero)) {
				const d = Math.hypot(e.x - p.x, e.z - p.z)
				if (d <= bestD) {
					best = e
					bestD = d
				}
			}
			if (best) return { x: best.x, z: best.z }
			const f = dirOf(h.yaw)
			return clampMap({ x: p.x + f.x * range, z: p.z + f.z * range }, 0, field)
		}
		let angle = Math.atan2(dir.x, dir.z)
		if (ability?.aimAssist) {
			let bend = null
			for (const e of enemiesOf(h.team).filter((e) => e.hero)) {
				const d = Math.hypot(e.x - p.x, e.z - p.z)
				if (d > range + e.radius) continue
				const gap =
					((((Math.atan2(e.x - p.x, e.z - p.z) - angle) % TAU) + TAU * 1.5) % TAU) - Math.PI
				if (
					Math.abs(gap) <= (a.assistAngle * Math.PI) / 180 &&
					(bend === null || Math.abs(gap) < Math.abs(bend))
				)
					bend = gap
			}
			if (bend !== null) angle += bend * a.assistBend
		}
		const u = Math.max(0, Math.min(1, (magnitude - a.inMin) / Math.max(1e-6, a.inMax - a.inMin)))
		const reach = range * (a.outMin + (1 - a.outMin) * u)
		return clampMap(
			{ x: p.x + Math.sin(angle) * reach, z: p.z + Math.cos(angle) * reach },
			0,
			field,
		)
	}

	return { enemiesOf, find, pick, nearestToClick, stickAim }
}
