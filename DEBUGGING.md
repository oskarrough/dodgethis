# Reproduce a match and measure performance

Start `bun run dev`, then press the backtick key to toggle the debug panel,
diagnostics, and browser-console API. The panel's **shortcuts** folder lists the
live controls. A bare `?debug` opens diagnostics without starting a match.

To launch a fixture directly, open the URL Vite prints with
`?debug=20v20&seed=42&godmode=1`. This creates one human plus 19 allies against
20 enemies. Godmode protects only the human; bots still fight and die.
The debug GUI also has a “Start 20v20” button under cheats.

For a busy ammo fixture, use `?debug=crowd`. For an exact starting frame, append
`&paused=1`. Custom sizes work with, for example,
`?debug=1&teamA=5&teamB=12&arrows=20&seed=17&ai=0&paused=1`.
Validation and the available presets live in [scenario.js](src/plugins/dodgeball/scenario.js).
Invalid setup parameters are logged and leave the hub available. The URL only sets up the
first run; returning from an online match lands in the hub.

## Inspect and reproduce a bug

`window.game` is available on the dev server, or in a production build when
`?debug=...` is present. Run these in the browser console:

```js
game.preset('20v20', { seed: 17, paused: true })
game.step(60) // one second of real AI and Rapier, with no human input
game.snapshot() // serializable roster, positions, ammo states and score
game.pause(false)
game.restart() // keeps team sizes, ammo count and seed
```

The physics folder has pause controls; “Step one tick” under cheats pauses and
advances one tick. `game.preset('roundOver')`, `game.preset('matchOver', { winner: 'B' })`
and `game.hub()` directly exercise the UI states. Result presets stage the UI;
to reproduce the deciding collision, arrange a playing round and single-step it.

For precise contact/fall fixtures, use the live round's existing actions:

```js
game.preset('duel', { paused: true, ai: false })
const enemy = game.round.units.find((u) => u.team === 'B')
enemy.place(0, 1.01, -2) // physics and mesh together; clears movement velocity
game.round.human.place(0, 1.01, 2)
game.round.looseHuman({ x: 0, z: -1 }, 10, { kind: 'bowl' })
game.step(60)
```

Use `unit.eliminate()` for roster fixtures, `round.addUnit(team)` /
`round.removeUnit(team)` for live roster editing, and `game.tune` for live knobs.
Read [round.js](src/plugins/dodgeball/round.js) and [unit.js](src/plugins/dodgeball/unit.js) for the actions.
Keep fixture scripts rather than cached entity references: restarting disposes the
old round. Snapshots are inspection output, not a full Rapier save/restore format.
Seeds repeat AI and ammo decisions with identical fixed ticks and inputs;
visual effects, browser frame scheduling and globally increasing IDs are independent.

## Inspect an online match

Online restarts the mode under a shared session, which withholds pause, restart and
cheats: `game.preset`, `game.step`, `game.hub` and `game.restart` refuse or do nothing,
and the debug panel is inert. What stays useful:

```js
game.online.state // the lobby: code, humans, bots, phase
game.link.stats // host: envelopes and bytes sent, intents seated; guest: envelopes applied
game.round.brains.length // bots think only on the host; a guest has none
game.snapshot() // same shape on both sides, for comparing host and guest
```

To test the wire without browsers, [tests/shared-match.js](tests/shared-match.js) wires a
host and a guest the way the browser does and delivers their messages by hand;
[tests/link.test.js](tests/link.test.js) shows how to script both sides. The two-browser
checks are in [docs/verification.md](docs/verification.md).

## Measure a regression

On a visible tab on a 144 Hz display, at the same viewport and device pixel ratio:

```js
game.preset('20v20', { seed: 42, godmode: true })
const report = await game.benchmark({ warmup: 2, seconds: 10 })
console.log(JSON.stringify(report, null, 2))
```

The report includes actual frame intervals, CPU simulation/presentation/render
submission times, mean/p95/max, roster snapshots, viewport, draw calls across all
render passes, and GPU resource counts. History is bounded to the latest 1,800
frames. The HUD displays FPS and CPU p95 when profiling is enabled.
`game.perf.enabled = false` disables collection; `game.perf.reset()` starts a
fresh window. The benchmark enables collection automatically.

144 FPS gives the complete frame about 6.94 ms. CPU `render` is WebGL submission
time, not GPU execution time. A low CPU time alone does not prove 144 FPS.
Keep the tab visible and compare live-player counts; a mostly eliminated team
is a lighter workload. Check both ordinary matches and `crowd`, plus repeated
restarts for growing resource counts. Use the browser performance profiler when
CPU time is high, and check GPU/render resolution when frame time is high but CPU
is low. Software-rendered headless Chromium cannot establish hardware FPS.

Run `bun run profile:dodgeball` or `bun run profile:dodgeball crowd 17` for a browser-free CPU comparison.
It runs real Rapier and AI through three fresh seeded rounds and reports the live
roster before and after each window. It excludes rendering and must not be reported
as FPS. Run `bun test` and `bun run build` after gameplay changes.

Spawn spacing and free-space selection live in [arena.js](src/plugins/dodgeball/arena.js).
Avoid overlapping kinematic capsules: crowded penetration queries are expensive.
The flat court needs no character-controller stair climbing. All players retain
Rapier collision, sliding, projectile contacts and gravity. Drop shadows use one
instanced draw in [shadows.js](src/core/shadows.js).
