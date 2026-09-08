import * as THREE from 'three'
import { tune } from './tune.js'
import { nearest } from './spatial.js'
import { ARENA, blockOutward, bounds } from './arena.js'
import { blocksSight, steerAround } from './obstacles.js'

// Each cheap brain returns { move, grab, shoot }: dodge inbound arrows, lead and loose when armed, or claim ammo; difficulty uses reaction and jitter, with no pathfinding.

// Per-round modifiers make later brains react faster and aim tighter.
export function createBrain(unit, { reactionMul = 1, jitterMul = 1, rng = Math.random } = {}) {
	let aimTimer = 0
	let lastTarget = null
	let strafeDir = rng() < 0.5 ? 1 : -1 // circle-strafe handedness (flips over time)
	let strafeTimer = 0
	let sightless = 0 // seconds the armed bot has lacked a clear line to its target
	// Seeded phases stagger five-Hz strategic scans; steering, leading, weaving, and dodging still run every step.
	let targetTimer = rng() * DECISION_INTERVAL
	let pickupTimer = rng() * DECISION_INTERVAL
	let target = null
	let targetInitialized = false
	let pickup = { arrow: null, contested: false }
	let pickupInitialized = false
	const lastPos = new THREE.Vector3()
	const tvel = new THREE.Vector3() // estimated target velocity (for leading)
	const move = new THREE.Vector3()
	const aim = new THREE.Vector3()
	const pred = new THREE.Vector3()

	// Blend perpendicular escapes from every imminent intersecting arrow, weighted by time to impact; return null when safe.
	function incomingDodge(arrows, me) {
		let ex = 0
		let ez = 0
		let minT = Infinity // soonest closest-approach among real threats
		let threatened = false
		for (const a of arrows) {
			if (a.state !== 'flying' || a.ownerTeam === unit.team) continue
			const v = a.velocity
			const vlen2 = v.x * v.x + v.z * v.z
			if (vlen2 < 1e-4) continue
			const rx = me.x - a.position.x // me relative to the arrow, ground plane
			const rz = me.z - a.position.z
			const t = -(rx * v.x + rz * v.z) / vlen2 // time of closest approach
			if (t < 0 || t > DODGE_HORIZON) continue // already past me, or not soon
			const mx = rx + v.x * t // miss vector at closest approach
			const mz = rz + v.z * t
			if (mx * mx + mz * mz > HIT_R * HIT_R) continue // it'll sail by
			threatened = true
			if (t < minT) minT = t
			// Step toward the current side of the path, weighted so the most imminent arrow dominates.
			const vlen = Math.sqrt(vlen2)
			let px = -v.z / vlen
			let pz = v.x / vlen
			if (px * rx + pz * rz < 0) {
				px = -px
				pz = -pz
			}
			const urgency = 1 / (t + 0.1)
			ex += px * urgency
			ez += pz * urgency
		}
		if (!threatened) return null
		ex += -me.x * 0.03 // gentle pull to center so a panic-dodge avoids the rim
		ez += -me.z * 0.03
		if (ex * ex + ez * ez < 1e-6) return null
		return { x: ex, z: ez, urgent: minT < DASH_TTI } // dash only on imminent hits
	}

	function think(ctx, dt) {
		unit.windup = 0
		move.set(0, 0, 0)
		let grab = false
		let shoot = null
		if (!unit.alive) return { move, grab, shoot }

		const me = unit.position
		const obstacles = ctx.obstacles ?? [] // missing or empty list = open court
		targetTimer -= dt
		pickupTimer -= dt
		if (!targetInitialized || targetTimer <= 0 || (target && !target.alive)) {
			target = nearest(ctx.units, me.x, me.z, (u) => u.alive && u.team !== unit.team).item
			targetInitialized = true
			if (targetTimer <= 0) targetTimer = DECISION_INTERVAL
		}
		if (!target) return { move, grab, shoot }
		// Positions stay live even while the strategic choice is cached.
		const dx = target.position.x - me.x
		const dz = target.position.z - me.z
		const d2 = dx * dx + dz * dz

		// Estimate the target's velocity from frame-to-frame movement (for leading).
		if (target === lastTarget && dt > 0) {
			tvel.set((target.position.x - lastPos.x) / dt, 0, (target.position.z - lastPos.z) / dt)
		} else {
			tvel.set(0, 0, 0)
			aimTimer = 0
		}
		lastTarget = target
		lastPos.copy(target.position)

		// --- threatened: dodge an inbound arrow (still facing the target). ---
		const dodge = incomingDodge(ctx.arrows, me)
		if (dodge) {
			move.set(dodge.x, 0, dodge.z)
			unit.aim.set(target.position.x - me.x, 0, target.position.z - me.z)
			if (unit.aim.lengthSq() > 1e-4) unit.aim.normalize()
			const out = norm(move, grab, shoot, me, obstacles, dodge) // dodge steers too, but keeps its escape direction
			out.dash = dodge.urgent // burst out of the way when a hit is imminent
			return out
		}

		// --- armed: aim with lead + jitter and loose after a reaction beat. ---
		if (unit.heldArrow) {
			pickupInitialized = false
			const dist = Math.max(Math.sqrt(d2), 1e-4)
			const horiz = Math.cos((tune.arrow.launchAngle * Math.PI) / 180) * tune.arrow.impulse
			const tTravel = dist / Math.max(horiz, 1)
			pred.set(target.position.x + tvel.x * tTravel, 0, target.position.z + tvel.z * tTravel)
			aim.set(pred.x - me.x, 0, pred.z - me.z)
			if (aim.lengthSq() < 1e-4) aim.set(0, 0, -1)
			aim.normalize()
			unit.aim.copy(aim)

			// Armed bots circle-strafe at a standoff while aiming independently at the lead.
			const standoff = tune.ai.standoff
			const band = 2.5
			const rx = (target.position.x - me.x) / dist // unit dir toward target
			const rz = (target.position.z - me.z) / dist
			let radial = 0
			if (dist > standoff + band) radial = 1 // too far → close in
			else if (dist < standoff - band) radial = -1 // too close → back off
			strafeTimer += dt
			if (strafeTimer > 2.2) {
				strafeTimer = 0
				if (rng() < 0.5) strafeDir = -strafeDir // stay unpredictable
			}
			let sx = -rz * strafeDir // tangent (perpendicular to the line to target)
			let sz = rx * strafeDir
			const rim = bounds(ARENA.inset.aiKite) // flip rather than grind the lava rim
			if (
				(me.x > rim.x && sx > 0) ||
				(me.x < -rim.x && sx < 0) ||
				(me.z > rim.z && sz > 0) ||
				(me.z < -rim.z && sz < 0)
			) {
				strafeDir = -strafeDir
				sx = -sx
				sz = -sz
			}
			// A tall obstacle between us and the target blocks shots: slide sideways to regain the line instead of aiming.
			if (blocksSight(me.x, me.z, target.position.x, target.position.z, obstacles)) {
				sightless += dt
				if (sightless > tune.ai.sightFlip) {
					strafeDir = -strafeDir
					sightless = 0
				}
				aimTimer = 0 // the shot would only hit the obstacle; restart the reaction beat once sight returns
				unit.windup = 0
				move.set(sx, 0, sz) // pure tangent, no radial closing
				return norm(move, grab, shoot, me, obstacles)
			}
			sightless = 0
			move.set(rx * radial + sx * 0.85, 0, rz * radial + sz * 0.85)

			aimTimer += dt
			unit.windup = Math.min(1, aimTimer / (tune.ai.reaction * reactionMul))
			if (aimTimer >= tune.ai.reaction * reactionMul) {
				aimTimer = 0
				unit.windup = 0
				const j = (rng() * 2 - 1) * tune.ai.jitter * jitterMul // rotate aim by jitter
				const c = Math.cos(j)
				const s = Math.sin(j)
				const distPred = Math.hypot(pred.x - me.x, pred.z - me.z)
				shoot = { x: aim.x * c - aim.z * s, z: aim.x * s + aim.z * c, dist: distPred }
			}
			return norm(move, grab, shoot, me)
		}

		// --- noArrow: claim an arrow worth walking to, without walking into a shot. ---
		if (
			!pickupInitialized ||
			pickupTimer <= 0 ||
			(pickup.arrow && pickup.arrow.state !== 'grounded')
		) {
			pickup = claimArrow(ctx.arrows, ctx.units, me, unit)
			pickupInitialized = true
			if (pickupTimer <= 0) pickupTimer = DECISION_INTERVAL
		}
		const { arrow, contested } = pickup
		if (arrow) {
			move.set(arrow.position.x - me.x, 0, arrow.position.z - me.z)
			const ad = Math.hypot(move.x, move.z)
			unit.aim.set(move.x, 0, move.z)
			if (unit.aim.lengthSq() > 1e-4) unit.aim.normalize()
			// Face the pickup but arrive off the straight line an armed enemy is holding.
			const weave = threatWeave(ctx.units, me, unit.team, strafeDir)
			if (weave) {
				move.x += weave.x * ad * WEAVE_MUL
				move.z += weave.z * ad * WEAVE_MUL
			}
			if (ad * ad <= tune.player.pickupRadius ** 2 * 0.9) grab = true
			const out = norm(move, grab, shoot, me, obstacles)
			// Spend the burst to win a race, not to cross an empty court.
			out.dash = contested && unit.dashReady && ad > DASH_CLAIM_MIN && ad < DASH_CLAIM_MAX
			return out
		}
		return norm(move, grab, shoot, me, obstacles)
	}

	return { unit, think }
}

