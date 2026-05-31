import { COURT, KILL_Y } from './court.js'
import { createPlayer } from './player.js'
import { createArrow, solveLaunch } from './arrow.js'
import { createBrain } from './ai.js'
import { nearest } from './spatial.js'
import { tune } from './debug.js'

// A Round is the gameplay "scene" (Godot framing): it owns the units, their AI
// brains, and the arrow pool for ONE round. Build it with createRound(), tick it
// each frame (step + lateUpdate), and call dispose() to free everything it added
// to the Three scene and the Rapier world. That clean teardown is the "real
// reset" — instance a fresh Round instead of reloading the page.
//
// When one team is wiped out the round fires onOver(winner) exactly once — a
// signal the match controller (main.js) listens to, to keep score.
//
// ctx carries the persistent game services the round borrows but does not own:
//   { scene, world, RAPIER, eventQueue, combat, sfx, addShake }
export function createRound(ctx, { enemies = 3, arrowCount = 7, roundNum = 1, onOver = () => {} } = {}) {
  const { scene, world, RAPIER, eventQueue, combat, sfx, addShake } = ctx

  // --- Units: human (team A) near, enemy dummies (team B) far. ---
  const units = []
  const human = createPlayer(scene, world, RAPIER, { position: [0, 0, 8], color: 0x5db4ff, team: 'A', isHuman: true })
  units.push(human)
  for (let i = 0; i < enemies; i++) {
    units.push(createPlayer(scene, world, RAPIER, {
      position: [(i - 1) * 3, 0, -8], color: 0xff5d5d, team: 'B',
    }))
  }
  // Brains for every non-human unit (Team B). They share the same grab/loose
  // helpers the human uses, so the rules live in exactly one place.
  const brains = units.filter((u) => !u.isHuman).map(createBrain)

  // --- Arrow pool: scattered loose on the court, one nocked for the human. ---
  const arrows = []
  for (let i = 0; i < arrowCount; i++) {
    arrows.push(createArrow(scene, world, RAPIER, {
      position: [(Math.random() - 0.5) * (COURT.width - 2), 0, (Math.random() - 0.5) * (COURT.depth - 6)],
    }))
  }
  human.heldArrow = arrows[0]
  arrows[0].hold()

  combat.push(`round ${roundNum} start — Team A (you) vs Team B (${enemies})`)

  let over = false
  let winner = null
  // When a round is decided we don't end it instantly — we let the deciding
  // death animation play out for a beat, then fire onOver. overDelay counts that
  // beat down (in step()); pendingWinner holds who won until it elapses.
  let overDelay = 0
  let pendingWinner = null

  // --- Shared actions (used by both the human and the AI brains). ---
  // `opts` carries the human's weapon choice: { kind:'arrow'|'bowl', perfect }.
  // The AI always omits it, so enemies fire plain arrows.
  function looseArrow(unit, dir, speed, opts = {}) {
    const a = unit.heldArrow
    if (!a) return
    unit.aim.set(dir.x, 0, dir.z)
    if (unit.aim.lengthSq() > 1e-4) unit.aim.normalize()
    unit.face(unit.aim)
    a.loose(unit.handPosition(), unit.aim, unit.team, speed, opts)
    unit.heldArrow = null
    const tag = opts.kind === 'bowl' ? ' (bowl)' : opts.perfect ? ' — PERFECT!' : ''
    combat.push(`Team ${unit.team} unit #${unit.id} loosed arrow #${a.id}${tag}`, opts.perfect ? 'win' : '')
    if (opts.kind === 'bowl') sfx.roll()
    else { sfx.loose(); if (opts.perfect) sfx.perfect() }
    if (unit.isHuman) addShake(opts.kind === 'bowl' ? 0.35 : opts.perfect ? 0.4 : 0.22)
  }

  // The human's shot — main.js solves the aim direction + speed + weapon opts.
  function looseHuman(dir, speed, opts = {}) {
    if (over || !human.alive || !human.heldArrow) return
    looseArrow(human, dir, speed, opts)
  }

  function grabNearestArrow(unit) {
    if (unit.heldArrow || !unit.alive) return
    const p = unit.mesh.position
    const { item: best, d2 } = nearest(arrows, p.x, p.z, (a) => a.state === 'grounded')
    if (best && d2 <= tune.player.pickupRadius ** 2) {
      best.hold()
      unit.heldArrow = best
      combat.push(`Team ${unit.team} unit #${unit.id} grabbed arrow #${best.id}`, 'pickup')
      if (unit.isHuman) sfx.grab()
    }
  }

  // Run every brain: move, maybe grab, maybe shoot.
  function thinkAI(dt) {
    if (!tune.ai.enabled) return
    const ictx = { units, arrows }
    for (const b of brains) {
      if (!b.unit.alive) continue
      const intent = b.think(ictx, dt)
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
      const arrow = arrows.find((a) => a.state === 'flying' && (a.colliderHandle === h1 || a.colliderHandle === h2))
      if (!arrow) return
      const unit = units.find((u) => u.alive && (u.colliderHandle === h1 || u.colliderHandle === h2))
      if (!unit || unit.team === arrow.ownerTeam) return
      // Godmode: the human shrugs off the hit (the arrow still drops, grabbable).
      if (unit.isHuman && tune.cheats.godmode) {
        arrow.ground()
        combat.push(`godmode — arrow #${arrow.id} bounced off you`, 'pickup')
        return
      }
      unit.eliminate()
      arrow.ground()
      combat.push(`HIT — arrow #${arrow.id} eliminated Team ${unit.team} unit #${unit.id}`, 'hit')
      sfx.hit()
      addShake(0.7)
      checkWin()
    })
  }

  // Anyone who tumbles off the platform sinks past the kill plane into the
  // (invisible) lava below — an instant out, scored like any other death so a
  // fall can win or lose the round via checkWin.
  function checkPits() {
    if (over) return
    for (const u of units) {
      if (!u.alive) continue
      if (u.body.translation().y < KILL_Y) {
        // Godmode: scoop the human back onto the court instead of killing them.
        if (u.isHuman && tune.cheats.godmode) {
          u.place(0, 2, 8)
          combat.push('godmode — pulled you out of the lava', 'pickup')
          continue
        }
        u.eliminate({ fell: true })
        combat.push(u.isHuman ? 'you fell into the lava' : `Team ${u.team} unit fell in`, 'kill')
        sfx.hit()
        addShake(u.isHuman ? 0.6 : 0.3)
        checkWin()
      }
    }
  }

  function checkWin() {
    if (over) return
    for (const team of ['A', 'B']) {
      const alive = units.filter((u) => u.team === team && u.alive).length
      if (alive === 0) {
        over = true
        winner = team === 'A' ? 'B' : 'A'
        // Hold the round open briefly so the deciding death animation finishes
        // before the overlay drops; step() fires onOver once overDelay elapses.
        pendingWinner = winner
        overDelay = 1.4 * Math.max(0.25, tune.fx.deathTime)
        return
      }
    }
  }

  // One fixed-timestep update: drive the human, run the brains, step physics,
  // resolve the contacts that step produced, advance flying arrows.
  function step(dt, move) {
    human.update(move, dt)
    thinkAI(dt)
    world.step(eventQueue)
    resolveHits()
    checkPits()
    for (const a of arrows) a.update()

    // Deciding-death grace period: let the animation breathe, then end the round.
    if (pendingWinner) {
      overDelay -= dt
      if (overDelay <= 0) {
        const w = pendingWinner
        pendingWinner = null
        onOver(w) // signal up to the match controller
      }
    }
  }

  // Once per frame after stepping: sync meshes from bodies, advance any death
  // animations, auto-grab for the human, and keep held arrows glued to hands.
  function lateUpdate(dt) {
    for (const u of units) { u.sync(); u.updateDeath(dt) }
    if (!over) grabNearestArrow(human)
    for (const u of units) {
      if (u.alive && u.heldArrow) u.heldArrow.setHeldPose(u.handPosition(), u.aim)
    }
  }

  // --- Live roster editing (debug/sandbox) ----------------------------------
  // Drop a fresh unit onto a team mid-round, or yank the last one off. Every
  // non-human unit gets a brain, so an added Team A unit fights at your side and
  // an added Team B unit joins the foes. Removing the last enemy can win the
  // round (checkWin runs) — handy for poking at the state machine.
  function addUnit(team) {
    const isB = team === 'B'
    const x = (Math.random() - 0.5) * (COURT.width - 3)
    const u = createPlayer(scene, world, RAPIER, {
      position: [x, 0, isB ? -8 : 8],
      color: isB ? 0xff5d5d : 0x5db4ff,
      team,
    })
    units.push(u)
    brains.push(createBrain(u)) // added units are never the human → always AI
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
      u.dispose()
      combat.push(`- removed Team ${team} unit #${u.id}`, 'kill')
      checkWin()
      return
    }
    combat.push(`no removable Team ${team} unit`)
  }

  // Free every body + mesh this round created. After this the round is dead;
  // build a new one for the next round.
  function dispose() {
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
    get over() { return over },
    get winner() { return winner },
    step,
    lateUpdate,
    looseHuman,
    addUnit,
    removeUnit,
    dispose,
  }
}
