import * as THREE from 'three'
import { tune } from './tune.js'
import { nearest } from './spatial.js'
import { COURT } from './court.js'

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
	const lastPos = new THREE.Vector3()
	const tvel = new THREE.Vector3() // estimated target velocity (for leading)
	const move = new THREE.Vector3()
	const aim = new THREE.Vector3()
	const pred = new THREE.Vector3()

	// Is any enemy arrow flying roughly at me? Return a strafe dir (toward center) if so.
	function incomingDodge(arrows, me) {
		for (const a of arrows) {
			if (a.state !== 'flying' || a.ownerTeam === unit.team) continue
			const ap = a.position
			const tox = me.x - ap.x
			const toz = me.z - ap.z
			const dist2 = tox * tox + toz * toz
			if (dist2 > 49) continue // only react within ~7m
			const v = a.velocity
			const vlen = Math.hypot(v.x, v.z)
			if (vlen < 1e-3) continue
			const dot = (v.x * tox + v.z * toz) / (vlen * Math.sqrt(dist2) + 1e-6)
			if (dot < 0.7) continue // not headed at me
			// Perpendicular to the arrow's path; pick the side that moves toward x=0.
			let px = -v.z / vlen
			let pz = v.x / vlen
			if (px * me.x > 0) {
				px = -px
				pz = -pz
			}
			return { x: px, z: pz }
		}
		return null
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
			return norm(move, grab, shoot, me)
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

			if (dist > 14) move.set(aim.x, 0, aim.z) // close in if the arc can't reach

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

		// --- noArrow: fetch the nearest grounded arrow. ---
		const { item: arrow, d2: ad2 } = nearest(ctx.arrows, me.x, me.z, (a) => a.state === 'grounded')
		if (arrow) {
			move.set(arrow.position.x - me.x, 0, arrow.position.z - me.z)
			unit.aim.set(move.x, 0, move.z)
			if (unit.aim.lengthSq() > 1e-4) unit.aim.normalize()
			if (ad2 <= tune.player.pickupRadius ** 2 * 0.9) grab = true
		}
		return norm(move, grab, shoot, me)
	}

	return { unit, think }
}

// Brains steer straight at whatever they want; near the platform rim that walks
// them into the lava. Kill the outward component inside this margin — falls stay
// possible (knockback, dodges started at the rim) but the AI stops suiciding.
const EDGE = 0.9

function norm(move, grab, shoot, me) {
	if (me) {
		const mx = COURT.width / 2 - EDGE
		const mz = COURT.depth / 2 - EDGE
		if ((me.x > mx && move.x > 0) || (me.x < -mx && move.x < 0)) move.x = 0
		if ((me.z > mz && move.z > 0) || (me.z < -mz && move.z < 0)) move.z = 0
	}
	const l = Math.hypot(move.x, move.z)
	if (l > 1e-4) {
		move.x /= l
		move.z /= l
	}
	return { move: { x: move.x, z: move.z }, grab, shoot }
}
