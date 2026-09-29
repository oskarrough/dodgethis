# Plugin architecture

The contract for [core-split.md](core-split.md). The MOBA side is in [moba-plan.md](moba-plan.md).

## The architecture

1. A plugin is `function (app) { … }`. Everything it registers through `app` is removed when `app.signal` (an `AbortController` signal) aborts; it may return a cleanup for anything else. Keyed registrations throw on duplicates.
2. The loop runs five fixed phases: `input` → `intents` → `simulate` (fixed 1/60 s, only when `session.authoritative` and not paused) → `replicate` → `present` (gets `alpha`). Plugins attach with `app.system(phase, fn)`.
3. Devices produce intents. There is one plain frame per participant per step: `{ move, order, aim, held, pressed: [{ action, at }], released }`. The actions are `primary dash jump stop cancel slot1–slot5`. The mode declares a scheme (`direct` or `pointClick`) that binds devices to this vocabulary. Modes read `app.intents.get(participantId)` and never touch devices. When one step sees an action both pressed and released, `held` says which came last. An `order` point is an edge too: it stays until a step has seen it, so a 144 Hz screen cannot drop one between steps.
4. Plugins define modes: `app.modes.define(id, { scheme, start(run, { roster, options }) })`. One runs at a time, and `run` is a scope that is disposed on stop.
5. `start` returns `{ epoch, snapshot(), apply(state, now), validFact(fact) }`. State is opaque plain JSON. `apply` validates everything before changing anything. A non-authoritative run builds no bodies and interpolates with the core's `createSnapshotBuffer`.
6. `app.session` is `{ local, authoritative, shared, actions }`, set by `app.modes.start(id, { roster, options, session })` and solo by default; `actions` lists the session verbs the local player may use (`pause restart cheat`). A mode may read those four and nothing else about the people around it; "online" never appears in a mode.
7. Events: `app.present(fact)` for gameplay facts (plain data; online replicates these), plus core `menu`, `blur` and `session`. There are no other events and no service registry.
8. Core services are fields on `app`: `scene world clock input intents smooth camera audio overlay debug session modes`. `camera.frame(fn)` takes mode framing, `clock.scale(fn)` takes hitstop (ignored when shared), and `debug.tune/cheat/expose` fill the GUI and `window.game`. The shell also passes `RAPIER` (modes build their bodies with `core/body.js`), `renderer` and `setPalette`.
9. Online owns everything network: seats of remote intents (fed with `app.intents.feed`), the `{ matchId, epoch, seq, state, facts }` envelope at 20 Hz, dedupe and timeouts. It calls only the four members from line 5, and restarts whichever mode is running rather than naming one.
10. `src/core/` imports nothing from `src/plugins/`, and no plugin imports another. `tests/boundaries.test.js` enforces this.

Layout: `src/main.js` (composition only), `src/core/`, `src/plugins/dodgeball/`, `src/plugins/online/`, later `src/plugins/moba/`. Tune data stays a plain module object per plugin, so tests import it directly.

## Settled

- `feedback.js`: core gets a juice kit of verbs (`burst`, `mark`, `flash`, `retire`). Each mode keeps its own fact-to-verb switch. It moves into dodgeball whole for now and is extracted at moba M1.
- Camera: core owns the rig, shake, FOV kick and the unshaken aim camera. The mode supplies `frame(dt) → { eye, target }`, applied to both cameras, with shake applied to the render camera only.
- Unit visual: it lives on the core body (root `mesh`, a cosmetic `visual` child, a default mannequin). Loadouts parent their parts to `visual`.
- Hub: it stays dodgeball's menu until moba needs a portal, then becomes a tiny plugin that renders entries registered by modes. Until then moba boots with `?mode=moba`.
- Oskar's calls: one input path for solo and online humans; `shared` as the single social flag; each mode owns its replica; movement feel is a per-mode tune value; no talents in the MVP; pad casts hold to aim and release to fire.

## Splitting player.js

`src/core/body.js` owns the capsule; `src/plugins/dodgeball/loadout.js` decorates it. Dodgeball's `unit.js` keeps exporting `createPlayer` with today's unit shape, so `round.js`, `ai.js` and the tests don't notice.

