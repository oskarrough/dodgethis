import { ARENA, ammoPoint, makeRng, spawnPoint, freeSpawnPoint } from './arena.js'
import { pointInside } from './obstacles.js'
import { createPlayer } from './player.js'
import { createArrow, solveLaunch } from './arrow.js'
import { createBrain } from './ai.js'
import { createNearMissTracker } from './nearmiss.js'
import { nearest } from './spatial.js'
import { tune } from './tune.js'
import { PALETTE } from './style.js'
import { createSoloRoster, validateRoster } from './roster.js'

const STILL = Object.freeze({ x: 0, z: 0 })

// A Round owns one round's units, AI, and arrows; tick it with step + lateUpdate, dispose it for a real reset, and handle its one-shot onOver(winner) signal; ctx provides borrowed game services.
export function createRound(
	ctx,
	{
		enemies = 3,
		allies = 0,
		arrowCount = 7,
		hp = 1,
		roundNum = 1,
		onOver = () => {},
		lobby = false,
		seed,
		roster,
		localParticipantId,
	} = {},
) {
	if (!lobby && arrowCount < 1) throw new Error('Combat rounds require at least one arrow')
	const explicitRoster = roster !== undefined
	const participants = validateRoster(explicitRoster ? roster : createSoloRoster(enemies, allies))
	if (!explicitRoster) localParticipantId ??= 'local'
	if (!participants.some((p) => p.id === localParticipantId && p.controller === 'human'))
		throw new Error('localParticipantId must identify a human in the roster')
	const { scene, world, RAPIER, eventQueue, combat, present = () => {} } = ctx
	// Seeded gameplay randomness makes fixed-step fixtures repeatable while visual FX retain independent randomness.
	const rng = makeRng(seed)

	// Spawn by team and roster order, never by which human is local.
	const teamCounts = { A: 0, B: 0 }
	const teamIndices = { A: 0, B: 0 }
	for (const p of participants) teamCounts[p.team]++
	const units = participants.map((participant) =>
		createPlayer(scene, world, RAPIER, {
			hp,
			participant,
			position: spawnPoint(
				participant.team,
				teamIndices[participant.team]++,
				teamCounts[participant.team],
			),
			color: participant.team === 'A' ? PALETTE.teamA : PALETTE.teamB,
		}),
	)
	const humans = units.filter((u) => u.controller === 'human')
	const localPlayer = humans.find((u) => u.participantId === localParticipantId)
	const usedParticipantIds = new Set(participants.map((p) => p.id))
	let addedUnitId = 0
	// Only bots get brains. Remote humans use the same actions as local humans.
	// Later rounds sharpen the AI a touch: faster reactions, tighter aim. Floors
	// keep a long match challenging but never frame-perfect.
	const aiMod = {
		rng,
		reactionMul: Math.max(0.55, 1 - 0.12 * (roundNum - 1)),
		jitterMul: Math.max(0.5, 1 - 0.15 * (roundNum - 1)),
	}
	const brains = units.filter((u) => u.controller === 'bot').map((u) => createBrain(u, aiMod))

	// One arrow per human in roster order, while the pool lasts. Solo still starts
	// with exactly one nocked arrow; explicit rosters never privilege local identity.
	const arrows = []
	for (let i = 0; i < arrowCount; i++) {
		// Retry scattered ammo that lands inside an obstacle; each attempt is one ammoPoint draw so the seed still drives everything.
		let spot = ammoPoint(rng)
		for (
			let tries = 0;
			tries < 20 && pointInside(spot.x, spot.z, ctx.obstacles ?? [], 0.6);
			tries++
		)
			spot = ammoPoint(rng)
		arrows.push(createArrow(scene, world, RAPIER, { position: [spot.x, 0, spot.z] }))
	}
	for (let i = 0; i < Math.min(humans.length, arrows.length); i++) {
		humans[i].heldArrow = arrows[i]
		arrows[i].hold()
	}

	// Whiffs past enemies become their own feedback events, tracked across steps per arrow/unit pair.
	const nearMiss = createNearMissTracker({ radius: tune.arrow.nearMiss })

	if (lobby) combat.push('hub — step into a portal to fight')
	else {
		const opponentTeam = localPlayer.team === 'A' ? 'B' : 'A'
		combat.push(
			`round ${roundNum} start — Team ${localPlayer.team} (you) vs Team ${opponentTeam} (${teamCounts[opponentTeam]})`,
		)
	}

	let over = false
	let winner = null // 'A' | 'B' | null — null with over=true means a draw
	// A decided round delays onOver for the final death animation; `ending` tracks the countdown even for draws.
	let overDelay = 0
	let ending = false

	// --- Shared actions (used by both the human and the AI brains). ---
	// `opts` carries the human weapon and perfect shot; AI omission means plain arrows.
	function looseArrow(unit, dir, speed, opts = {}) {
		if (over || !unit.alive) return
		const a = unit.heldArrow
		if (!a) return
		unit.aim.set(dir.x, 0, dir.z)
		if (unit.aim.lengthSq() > 1e-4) unit.aim.normalize()
		unit.face(unit.aim)
		a.loose(unit.handPosition(), unit.aim, unit.team, speed, {
			...opts,
			sourceId: unit.id,
			sourceIsHuman: unit.isHuman,
		})
		unit.heldArrow = null
		const tag = opts.kind === 'bowl' ? ' (bowl)' : opts.perfect ? ' — PERFECT!' : ''
		combat.push(
			`Team ${unit.team} unit #${unit.id} loosed arrow #${a.id}${tag}`,
			opts.perfect ? 'win' : '',
		)
		present({ ...a.snapshotImpact(), type: 'shot' })
	}

	// The human's shot — main.js solves the aim direction + speed + weapon opts.
	function looseHuman(dir, speed, opts = {}) {
		looseArrow(localPlayer, dir, speed, opts)
	}

	function grabNearestArrow(unit) {
		if (over || unit.heldArrow || !unit.alive) return
		const p = unit.body.translation()
		const { item: best, d2 } = nearest(arrows, p.x, p.z, (a) => a.state === 'grounded')
		if (best && d2 <= tune.player.pickupRadius ** 2) {
			best.hold()
			unit.heldArrow = best
			combat.push(`Team ${unit.team} unit #${unit.id} grabbed arrow #${best.id}`, 'pickup')
			present({
				type: 'pickup',
				arrowId: best.id,
				source: { id: unit.id, team: unit.team, isHuman: unit.isHuman },
				point: { ...best.position },
			})
		}
	}

	// Infinite-ammo cheat: the human's quiver never empties. Whenever they have no
	// arrow in hand — just loosed one, or the cheat was toggled on empty-handed —
	// nock a fresh arrow so shooting never stalls on the scarce pool. A new arrow
	// enters the pool each time, which is the point of "infinite".
	function nockInfinite(unit) {
		if (!tune.cheats.infiniteAmmo || lobby || over || !unit.alive || unit.heldArrow) return
		const a = createArrow(scene, world, RAPIER, { position: [0, 0, 0] })
		a.hold()
		unit.heldArrow = a
		arrows.push(a)
		combat.push('infinite ammo — fresh arrow nocked', 'pickup')
	}

	function dashUnit(unit, direction) {
		if (!unit.dash(direction)) return false
		present({
			type: 'dash',
			source: { id: unit.id, team: unit.team, isHuman: unit.isHuman },
			point: { ...unit.body.translation() },
			direction: unit.dashDirection,
		})
		return true
	}

	function dashHuman(direction) {
		return dashUnit(localPlayer, direction)
	}

	// Run every brain: move, maybe grab, maybe shoot.
	function thinkAI(dt) {
		if (!tune.ai.enabled) return
		const ictx = { units, arrows, obstacles: ctx.obstacles ?? [] }
		for (const b of brains) {
			if (!b.unit.alive) continue
			const intent = b.think(ictx, dt)
			if (intent.dash) dashUnit(b.unit, intent.move) // burst out of an imminent arrow
			b.unit.update(intent.move, dt)
			if (intent.grab) grabNearestArrow(b.unit)
			if (intent.shoot) looseArrow(b.unit, intent.shoot, solveLaunch(intent.shoot.dist))
		}
	}

	// --- Collision events: flying arrow vs enemy unit → elimination. ---
	function resolveHits() {
		if (over) return // round already decided; ignore late contacts
		eventQueue.drainCollisionEvents((h1, h2, started) => {
			if (!started) return
			const arrow = arrows.find(
				(a) => a.state === 'flying' && (a.colliderHandle === h1 || a.colliderHandle === h2),
			)
			if (!arrow) return
			const unit = units.find(
				(u) => u.alive && (u.colliderHandle === h1 || u.colliderHandle === h2),
			)
			if (!unit || unit.team === arrow.ownerTeam) return
			const event = arrow.snapshotImpact()
			event.surface = 'unit'
			event.target = { id: unit.id, team: unit.team, isHuman: unit.isHuman }
			world.contactPair(
				world.getCollider(arrow.colliderHandle),
				unit.collider,
				(manifold, flipped) => {
					if (event.pointKind === 'contact' || !manifold.numSolverContacts()) return
					const point = manifold.solverContactPoint(0)
					if (!point) return
					event.point = { ...point }
					event.pointKind = 'contact'
					const normal = manifold.normal()
					const sign = flipped ? 1 : -1 // outward from the target surface
					event.normal = { x: normal.x * sign, y: normal.y * sign, z: normal.z * sign }
				},
			)
			// Godmode: the human shrugs off the hit (the arrow still drops, grabbable).
			if (unit.isHuman && tune.cheats.godmode) {
				arrow.ground()
				combat.push(`godmode — arrow #${arrow.id} bounced off you`, 'pickup')
				event.outcome = 'deflected'
				present(event)
				return
			}
			if (unit.damage(1)) {
				unit.eliminate()
				arrow.ground()
				combat.push(`HIT — arrow #${arrow.id} eliminated Team ${unit.team} unit #${unit.id}`, 'hit')
				event.outcome = 'eliminated'
				present(event)
				return
			}
			// Wounded but standing: the arrow drops and the held one is forfeit, so a hit always costs ammo.
			arrow.ground()
			if (unit.heldArrow) {
				unit.heldArrow.ground()
				unit.heldArrow = null
			}
			combat.push(
				`HIT — arrow #${arrow.id} hurt Team ${unit.team} unit #${unit.id} (${unit.hp}/${unit.maxHp} hp)`,
				'hit',
			)
			event.outcome = 'hurt'
			event.hp = unit.hp
			event.maxHp = unit.maxHp
			present(event)
		})
	}

	// Crossing the kill plane is an instant elimination that can decide the round.
	function checkPits() {
		if (over) return
		for (const u of units) {
			if (!u.alive) continue
			if (u.body.translation().y < ARENA.killY) {
				// Godmode: scoop the human back onto the court instead of killing them.
				if (u.isHuman && (tune.cheats.godmode || lobby)) {
					const [x, , z] = spawnPoint(u.team)
					u.place(x, 2, z)
					combat.push(
						lobby
							? 'the void spat you back onto the field'
							: 'godmode — pulled you out of the lava',
						'pickup',
					)
					continue
				}
				const event = {
					type: 'fall',
					outcome: 'eliminated',
					target: { id: u.id, team: u.team, isHuman: u.isHuman },
					point: { ...u.body.translation() },
					direction: { x: 0, y: -1, z: 0 },
					surface: 'void',
				}
				u.eliminate()
				combat.push(u.isHuman ? 'you fell into the lava' : `Team ${u.team} unit fell in`, 'kill')
				present(event)
			}
		}
	}

	function checkWin() {
		if (over || lobby) return
		let aliveA = 0
		let aliveB = 0
		for (const u of units) {
			if (!u.alive) continue
			if (u.team === 'A') aliveA++
			else aliveB++
		}
		if (aliveA > 0 && aliveB > 0) return
		over = true
		// A same-step mutual wipe is a draw; null tells the match controller to replay the round.
		winner = aliveA === 0 && aliveB === 0 ? null : aliveA === 0 ? 'B' : 'A'
		// Keep the round open until the deciding death animation finishes, then step() fires onOver.
		ending = true
		overDelay = 1.4 * Math.max(0.25, tune.fx.deathTime)
	}

	// Remote moves: Map<participantId, {x,z}> or (participantId) => {x,z}.
	// Missing moves are neutral each tick (never AI or a latched network input).
	// The second argument remains local movement for existing solo callers.
	function step(dt, move = STILL, remoteMoves) {
		for (const unit of humans) {
			nockInfinite(unit)
			let direction = move
			if (unit !== localPlayer) {
				direction =
					typeof remoteMoves === 'function'
						? remoteMoves(unit.participantId)
						: remoteMoves?.get(unit.participantId)
			}
			unit.update(direction ?? STILL, dt)
		}
		thinkAI(dt)
		// Landings above a step-down/snap threshold are events so feedback can squash, thud and mark.
		for (const u of units) {
			const speed = u.consumeLanding()
			if (speed > 2.5)
				present({
					type: 'land',
					source: { id: u.id, team: u.team, isHuman: u.isHuman },
					point: { ...u.body.translation() },
					direction: { x: 0, y: -1, z: 0 },
					speed,
				})
		}
		world.step(eventQueue)
		resolveHits()
		checkPits()
		// Check victory once after all same-step eliminations so mutual wipes remain draws.
		checkWin()
		nearMiss.scan(arrows, units, present)
		for (const a of arrows) {
			const event = a.update()
			if (event) present(event)
		}

		if (!over) for (const unit of humans) grabNearestArrow(unit)

		// Deciding-death grace period: let the animation breathe, then end the round.
		if (ending) {
			overDelay -= dt
			if (overDelay <= 0) {
				ending = false
				onOver(winner) // signal up to the match controller (null = draw)
			}
		}
	}

	// After stepping, sync meshes and held arrows; pickups remain in step() so paused fixtures stay stable.
	function lateUpdate() {
		for (const u of units) u.sync()
		for (const u of units) {
			if (u.alive && u.heldArrow) u.heldArrow.setHeldPose(u.handPosition(), u.aim)
		}
	}

	// --- Live roster editing (debug/sandbox) ----------------------------------
	// Debug roster edits add AI units to either team and can decide the round when removing the last opponent.
	function addUnit(team) {
		const isB = team === 'B'
		if (team !== 'A' && team !== 'B') throw new Error('Unknown team')
		const position = freeSpawnPoint(team, units, tune.player.radius)
		if (!position) {
			combat.push(`no free spawn space on Team ${team}`)
			return null
		}
		let id
		do {
			id = `bot-added-${++addedUnitId}`
		} while (usedParticipantIds.has(id))
		const u = createPlayer(scene, world, RAPIER, {
			position,
			color: isB ? PALETTE.teamB : PALETTE.teamA,
			hp,
			participant: { id, team, controller: 'bot', peerId: null },
		})
		usedParticipantIds.add(id)
		units.push(u)
		brains.push(createBrain(u, aiMod)) // added units are never the human → always AI
		combat.push(`+ spawned Team ${team} unit #${u.id}`, 'pickup')
		return u
	}

	function removeUnit(team) {
		// The newest still-standing non-human unit on this team (never the human).
		for (let i = units.length - 1; i >= 0; i--) {
			const u = units[i]
			if (u.team !== team || u.isHuman || !u.alive) continue
			const bi = brains.findIndex((b) => b.unit === u)
			if (bi >= 0) brains.splice(bi, 1)
			units.splice(i, 1)
			// Ground a removed unit's held arrow so the scarce pool does not shrink.
			if (u.heldArrow) {
				u.heldArrow.ground()
				u.heldArrow = null
			}
			u.dispose()
			u.alive = false // invalidate other brains’ cached target immediately
			combat.push(`- removed Team ${team} unit #${u.id}`, 'kill')
			checkWin()
			return
		}
		combat.push(`no removable Team ${team} unit`)
	}

	// Dispose every owned body and mesh; the next round needs a fresh instance.
	function dispose() {
		nearMiss.reset()
		for (const u of units) u.dispose()
		for (const a of arrows) a.dispose()
		units.length = 0
		arrows.length = 0
		brains.length = 0
		humans.length = 0
	}

	return {
		human: localPlayer, // compatibility alias: not the only human, nor necessarily Team A
		localPlayer,
		localParticipantId,
		get roster() {
			return units.map((u) => u.participant)
		},
		units,
		brains,
		arrows,
		get over() {
			return over
		},
		get winner() {
			return winner
		},
		step,
		lateUpdate,
		looseArrow,
		grabNearestArrow,
		dashUnit,
		looseHuman,
		dashHuman,
		addUnit,
		removeUnit,
		dispose,
	}
}
