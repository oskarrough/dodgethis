import * as THREE from 'three'
import { tune } from './tune.js'
import { nearest } from './spatial.js'
import { ARENA, blockOutward, bounds } from './arena.js'

// Cheap per-enemy brain (plan.md M5). Each tick it picks one of three intents
// and returns { move, grab, shoot } for the main loop to execute:
//
//   threatened → an enemy arrow is inbound on my line → strafe off it (toward center)
//   armed      → I hold an arrow → face nearest enemy, lead + jitter, loose after a beat
//   noArrow    → walk to the nearest grounded arrow and grab it
//
// Difficulty is just two knobs in tune.ai: reaction time and aim jitter. No
// pathfinding — the court is open, movement is a normalized direction.

// `mods` scales the two difficulty knobs per-round (round.js ramps them down a
// little each round, so later rounds react faster and aim tighter).
export function createBrain(unit, { reactionMul = 1, jitterMul = 1 } = {}) {
	let aimTimer = 0
	let lastTarget = null
	let strafeDir = Math.random() < 0.5 ? 1 : -1 // circle-strafe handedness (flips over time)
	let strafeTimer = 0
	const lastPos = new THREE.Vector3()
	const tvel = new THREE.Vector3() // estimated target velocity (for leading)
	const move = new THREE.Vector3()
	const aim = new THREE.Vector3()
	const pred = new THREE.Vector3()

	// Closest-approach dodge: look at EVERY inbound enemy arrow, work out where its
	// line passes me, and step off the ones that would actually clip me. Reacting on
	// time-to-impact (not raw distance) catches fast arrows from farther out, and
	// summing an escape vector over all threats means a dodge won't strafe into a
	// second arrow. Returns an (un-normalized) escape direction, or null if safe.
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
			// Step perpendicular to the arrow's path, toward the side I'm already on;
			// weight by urgency so the most imminent arrow dominates the blend.
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
		move.set(0, 0, 0)
		let grab = false
		let shoot = null
		if (!unit.alive) return { move, grab, shoot }

		const me = unit.position
		const { item: target, d2 } = nearest(
			ctx.units,
			me.x,
			me.z,
			(u) => u.alive && u.team !== unit.team,
		)
		if (!target) return { move, grab, shoot }

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
			const out = norm(move, grab, shoot, me)
			out.dash = dodge.urgent // burst out of the way when a hit is imminent
			return out
		}

		// --- armed: aim with lead + jitter and loose after a reaction beat. ---
		if (unit.heldArrow) {
			const dist = Math.sqrt(d2)
			const horiz = Math.cos((tune.arrow.launchAngle * Math.PI) / 180) * tune.arrow.impulse
			const tTravel = dist / Math.max(horiz, 1)
			pred.set(target.position.x + tvel.x * tTravel, 0, target.position.z + tvel.z * tTravel)
			aim.set(pred.x - me.x, 0, pred.z - me.z)
			if (aim.lengthSq() < 1e-4) aim.set(0, 0, -1)
			aim.normalize()
			unit.aim.copy(aim)

			// Kite: circle-strafe at a standoff so an armed bot is a moving target,
			// not a post. Aim stays locked on the lead (above); move is independent.
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
				if (Math.random() < 0.5) strafeDir = -strafeDir // stay unpredictable
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
			move.set(rx * radial + sx * 0.85, 0, rz * radial + sz * 0.85)

			aimTimer += dt
			if (aimTimer >= tune.ai.reaction * reactionMul) {
				aimTimer = 0
				const j = (Math.random() * 2 - 1) * tune.ai.jitter * jitterMul // rotate aim by jitter
				const c = Math.cos(j)
				const s = Math.sin(j)
				const distPred = Math.hypot(pred.x - me.x, pred.z - me.z)
				shoot = { x: aim.x * c - aim.z * s, z: aim.x * s + aim.z * c, dist: distPred }
			}
			return norm(move, grab, shoot, me)
		}

		// --- noArrow: claim an arrow worth walking to, without walking into a shot. ---
		const { arrow, contested } = claimArrow(ctx.arrows, ctx.units, me, unit)
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
			const out = norm(move, grab, shoot, me)
			// Spend the burst to win a race, not to cross an empty court.
			out.dash = contested && unit.dashReady && ad > DASH_CLAIM_MIN && ad < DASH_CLAIM_MAX
			return out
		}
		return norm(move, grab, shoot, me)
	}

	return { unit, think }
}

// Dodge tuning: how soon (seconds to closest approach) a bot reacts to an inbound
// arrow, and how near the arrow's line must pass to count as a hit worth dodging.
const DODGE_HORIZON = 1.1
const HIT_R = 1.0
// Only spend a dash when the soonest hit is closer than this (seconds) — a far-off
// arrow gets a cheap strafe; an imminent one gets the burst.
const DASH_TTI = 0.5

// --- Ammo economy -----------------------------------------------------------
// Everyone shares one small arrow pool, so WHICH arrow a bot walks to matters
// more than how fast it walks. Nearest-first sends every unarmed bot at the same
// pickup, and the losers spend the walk doing nothing. Score each grounded arrow
// by our distance plus a penalty for how far behind the nearest rival we are.
// A rival is anyone alive and empty-handed — the human competes for the same pool.
const CONTEST_PENALTY = 1.5
// Within this much of the rival's distance the race is still winnable, so it's
// worth a dash rather than a concession.
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
		// Losing a contested arrow is usually not worth the walk. The last arrow on
		// the court is the exception: denying it is the whole game, so always go.
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

// An unarmed bot crossing open court in a straight line, in full view of someone
// armed, is free ammo. Nudge sideways off the shooter's line while still closing
// on the pickup. Null when nobody armed is looking our way.
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

function norm(move, grab, shoot, me) {
	// Brains steer straight at whatever they want; near the rim that walks them
	// into the lava. Falls stay possible (knockback, a dodge begun at the edge),
	// but the AI stops suiciding.
	if (me) blockOutward(move, me.x, me.z, ARENA.inset.aiEdge)
	const l = Math.hypot(move.x, move.z)
	if (l > 1e-4) {
		move.x /= l
		move.z /= l
	}
	return { move: { x: move.x, z: move.z }, grab, shoot }
}
