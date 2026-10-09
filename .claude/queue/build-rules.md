Build rules. Each one comes from a finding an earlier review caught. The orchestrator appends "Everyone" plus the section that matches the brief: "Sim, bots and net" or "View, UI and screens". A brief that spans both gets both.

## Everyone

No new unit tests for now (user, 2026-10-04): prove a change by playing it, in a headless match or a browser trace. Keep the existing suite green; delete a test rather than nurse it when a deliberate change makes it obsolete. Rules below that ask for tests mean a quick proof. A surgical edit outside your owned files (a setter, an export, a hook) is fine without asking; name it in the report.

- Prove the change once: one device and one width, unless input or layout is the change. Then prove that axis, and only that one.
- Keep browser proofs short and relevant: reuse the shared server, go to the screen changed, capture one useful layout screenshot or motion clip, then close your session. Full route proof belongs to a navigation/transition checkpoint, not every builder. If automation setup stalls, report the gap and give a working URL for manual review.
- When the user's judgment is useful, report the actual local dev URL and shortest route plus one specific thing to judge. The coordinator pings them; don't leave review hidden in a long completion report.
- A proof says how it was made: a bots-only fast-forward proves nothing about a human playing.
- Every number lives in the plugin's tune.js, and every slider has a sane range (fractions 0–1, times at least one step). No slider value may produce NaN or reverse movement.
- Tune sliders apply live, or are labelled "applies on restart". HUD text is built from tune, never hard-coded, and written only when it changes.
- Update the docs line your change contradicts.
- App-wide and run-owned debug APIs share one namespace: check both registrations before renaming a key, keep duplicate protection, and prove unregister/re-entry. Scope helpers by action or mode so a lobby object cannot collide with a lobby action.
- The local hero is looked up by participant id, never heroes[0].
- Browser work follows the "Browser proofs" lines in AGENTS.md: shared agent server, your own browser session, waits on conditions. Never `pkill` anything; you share the box.

## Sim, bots and net

- Every enemy attack or cast has a visible tell of at least 0.3 s, and every action gets its own pose. No shared squash.
- Input is never swallowed: stop and move cancel windups (a windup is any cast point or basic-attack windup; a cancelled cast point refunds its cooldown), and a new order cancels the backswing. A buffered press that can't become legal flashes a deny.
- Holding RMB re-sends orders every 100 ms; nothing but stop or cancel may break a windup.
- Every outcome emits a fact with its own feedback: blocked shots, repeated orders and denied casts included. Nothing vanishes silently.
- Damage facts carry effective damage (HP actually removed), not attempted damage.
- Ties are explicit: contested pickups and simultaneous events never fall to list order.
- Path and replan work happens once per event, not every tick.
- No sim state in module globals; two sims alive at once must not see each other.
- Bots read every threat (including the Ball) from the lagged view; nothing live but their own body.
- Test death and respawn in the middle of every timed state (dash, windup, cast, projectile in flight), and drive dodge tests through intents, not teleports.
- Tests assert the whole population (all 12 minions arrive), not that some unit did.
- Proof comes from real play fast-forwarded, never injected lethal shots; a match must be able to end in a headless test.
- Prove "never triggers" cases with real aim points (where a player's cursor lands on a body), not exact centres.
- Hot paths get a time-budget test: path planning and per-tick queries must fit well inside a 16.7 ms frame, measured as a median or a work count so it doesn't flake under load.
- On a guest, anything that only resolves in the host's sim step (shots, picks, orders to a mark) goes to the host as intent or is disabled with a deny; never leave the guest waiting on a step that never runs. Facts queued while a tab is hidden are dropped once stale, not replayed in a burst.
- Rate limits use a token bucket, not a fixed window: a reliable channel delivers a stall's backlog at once, and that must drain, not lock the player out.

## View, UI and screens

- For MOBA concept art and terrain, read the Concept art recipe in [moba-look.md](../../docs/moba-look.md) and use our nouns from [world.md](../../docs/world.md). Judge the crowded fight as well as the establishing shot.
- New MOBA debug folder names must be listed in `debugSections` (`sliders.js`), or the grouped panel hides them. Restart-only terrain controls must rebuild both visible geometry and its depth geometry, and keep walking bounds safe across their slider ranges.
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