| Core body                                                                       | Dodgeball loadout                                     |
| ------------------------------------------------------------------------------- | ----------------------------------------------------- |
| sim pose (`position`, `yaw`) and render root `mesh` + `visual` child            | bow, hand, team badge                                 |
| mannequin: capsule, nose, feet, stride                                          | `heldArrow`, `weapon`, charge meter, `windup` value   |
| kinematic body, collider, character controller                                  | `hp`, `maxHp`, `damage()`                             |
| `move.js` with a movement profile passed at creation, and a per-unit `speedMul` | `handPosition()`                                      |
| gravity, jump + coyote, `dash(dir, { distance, time })`                         | `react(fact)`: which facts kick which spring          |
| springs: lean, `kick`, `squash`, a generic `windup` pose input                  | armed pose from `windup`                              |
| `face`, `place`, `retire()`; replica variant with no physics                    | `eliminate()` grounds the held arrow, then `retire()` |
| `bounds` option (dash clamp) instead of importing `arena.js`                    | passes `arena.bounds`                                 |

`tune.player` becomes dodgeball's movement profile, and moba brings its own near-instant one.

## Solo render interpolation

Today `sync()` copies body poses into meshes at 60 Hz, so a 144 Hz screen judders, and a follow camera would make the whole world judder. The fix is core and lands before moba.

- `app.smooth(object3d, read)` registers a rendered object. After every `simulate` step the core calls `read()` to capture the sim pose (position and quaternion), moving the old one to `prev`. At the start of `present` it poses the object at `lerp/slerp(prev, curr, alpha)`, where `alpha = acc / STEP`. A new registration starts at its sim pose; `app.smooth.snap(object3d)` handles teleports and deaths, and `clock.reset()` snaps everything.
- The core body registers its own `mesh`. Dodgeball registers each arrow's `mesh` and `ball`. Minions and projectiles are moba's.
- Held arrows, the aim preview, blob shadows and footstep springs read the rendered pose in `present`.
- Follow framing reads rendered positions and then smooths them; dodgeball's fixed framing is unaffected.
- Replicas don't register; `createSnapshotBuffer` already poses them.
- Hazard: gameplay must stop reading render transforms. `unit.position`, the replica's `yaw` (today `mesh.rotation.y`), `arrow.position` and `ground()` all read the sim pose after the split.
- Cost: up to one step (16.7 ms) of visual lag. That is accepted.
- Test: a headless loop at 1/144 s frames with a unit at constant velocity. Per-frame rendered displacement must stay within 5% of constant.

## Migration

Each phase moves things in bulk, then repairs; tests may be red inside a phase. Every phase must end with:

- `bun run check` green
- solo unchanged: hub, portals, a full match, pause, restart, cheats, `game.preset`
- online unchanged: the two-browser checks in [verification.md](verification.md), run with `agent-browser`

Before starting, add two characterization tests against today's code: a scripted solo round that records every shot's speed, direction and landing, and a host-plus-guest round that records the fact stream and final positions.

