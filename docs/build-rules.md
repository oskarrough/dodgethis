Build rules. Each one comes from a finding an earlier review caught. A brief quotes the one to three lines that bear on it, never a whole section.

## Everyone

Discoverable names. Agents find code by plain-text search, so every identifier is a search query.

- One concept, one spelling. A thing has one name across code, docs and output (simulation, not run or tape; `heroId`, not `hero` here and `heroName` there). Reuse the codebase's words.
- Exported symbols carry a domain word: `heroFromManifest`, not `build`; `listedHeroes`, not `list`. The folder isn't the context: `users/diff.js` and `orders/diff.js` both grep as `diff`.
- No bare-role filenames (`utils.js`, `helpers.js`, `types.js`). In a registered folder (`heroes/<id>/`, `abilities/<id>/`, `mechanics/<id>/`, `maps/<id>/`), the three conventional filenames are `<id>.js`, `<id>-tune.js`, `<id>-view.js`. Every helper filename also carries the id; its role is the author's.
- Keep strings whole: fact names, bot goals, tune keys, `--ui-*` tokens and error messages are never built from templates. An error message starts with a unique literal so a log line greps back to its throw site.
- One definition site per symbol: move, don't copy, and rename in the same commit as the behaviour change.
- A new fact type gets an entry in `index.js` `FACTS`, or guests drop every packet carrying it. Facts carry plain objects, not arrays (`validFact` rejects arrays); use keyed objects for collections.

A surgical edit outside your owned files (a setter, an export, a hook) is fine without asking; name it in the report.

- When the user's judgment is useful, report the actual local dev URL and shortest route plus one specific thing to judge. The coordinator pings them; don't leave review hidden in a long completion report.
- A proof says how it was made: a bots-only fast-forward proves nothing about a human playing.
- Every number lives in the mode's tune.js, and every slider has a sane range (fractions 0–1, times at least one step). No slider value may produce NaN or reverse movement.
- Tune sliders apply live, or are labelled "applies on restart". HUD text is built from tune, never hard-coded, and written only when it changes.
- Update the docs line your change contradicts.
- App-wide and run-owned debug APIs share one namespace: check both registrations before renaming a key, keep duplicate protection, and prove unregister/re-entry. Scope helpers by action or mode so a lobby object cannot collide with a lobby action.
- The local hero is looked up by participant id, never heroes[0].
- Browser work follows `docs/verify.md`. Never `pkill` anything; you share the box.

## Sim, bots and net

- Every enemy attack or cast has a visible tell of at least 0.3 s, and every action gets its own pose. No shared squash.
- Input is never swallowed: stop and cancel interrupt cast points and basic windups; cancelled cast points refund to the cancellation lockout. Movement queues behind cast points, so held walking aim and RMB resends cannot cancel them. Movement can cancel a basic windup, and a new order cancels its backswing. A buffered press that can't become legal flashes a deny.
- Holding RMB re-sends orders each simulation step; repeated attack orders preserve the basic windup.
- Every outcome emits a fact with its own feedback: blocked shots, repeated orders and denied casts included. Nothing vanishes silently.
- Damage facts carry effective damage (HP actually removed), not attempted damage.
- A sim hook's event fields keep the same types at every dispatch site: aim points and target units have separate fields.
- Ties are explicit: contested pickups and simultaneous events never fall to list order.
- Path and replan work happens once per event, not every tick.
- No sim state in module globals; two sims alive at once must not see each other.
- Bots read every threat (including the Ball) from the lagged view; nothing live but their own body.
- Test death and respawn in the middle of every timed state (dash, windup, cast, projectile in flight), and drive dodge tests through intents, not teleports.
- Tests assert the whole population (all 12 minions arrive), not that some unit did.
- Proof comes from real play fast-forwarded, never injected lethal shots; a match must be able to end in a headless test.
- Prove "never triggers" cases with real aim points (where a player's cursor lands on a body), not exact centres.
- Hot paths: path planning and per-tick queries must fit well inside a 16.7 ms frame, measured as a median or a work count so it doesn't flake under load.
- On a guest, anything that only resolves in the host's sim step (shots, picks, orders to a mark) goes to the host as intent or is disabled with a deny; never leave the guest waiting on a step that never runs. Facts queued while a tab is hidden are dropped once stale, not replayed in a burst.
- Validate a room handoff against the host's map contract, not the guest's previous solo map. Party readiness confirms a replicated roster revision; reject stale Ready intents after edits, including those already on the wire.
- Rate limits use a token bucket, not a fixed window: a reliable channel delivers a stall's backlog at once, and that must drain, not lock the player out.

## View, UI and screens

- For MOBA concept art and terrain, read the Concept art recipe in [look.md](../../docs/look.md) and use our nouns from [world.md](../../docs/world.md). Judge the crowded fight as well as the establishing shot.
- A debug folder is named for its tune key (`bots/easy` for `tune.bots.easy`); `debugPath` in `sliders.js` puts top-level keys into a group (abilities, hero, lane, controls, feel). Restart-only terrain controls must rebuild both visible geometry and its depth geometry, and keep walking bounds safe across their slider ranges.
- Everything drawn moves with render interpolation: telegraphs, fills and timers blend with `alpha`, not just bodies.
- Keyboard, mouse and pad get equal treatment: aim cues, cursors and help text cover all three.
- Never swallow keyup or pointerup; a suspended screen still lets releases through to input.
- Each action gets its own sound and effect. Don't reuse another skill's cue, and don't play the same cue twice on one tick.
- Ambient or passive facts (trickles, ticks) get no popup or sound; show feedback for the local team only.
- Banners and callouts speak relative to the local player ("Enemy", "Your fort"), never team letters.
- Effects and views key on the ability id and read sizes from its stats, never on the Q/W/E slot.
- Style materials are opaque ID writes. Anything translucent (telegraph fills, trails) goes in the forward layer with `depthWrite=false`, or uses opaque stipple.
- Ground and effect materials use `{ flat: true }`; unlit shading greys them out.
- Per-unit visual state (flash, damage tone) needs a per-object or per-instance channel. Never mutate a shared material or palette role.
- Print layers on the ground each get their own height. No z-fighting.
- Rasters and canvases are sized in device pixels (× devicePixelRatio).
- Art never stretches: scale scenery uniformly.
- Cameras, pans and projected points are clamped to the map. A camera that doesn't follow shows every place the player can walk.
- Previews stage actions across the frame, never straight away from the camera.
- Hand-offs between screens pass live resources (backdrop, map, current pick) along; never rebuild one while the old copy still listens.
- A new screen or mode handles shared sessions or refuses them with a notice; a guest never sits on a frozen screen.
- Proof screenshots use the real game camera and assert the state they claim (idle is idle, "mid-flight" waits for the flight). Start from a fresh `/` when proving the route; targeted visual fixes may use a direct setup and must say how they got there.
- Trace interactions (pointer sweeps, reversals mid-transition), not just idle.
- A new fact type gets an entry in `src/modes/moba/index.js` `FACTS`, or online guests drop every packet carrying it.
- Tunes may be prototype copies (`Object.create(tune.x)`, e.g. moba `index.js` `cameraTune`): never `{ ...t }` one, which keeps only own keys; override with `Object.assign(Object.create(t), { … })`.
