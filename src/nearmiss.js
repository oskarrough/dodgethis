import { tune } from './tune.js'

// Tracks each flying arrow's closest pass to every live opposing unit and presents one `nearMiss` impact when the pass recedes or the arrow stops flying; the hit itself never counts.

const ABOVE_LIMIT = 3 // ignore arrows flying this far above a unit's center (m)
const HIT_SLACK = 0.1 // grounded-at-contact tolerance on top of the two collider radii (m)
const PAIR_STRIDE = 4096 // arrow id * stride + unit id → one Map key per pair

function contactDistance(arrow) {
	const ammo = arrow.kind === 'bowl' ? tune.weapons.bowlRadius : 0.06
	return tune.player.radius + ammo + HIT_SLACK
}

export function createNearMissTracker({ radius = tune.arrow.nearMiss } = {}) {
	const pending = new Map() // pair key → entry (reused from `pool`)
	const pool = []

	function take(arrow, unit) {
		const e = pool.pop() || {
			arrow: null,
			unit: null,
			min: 0,
			last: 0,
			snapshot: null,
			done: false,
		}
		e.arrow = arrow
		e.unit = unit
		e.min = Infinity
		e.last = Infinity
		e.snapshot = null
		e.done = false // presented already; the pair stays parked until the arrow leaves the radius
		return e
	}

	function drop(key, e) {
		pending.delete(key)
		e.arrow = null
		e.unit = null
		e.snapshot = null
		pool.push(e)
	}

	// Present the pass only once, and only for a live target the arrow did not actually strike.
	function emit(e, present, hit) {
		const { unit, snapshot } = e
		if (!e.done && unit.alive && !hit && snapshot && e.min < radius) {
			present({
				...snapshot,
				type: 'impact',
				outcome: 'nearMiss',
				target: { id: unit.id, team: unit.team, isHuman: unit.isHuman },
				distance: e.min,
			})
		}
		e.done = true
	}

	// A stopped arrow resting inside the contact distance of its target was a hit (or a deflect), not a whiff.
	function settle(arrow, present) {
		for (const [key, e] of pending) {
			if (e.arrow !== arrow) continue
			const p = arrow.position
			const u = e.unit.position
			const grounded = Math.hypot(p.x - u.x, p.z - u.z)
			const reach = contactDistance(arrow)
			emit(e, present, e.last < reach || grounded < reach)
			drop(key, e)
		}
	}

	function scan(arrows, units, present) {
		for (const arrow of arrows) {
			if (arrow.state !== 'flying') {
				if (pending.size) settle(arrow, present)
				continue
			}
			const p = arrow.position
			for (const unit of units) {
				if (!unit.alive || unit.team === arrow.ownerTeam) continue
				const u = unit.position
				const dx = p.x - u.x
				const dy = p.y - u.y
				const dz = p.z - u.z
				const d = dy > ABOVE_LIMIT ? Infinity : Math.sqrt(dx * dx + dy * dy + dz * dz)
				const key = arrow.id * PAIR_STRIDE + unit.id
				let e = pending.get(key)
				if (d < radius) {
					if (!e) {
						e = take(arrow, unit)
						pending.set(key, e)
					}
					if (!e.done && d < e.min) {
						e.min = d
						e.snapshot = arrow.snapshotImpact()
					} else if (d > e.min + 1e-3) {
						// Receding again while still flying: the closest point is behind us and it was no hit.
						emit(e, present, false)
					}
					e.last = d
				} else if (e) {
					emit(e, present, false)
					drop(key, e)
				}
			}
		}
	}

	function reset() {
		for (const [key, e] of pending) drop(key, e)
	}

	return { scan, reset }
}