const DECISION_INTERVAL = 0.2

// Dodge tuning sets the reaction horizon and how near a trajectory must pass to threaten.
const DODGE_HORIZON = 1.1
const HIT_R = 1.0
// Reserve dashes for imminent hits; distant threats get a cheap strafe.
const DASH_TTI = 0.5

// --- Ammo economy -----------------------------------------------------------
// Score shared grounded arrows by distance plus the deficit to the nearest empty-handed rival, avoiding wasted pickup races.
const CONTEST_PENALTY = 1.5
// A race within this margin is winnable enough to spend a dash.
const CONTEST_MARGIN = 2
const DASH_CLAIM_MIN = 2
const DASH_CLAIM_MAX = 7

function claimArrow(arrows, units, me, self) {
	let grounded = 0
	for (const a of arrows) if (a.state === 'grounded') grounded++
	let arrow = null
	let best = Infinity
	let contested = false
	for (const a of arrows) {
		if (a.state !== 'grounded') continue
		const myD = Math.hypot(a.position.x - me.x, a.position.z - me.z)
		let rivalD = Infinity
		for (const u of units) {
			if (u === self || !u.alive || u.heldArrow) continue
			const d = Math.hypot(a.position.x - u.position.x, a.position.z - u.position.z)
			if (d < rivalD) rivalD = d
		}
		// Avoid losing contested pickups unless it is the last grounded arrow.
		const losing = rivalD < myD && grounded > 1
		const score = myD + (losing ? (myD - rivalD) * CONTEST_PENALTY : 0)
		if (score < best) {
			best = score
			arrow = a
			contested = rivalD < myD + CONTEST_MARGIN
		}
	}
	return { arrow, contested }
}

