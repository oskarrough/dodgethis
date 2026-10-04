Model: GPT 6.1. After: 01e (Mitts owns sim.js and bots.js).
Goal: the debug panel becomes Heroes of the Storm's Try Mode. The base exists (src/plugins/moba/debug.js, setup.js: pause, step, speed, copy link, respawn, reset cooldowns).

- Toggles: no cooldowns, god mode, minion waves on/off, spawn or clear allied and enemy heroes (pick the hero) and bots, set hero level, reset the match. There is no mana: leave it out. Every toggle round-trips through the deep link.
- Layout: Try Mode on top, grouped; the 30 tune folders collapse under one "tune" group so the panel reads at a glance.
  Files you own: src/plugins/moba/{debug.js,setup.js}, plus small hooks in sim.js for waves, spawn and level.
  Done-check: tests for each toggle and its link round-trip; one 1440 screenshot of the panel.
  Report in 3 lines. Mashed checkpoint commit on `moba` unless other writers are still active; then don't commit.
  Build rules, appended to every build brief. Each one comes from a finding an earlier review caught.

- Everything drawn moves with render interpolation: telegraphs, fills and timers blend with `alpha`, not just bodies.
- Every number lives in the plugin's tune.js, and every slider has a sane range (fractions 0–1, times at least one step). No slider value may produce NaN or reverse movement.
- Cameras, pans and projected points are clamped to the map.
- Each action gets its own sound and effect. Don't reuse another skill's cue, and don't play the same cue twice on one tick.
- Keyboard, mouse and pad get equal treatment: aim cues, cursors and help text cover all three.
- Path and replan work happens once per event, not every tick.
- Update the docs line your change contradicts, and add tests for tricky state (timers, windows, mode toggles).
- Every enemy attack or cast has a visible tell of at least 0.3 s, and every action gets its own pose. No shared squash.
- Input is never swallowed: stop and move cancel windups, and a new order cancels the backswing. A buffered press that can't become legal flashes a deny.
- Tune sliders apply live, or are labelled "applies on restart". HUD text is built from tune, never hard-coded, and written only when it changes.
- Test death and respawn in the middle of every timed state (dash, windup, cast, projectile in flight), and drive dodge tests through intents, not teleports.
- Style materials are opaque ID writes. Anything translucent (telegraph fills, trails) goes in the forward layer with `depthWrite=false`, or uses opaque stipple.
- Per-unit visual state (flash, damage tone) needs a per-object or per-instance channel. Never mutate a shared material or palette role.
- Hot paths get a time-budget test: path planning and per-tick queries must fit well inside a 16.7 ms frame, measured, not assumed.
- Every outcome emits a fact with its own feedback: blocked shots, repeated orders and denied casts included. Nothing vanishes silently.
- Print layers on the ground each get their own height. No z-fighting.
- Art never stretches: scale scenery uniformly and screenshot 390 wide, 1440 and 2560×1080.
- Trace interactions (pointer sweeps, reversals mid-transition), not just idle.
- Tests assert the whole population (all 12 minions arrive), not that some unit did.
- No sim state in module globals; two sims alive at once must not see each other.
- Time-budget tests measure a median or count work, so they don't flake under load.
- Screenshot scripts assert the state they claim (idle is idle, "mid-flight" waits for the flight).
- Previews stage actions across the frame, never straight away from the camera.
- Proof comes from real play fast-forwarded, never injected lethal shots; a match must be able to end in a headless test.
- Ambient or passive facts (trickles, ticks) get no popup or sound; show feedback for the local team only.
- Holding RMB re-sends orders every 100 ms; nothing but stop or cancel may break a windup.
- Ground and effect materials use `{ flat: true }`; unlit shading greys them out.
- Banners and callouts speak relative to the local player ("Enemy", "Your fort"), never team letters.
- Ties are explicit: contested pickups and simultaneous events never fall to list order.
- Never swallow keyup or pointerup; a suspended screen still lets releases through to input.
- The local hero is looked up by participant id, never heroes[0].
- Rasters and canvases are sized in device pixels (× devicePixelRatio).
- Effects and views key on the ability id and read sizes from its stats, never on the Q/W/E slot.
- Proof shots use the real game camera and one shared scale.
- Damage facts carry effective damage (HP actually removed), not attempted damage.
- Bots read every threat (including the Ball) from the lagged view; nothing live but their own body.
- A proof says how it was made: a bots-only fast-forward proves nothing about a human playing.
- Proof screenshots start from a fresh `/`, the way a player arrives, not from a deep link.
