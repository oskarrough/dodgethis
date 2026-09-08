import { ARENA, ammoPoint, makeRng, spawnPoint, freeSpawnPoint } from './arena.js'
import { createPlayer } from './player.js'
import { createArrow, solveLaunch } from './arrow.js'
import { createBrain } from './ai.js'
import { createNearMissTracker } from './nearmiss.js'
import { nearest } from './spatial.js'
import { tune } from './tune.js'
import { PALETTE } from './style.js'

// A Round owns one round's units, AI, and arrows; tick it with step + lateUpdate, dispose it for a real reset, and handle its one-shot onOver(winner) signal; ctx provides borrowed game services.
export function createRound(
	ctx,
	{
		enemies = 3,
		allies = 0,
		arrowCount = 7,
		roundNum = 1,
		onOver = () => {},
		lobby = false,
		seed,
	} = {},
) {
	if (!lobby && arrowCount < 1) throw new Error('Combat rounds require at least one arrow')
	const { scene, world, RAPIER, eventQueue, combat, present = () => {} } = ctx
	// Seeded gameplay randomness makes fixed-step fixtures repeatable while visual FX retain independent randomness.
	const rng = makeRng(seed)

	// --- Units: human (team A) near, enemy dummies (team B) far. ---
	const units = []
	const human = createPlayer(scene, world, RAPIER, {
		position: spawnPoint('A', 0, allies + 1),
		color: PALETTE.teamA,
		team: 'A',
		isHuman: true,
	})
	units.push(human)
	for (let i = 0; i < enemies; i++) {
		units.push(
			createPlayer(scene, world, RAPIER, {
				position: spawnPoint('B', i, enemies),
				color: PALETTE.teamB,
				team: 'B',
			}),
		)
	}
	for (let i = 1; i <= allies; i++) {
		units.push(
			createPlayer(scene, world, RAPIER, {
				position: spawnPoint('A', i, allies + 1),
				color: PALETTE.teamA,
				team: 'A',
			}),
		)
	}
	// Non-human brains share human actions; later rounds lower reaction and jitter to bounded floors.
	const aiMod = {
		rng,
		reactionMul: Math.max(0.55, 1 - 0.12 * (roundNum - 1)),
		jitterMul: Math.max(0.5, 1 - 0.15 * (roundNum - 1)),
	}
	const brains = units.filter((u) => !u.isHuman).map((u) => createBrain(u, aiMod))

	// --- Arrow pool: scattered loose on the court, one nocked for the human. ---
	const arrows = []
	for (let i = 0; i < arrowCount; i++) {
		const spot = ammoPoint(rng)
		arrows.push(createArrow(scene, world, RAPIER, { position: [spot.x, 0, spot.z] }))
	}
	if (arrows.length) {
		human.heldArrow = arrows[0]
		arrows[0].hold()
	}

	// Whiffs past enemies become their own feedback events, tracked across steps per arrow/unit pair.
	const nearMiss = createNearMissTracker({ radius: tune.arrow.nearMiss })

	if (lobby) combat.push('hub — step into a portal to fight')
	else combat.push(`round ${roundNum} start — Team A (you) vs Team B (${enemies})`)

	let over = false
	let winner = null // 'A' | 'B' | null — null with over=true means a draw
	// A decided round delays onOver for the final death animation; `ending` tracks the countdown even for draws.
	let overDelay = 0
	let ending = false

	// --- Shared actions (used by both the human and the AI brains). ---
	// `opts` carries the human weapon and perfect shot; AI omission means plain arrows.
	function looseArrow(unit, dir, speed, opts = {}) {
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
		if (over || !human.alive || !human.heldArrow) return
		looseArrow(human, dir, speed, opts)
	}

	function grabNearestArrow(unit) {
		if (unit.heldArrow || !unit.alive) return
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

	// Infinite ammo adds and nocks a fresh pooled arrow whenever the human is empty-handed.
	function nockInfinite() {
		if (!tune.cheats.infiniteAmmo || lobby || over || !human.alive || human.heldArrow) return
		const a = createArrow(scene, world, RAPIER, { position: [0, 0, 0] })
		a.hold()
		human.heldArrow = a
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
		return dashUnit(human, direction)
	}

	// Run every brain: move, maybe grab, maybe shoot.
	function thinkAI(dt) {
		if (!tune.ai.enabled) return
		const ictx = { units, arrows }
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
			unit.eliminate()
			arrow.ground()
			combat.push(`HIT — arrow #${arrow.id} eliminated Team ${unit.team} unit #${unit.id}`, 'hit')
			event.outcome = 'eliminated'
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
					u.place(spawnPoint('A')[0], 2, ARENA.spawnZ)
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

	// One fixed-timestep update drives actors, physics, contacts, pits, victory, and arrows.
	function step(dt, move) {
		nockInfinite()
		human.update(move, dt)
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

		if (!over) grabNearestArrow(human)

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
		const u = createPlayer(scene, world, RAPIER, {
			position,
			color: isB ? PALETTE.teamB : PALETTE.teamA,
			team,
		})
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
	}

	return {
		human,
		units,
		arrows,
		get over() {
			return over
		},
		get winner() {
			return winner
		},
		step,
		lateUpdate,
		looseHuman,
		dashHuman,
		addUnit,
		removeUnit,
		dispose,
	}
}