// Nudge unarmed bots sideways while crossing an armed enemy's sightline; return null when unseen.
const WEAVE_RANGE = 16
const WEAVE_DOT = 0.85 // how squarely the shooter must face us to count
const WEAVE_MUL = 0.5

function threatWeave(units, me, team, side) {
	for (const u of units) {
		if (!u.alive || u.team === team || !u.heldArrow) continue
		const dx = me.x - u.position.x
		const dz = me.z - u.position.z
		const d = Math.hypot(dx, dz)
		if (d > WEAVE_RANGE || d < 1e-4) continue
		if ((u.aim.x * dx + u.aim.z * dz) / d < WEAVE_DOT) continue
		return { x: (-dz / d) * side, z: (dx / d) * side }
	}
	return null
}

function norm(move, grab, shoot, me, obstacles, keep = null) {
	// Steer around nearby obstacles, then block deliberate outward steering at the rim while preserving falls from knockback or committed dodges.
	if (me) {
		const ox = move.x
		const oz = move.z
		steerAround(move, me.x, me.z, obstacles ?? [], tune.ai.steerClearance)
		// `keep` marks a committed dodge: steering may bend it but never reverse it.
		if (keep && move.x * keep.x + move.z * keep.z < 0) {
			move.x = ox
			move.z = oz
		}
		blockOutward(move, me.x, me.z, ARENA.inset.aiEdge)
	}
	const l = Math.hypot(move.x, move.z)
	if (l > 1e-4) {
		move.x /= l
		move.z /= l
	}
	return { move: { x: move.x, z: move.z }, grab, shoot }
}
