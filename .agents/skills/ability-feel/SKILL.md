---
name: ability-feel
description: Polish how a dodgethis hero's casts, basic attack and abilities move, land and read (windups, hits, dashes, areas), and prove it with a real-input clip. Use whenever a task says feel, juice, snappy, impact, windup, anticipation, ability VFX or animation for a hero or ability, or asks for a cast clip or proof of a kit, even if it doesn't name this skill.
---

# Ability feel

Read `docs/feel-pass.md` (the workshop notes: peer-game lessons, what the kit offers) once, then work in your hero and ability folders. The kit is real code you reuse; there is no parallel VFX system.

## See it: one command

```
bun run cast <hero> [--steps basic,slot1,slot2:miss,slot3:tail=2] [--clip] [--out dir]
```

It boots a fresh Overthrow match, clears the field, stands a target and an ally across the frame, then casts each step through real inputs: the cursor is a real pointer, Q W E R are real key events held then released, the basic is a real right-click. It prints one row per step and writes `cast.json`; with `--clip` also `cast.webm` (`--out` defaults to `$BB_THREAD_STORAGE/cast/<hero>`). Measured on this loaded box (load 30–40): Undine's basic plus Balloon hit and miss with a clip took 50 s, Oolong's whole kit with a clip 194 s (10 s of video); a kit without `--clip` is about a minute. Every step asserts: the press became that action, no denial or cancel, the cast landed where the cursor was, and a `miss` step hit nobody. Read the row for authored times (cast lock, phases, first hit), not the video.

- Aims: `enemy`, `ally` (guessed for Pass, Mend, Ward, Tag out), `self` (stances, channels), `miss`. Override with `slot3:ally`. `gap=<m>`, `hold=<s>`, `tail=<s>` (frames after it settles; field and zone abilities last longer than the 0.5 s default).
- The script stops the page's own animation frames and steps the real app loop tick by tick, so the clip plays at authored speed whatever the load; a plain screen recording on this box runs the sim at about a fifth of real time. Page evaluations die at 30 s, which the script's chunking respects. The caption in the clip says so. It shows the canvas only (no HUD), at the match camera, and measures nothing about FPS, latency or hardware feel.
- Browser work takes the shared lock (`/tmp/dodgethis-capture.lock`) and queues behind others, waiting up to 15 minutes. Wrap your own browser work the same way: `bun run capture -- <command>`; `bun run capture --status` says who holds it. Never `pkill`.
- Reload to see edits: the dev server does not live-reload, and `cast` opens a fresh page each run, so it always sees your latest code.
- Needs a prerequisite state (a pocketed shot for Toss's return, a live Bank for Swap)? Stage it through `dt.game.moba.sim` in a one-off page; `cast` does not set it up. It also cannot show online guests: check a guest's data shapes by reading the snapshot your view consumes.
- Publish a clip as the brief says, usually a folder of your own under `pages/`, never storage paths.

## Where the pieces are

- Hero motion: your `<id>-view.js` `animate(unit, rig, { pose, progress, fire, settle, releasing, time, alpha, costume })`. The integrated heroes use their own coils and releases; `poseWindup(progress)` (quick coil, held taut, small overshoot) and `poseStrike(fire, settle)` (snap past the pose and back) in `src/modes/moba/pose-curve.js` are the shared shapes. The pose name comes from the ability's `effects.pose`. Basics read replicated `unit.attack` (`phase`, `left`, `total`, `startedTick`; backswing also carries resolved `distance`). Instant actions use existing contact or summon-birth cues; there is no universal release hook.
- Ground and light marks: `effects` in `src/modes/moba/effects.js` (`ring`, `spokes`, `streak`, `flare`, `smear`, `column`, `shell`), all opt-in, timed by presentation `dt`, cleared on `reset()`. A tune-only way in: an `impact` recipe in `<id>-tune.js` read by `createImpacts` (rings, spokes, flare, ripples, smear, hold, skid, nudge, shake, number). Look at `balloon-tune.js` and `gloveSlap-tune.js` before inventing one.
- Marks that outlive a cast (zones, summons, fields): an ability view's `extras(scene)` returning `{ update({ summons, groundFields, tick, alpha }), contact?(fact), dispose() }` (see `balloon-view.js`). Build from `tick + alpha`, never wall time; remove everything on a backwards tick (restart) and on `dispose`.
- Per-unit hit feel (flash, squash, skid, hold) goes through `createImpacts`; it moves what is drawn, never the sim. No global hit stop.

## Rules that keep bouncing back in review

- Every danger mark is the true hit area; damaging attacks give at least 0.3 s of warning (a zone may spend part of it in flight); Stop and Cancel interrupt cast points; held movement queues behind them (docs/build-rules.md). A longer windup is a tell, so pose it with a coil rather than adding wait.
- One dominant mark per action. Residue stays quieter than the telegraph and ends with the hitbox.
- Team colour on ownership marks only; flat shapes with ink keylines, translucent ones in the forward layer with `depthWrite=false` (`glowMaterial`). Look in docs/look.md.
- Dispose what you build; use `makeStyleMaterial`, never mutate a shared material.

## Integrated checks

Exercised in integration: `bun run cast kappa --steps basic,slot1,slot1:miss,slot2,slot3 --clip --size 960x540 --out pages/feel-kappa/integrated --budget 300`. The shared runner counts heal facts by `source`, preserves amount/status/contact details and allows resolved target selection to differ from the cursor. It does not stage support damage, an incoming catch, a dead cutout or a crowded fight; the existing proof-folder scripts show those specific setups.

`bun pages/cast-feel/capture.js` stages one four-against-four encounter using the same capture and in-page stepping helpers. Undine uses real pointer and Q/W events, seven ordinary hard bots act around her. It asserts both local casts and at least four casting heroes, then writes the clip and facts. This is a staged fight without HUD, not a match outcome or hardware benchmark. Do not run it for routine edits.

Guest checks must exercise `snapshot({ wire: true })` through `createLaneReplica`, not merely inspect the unpacked snapshot: compact packet columns once discarded dash state. The integrated columns carry grounded, dash time and direction. All eight basics now have a 0.3 s windup; recovery remains cancellable. Stop and Cancel interrupt cast points and basic windups. Movement queues behind cast points, including held RMB, WASD, keyboard walking aim and the pad. Movement can cancel a basic windup; a repeated attack order does not.
