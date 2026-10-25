# Art week

A week (from 2026-10-25) to bring the match look close to the Reference shelf, one map at a time. Arbe judges, Astra (GPT-6 Astra threads) paints target frames and builds. Oskar sees a before/after per beat.

## How each job runs

1. **Target.** Astra paints over a real match-camera screenshot in the ink direction (flat colour, navy line, hatching, glow allowed). Oskar picked ink over painted and hybrid on 2026-10-25 (`pages/art/altamesa-targets/`).
2. **Build.** One Astra thread per job, owning a named set of files; jobs run in parallel only when their files don't overlap.
3. **Judge.** Arbe compares the build to the target at 1600×900, sends it back with concrete notes or accepts it, runs `bun run check` and `bun run test`, and pushes a checkpoint.
4. **Show.** A before/after for Oskar at each real step.

## The bar

Hold a match screenshot beside the target frame. It passes when the court is clearly the lightest plate, the surround is crowded and drawn, the light has a direction, and telegraphs and units are still the loudest marks. Every screenshot is taken at the shipped match camera, never a tweaked one.

## Plan

Day 1 (done): Altamesa light, rim ruins and dead trees, carved flower walls; the shared carving kit; glow; Flagfall by night; floor decals on both; carved towers and cores with damage stages. Astra works in one standing thread (thr_6y3iwcf5f5) so it keeps the code in its head; painting-only jobs may go to a second.

1. ~~**Altamesa finish.**~~ (done but the sundial inlay) Rim ruins that read as ruins (carved, broken, overgrown) instead of boxes; overgrowth thinned so the carving shows; sun bloom in the haze; the pillars carved to match the walls; Gnomon's sundial inlay.
2. ~~**Glow pass (engine).**~~ (done; impacts and lanterns still to opt in) A soft bloom for things that emit light (Ball, crystals, lanterns, ability impacts) with a threshold that never lifts the court; shared by every map.
3. ~~**Flagfall by night.**~~ (done) Target frame from the blue-beast and night-castle refs, then build: a deeper moon, glowing night garden, moonlit carved stone, Hinge-style poured water.
4. **Overthrow.** Its own direction: a target pair for Oskar to pick from, then build.
5. **Units.** A target sheet for the cast in the ink direction (heft, wear, one hard angle), then a pass on hero meshes. Silhouettes and sizes are fixed.
6. **Hatching on scenery.** World-anchored ink hatching on cliffs and walls only, if the targets still call for it after 1–5.

Each step ends in a pushed checkpoint and a before/after.