- A. Carve. Move files to `src/core/`, `src/plugins/dodgeball/` and `src/plugins/online/` (`replica.js` goes to dodgeball), then fix imports in `src` and `tests`. Add the boundary test with an allowlist of today's violations. That allowlist is the burn-down for B–D.
- B. Kernel. Write `core/app.js` (signal scopes, phases, events, modes, a solo-only session, clock, keyed registration) with DOM-free tests. Empty `main.js` into its owners. Dodgeball gets its fact router, scoreboard/HUD, aim preview, cheats and `window.game`, and registers as a mode. Split `tune.js`. Online keeps today's flow swap as a legacy block in its `index.js`; the swap needs dodgeball's round services, so until D the two meet in `app.legacy`, the one exception to line 7.
- C. Intents and body. Write `core/intents.js` with the `direct` scheme, edge buffering (dash and jump 0.1 s), cancel/suspend and `validIntent`. Write dodgeball's `actions.js` from `online-match.js`'s per-seat loop and route solo humans through it. Split `player.js` as above, with movement profiles and per-call dash. Add render interpolation. The legacy online block maps frames onto today's input packet, so the wire doesn't change. The characterization tests may shift by at most one step.
- D. Online. Put `replica.js` behind `snapshot/apply/validFact`, extracting `core/snapshot-buffer.js`. Move `online-match.js`'s dodgeball half (match rules, result cards, arrow count, charge meters) into dodgeball's flow, driven by `session`. The rest becomes `plugins/online/link.js`. Switch the wire to intent frames plus envelopes, bump `PROTO`, and delete every `onlineMatch`/`online.active` branch. Exit when the allowlist is empty and `grep -rE "online|peer|lobby" src/plugins/dodgeball` finds nothing. Done: rosters lost `peerId` (a human's id is its owner) and the hub round's `lobby` flag became `hub`. The online characterization moved only in coordinates, by 0.9 mm at the median, because the old wire's 1/60 s throttle dropped a third of the scripted frames to float jitter.

Landed with moba M1: the `pointClick` scheme, `input.stickAim` (the kernel hands the newest live one to the device), follow framing (`camera.frame`), the juice kit (`core/juice.js`, with `death.js` as its `retire`), and hiding the court (`court.setShown`). The hub plugin is still to come.

## Answers to moba-plan.md's assumptions

1. Per-mode bindings: confirmed. The mode declares a scheme; the core owns the bindings.
2. Pointer picking: confirmed. Core gives the cursor's ground point, hover highlight is mode presentation, and intents carry only points.
3. Right mouse: confirmed. `pointClick` adds RMB held state and `contextmenu` suppression, and re-sends `order` every 100 ms while RMB is held.
4. Twin-stick: confirmed with one change. The mode supplies `input.stickAim((dir, magnitude, slot) → point)`, so range, remap and aim assist stay in moba.
5. Body parameters: confirmed. The body takes a movement profile at creation, a per-unit `speedMul` (mount, slow, levels) and `dash(dir, { distance, time })`. Cooldowns belong to the mode.
6. Render interpolation: confirmed. It's in core in phase C. `present` gets `t.alpha`, but the core poses registered objects itself.
7. Camera: confirmed. The aim camera follows the smoothed framing without shake.
8. Impact beat: confirmed. `clock.scale(fn)` is ignored in shared sessions.
9. Bots emit intents: allowed, not required. A mode may write frames for its bot participants into `app.intents` inside `simulate`; online never sees them. Dodgeball keeps its brains.
10. Juice kit: confirmed, as verbs. Near-miss detection stays per mode.

Where the plan's integration section differs from this doc:

- Intent shape: `moveTo` and `order` merge into one `order` point, which moba resolves to move or attack, because the device adapter can't see units. `moveDir` is `move`. A cast is a `pressed` edge whose `at` holds the aim at that moment. The mapping is Q/W/E/R → `slot1`–`slot4`, mount → `slot5`, attack → `primary`, S → `stop`, pad B → `cancel`.
- Pad hold-to-release: `pointClick` emits a slot's press edge when the button is released, using the release aim. `held.slotN` means "aiming", for the indicator. So moba sees one cast rule for both devices.
- There are no mode systems in `input`. Order and cast buffering happen in `simulate`, from intents; on a guest an `input`-phase system would run on the wrong machine. The core buffers edges per action with windows the scheme sets (slots 0.15 s). "Latest press wins" is moba's rule.
- Moba's `cast`, `hit`, `death`, `levelUp` and the rest are `present` facts with a `type`, not new core events. Online replicates them.
- Pathing, carrot pursuit and arrival belong to moba. The body takes a wish vector plus a max speed.
- Minions as non-Rapier agents and projectiles as swept circles are fine. They register with `app.smooth` like anything else.
- Snapshot size: the contract stays full snapshots, and quantising inside the state is free. If M6 needs deltas, add `snapshot(sinceSeq)` then, with online supplying the guest's last acked `seq`.
- M6 prediction: it relaxes "replicas build no bodies" to "a replica may predict its local unit". That gets designed at M6, not now.
- The plan's `app.snapshot.register`, `app.bindings.use` and hand-collected `off` list become `modes.define`, `scheme` and `app.signal`.
