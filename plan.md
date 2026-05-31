# arrrrow — a 3D Dodge Bolt

A small 3D archery dodgeball game. Two teams on a tennis-court-like platform
shoot arrows at each other. Arrows are **scarce** — you don't have infinite ammo,
you race to grab the ones lying on the court. Last team standing wins the round.

Simple geometry, Three.js for rendering, Rapier for physics.

## The core loop

```
play a round
└─ tick
   ├─ read input ──── steer + aim
   ├─ act ─────────┬ nock & loose an arrow   (only if I'm holding one)
   │               └ grab a loose arrow on the court
   ├─ simulate ────┬ fly arrows (Rapier: gravity + drag)
   │               ├ move AI players (chase arrows / dodge / shoot)
   │               └ resolve: arrow hits player → out · arrow lands → pickup-able
   ├─ score ──────── team eliminated? → round over
   └─ render ──────── court + players + arrows (flying & stuck)
```

The spine of the whole game is **`Arrow.state`**: `held → flying → grounded → held`.
The interesting tension isn't "throw", it's **grab vs. shoot** — running into the
open to rearm is where you get hit.

## Tech

- **Three.js** — rendering. Boxes, capsules, cylinders. No models, no textures to start.
- **Rapier** (`@dimforge/rapier3d-compat`) — physics. `-compat` build = simpler async
  init under Vite (`await RAPIER.init()`), no wasm-loader config.
- **Vite** — dev server + bundler.
- **TypeScript** — small enough to skip, but the state machine pays for itself. Optional.
- No framework, no ECS. Plain modules + one game-state object.

## Physics mapping (Rapier)

| Thing   | Rapier representation                                                    |
|---------|-------------------------------------------------------------------------|
| Court   | fixed rigid body + cuboid collider (the floor) + invisible walls/out-of-bounds |
| Player  | `KinematicCharacterController` + capsule collider, moved by input/AI     |
| Arrow   | dynamic rigid body + thin cuboid/capsule collider                       |
| Held    | arrow removed from sim, parented to player's hand (pure transform)       |
| Flying  | dynamic body, `applyImpulse` on loose; gravity + `linearDamping` = arc   |
| Grounded| velocity ~0 → freeze (sleep or convert to fixed), enable pickup sensor   |
| Hit     | Rapier collision/contact event: arrow(flying) ∩ player(enemy) → out      |
| Pickup  | proximity check or sensor collider: player ∩ arrow(grounded) → held      |

Aim = direction + power. Loose = `impulse = aimDir * power`. Drag (`linearDamping`)
keeps arcs readable instead of laser-flat. Tune gravity/damping/impulse together —
that triple *is* the game feel.

## State

As built (M7), the shape is split between a persistent game shell and a freeable
round "scene" — a small nod to Godot's instance/free-a-scene model:

```
// main.js — the persistent shell (the "Main" scene)
phase: 'menu' | 'playing' | 'roundOver' | 'matchOver'   // the state machine
match: { bestOf, needed, wins: {A,B}, round }           // best-of-N scoreboard
round: Round | null                                     // the live gameplay scene

// round.js — one round, instanced on start, dispose()d on reset
Round = {
  units:  Unit[],     // { id, team, isHuman, body, controller, heldArrow|null, alive }
  arrows: Arrow[],    // { id, state, body, ownerTeam|null }
  step(dt, move), lateUpdate(), looseHuman(dir, speed), dispose(),
  onOver(winner)      // fired once when a team is wiped — a Godot-style signal
}
```

The court + Rapier world + contact queue persist across rounds; only the round's
units/arrows come and go. The "real reset" is `round.dispose()` (frees every mesh
+ body it added) then a fresh `createRound()` — no more `location.reload()`.

`round.step(dt)` reads input, steps Rapier, syncs Three meshes
from rigid-body transforms, checks win condition.

## Controls (player 1)

- Move: WASD / left stick
- Aim: mouse (or right stick) — yaw + pitch, or a power meter
- Shoot: click / right trigger (only if holding an arrow)
- Pickup: automatic on proximity, or a grab button

## AI (the other team)

Cheap state machine per AI player:
- `noArrow` → move toward nearest grounded arrow, grab it
- `armed` → line up a shot on nearest enemy, lead the target, loose
- `threatened` → if an enemy arrow is flying toward me, strafe
Difficulty = reaction time + aim jitter. No pathfinding needed on an open court.

## Milestones

> **Status:** M1 ✅ · M2 ✅ · M3 ✅ · M4 ✅ · M5 (AI) ✅ · M6 (feel) ✅ · M7 (round flow) ✅
> Combat log (on-screen, bottom-left) is the inspection surface — every shot/hit/pickup/win.
> Shots LAND ON THE RETICLE — a ballistic solve (`solveLaunch`) picks the launch speed for the
> aimed distance, drawn as a dotted arc; arrows trail, hits screenshake, WebAudio synth cues fire.
> **Round flow (M7):** a real game-state machine — `menu → playing → roundOver → matchOver` —
> with a start menu, a best-of-N scoreboard, and a proper reset. The R=location.reload() hack is gone.

1. **Scaffold** — Vite + Three + Rapier boot. Spinning cube, physics stepping,
   camera on a flat court. Prove the wasm init + render loop.
2. **Court + player** — floor collider, one capsule, character controller, WASD moves it.
3. **Arrows** — spawn a dynamic arrow, loose it with an impulse, watch it arc and land.
   Implement the `held → flying → grounded` state machine + pickup.
4. **Hits** — collision events: flying arrow hits a capsule → that player is "out"
   (hide/ragdoll). Win check when a team is empty.
5. **Two teams + AI** — spawn N per side, wire the AI state machine, full round loop
   with reset.
6. **Feel** — camera, hit/loose/grab sound + screenshake, arrow trails, aim indicator.
   Tune the gravity/damping/impulse triple until shooting feels good.
7. **Round flow** — menu, score, best-of-N, restart.

## Open questions

- **"Choose arrows"** — assumed *scarce pickup pool* (above). If you instead meant
  *arrow types* (fast / heavy / curve), that's a layer on top of `Arrow` (a `type`
  field + per-type impulse/drag) and a selection UI — easy to add once milestone 3 works.
- **Camera** — fixed isometric over the court (readable, simple) vs. over-shoulder
  third-person (better aim, more work). Start fixed.
- **Aim model** — free 3D aim (mouse pitch+yaw) vs. auto-aim-height with only
  horizontal aim (more arcade, easier). Start with the arcade version.
- **Court layout** — open court, or a low net/wall down the middle like real Dodge Bolt
  for cover? Net adds tactics; start open.

## File sketch

Built in plain `.js` (the state machine was small enough not to need TS):

```
index.html       // #hud, #combat, #score, #overlay
src/
  main.js        // boot + the game-state machine (menu/playing/roundOver/matchOver),
                 //   best-of-N scoring, aim/preview, the frame loop
  round.js       // createRound(): the freeable gameplay "scene" — owns units +
                 //   arrows, step()/lateUpdate()/dispose(), fires onOver(winner)
  overlay.js     // the menu / round-over / match-over modal (buttons + keys)
  physics.js     // Rapier world setup
  court.js       // build floor + center line
  player.js      // unit factory: character controller, handPosition(), dispose()
  arrow.js       // arrow factory + held/flying/grounded machine + solveLaunch()
  input.js       // keyboard / mouse
  ai.js          // enemy state machine (threatened / armed / noArrow)
  render.js      // camera, lights, screenshake
  audio.js       // WebAudio synth cues
  debug.js       // tunables (lil-gui) + leveled log + combat log
```
