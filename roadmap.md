# MOBA feedback roadmap

Feedback collected on 2026-10-08. Unchecked items are goals, not completed work. The UI/gameplay batch is implemented and proved. The combined production check passed: 296 tests, one skipped, no failures; lint, formatting and build passed. Remaining human judgments are card size, Q feel, W balance and the world-art target. The broader project roadmap lives in [docs/roadmap.md](docs/roadmap.md).

## Visual direction

Keep the split Oskar likes: rough sketch drawing with a prototype feel in the game world; crisp UI with thick borders. The drawn line can jitter; movement and animation should stay fluid.

The feel reference is Super Smash Bros. Melee: extremely responsive controls, fast animations and fluid movement. The roughness belongs to the drawing, never to input latency or animation timing. Apply this to the Q casting improvements too.

The supplied League of Legends and Heroes of the Storm screenshots are references for readable HP indicators and combat information, not a target for the game's visual style. Translate their clarity into our sketch drawing and crisp UI.

Use the slowly animating ball-spawn ring at center court as the reference for communicating through the world. The game should "just be": animation, objects and symbols should carry information wherever they fit naturally.

## Lobby

First pass reviewed by Oskar on 2026-10-08: difficulty changes are good; cards are too big, and slot identifiers should be character icons rather than repeated names. Keep the Bot label: it's important. First-pass targeted checks and the full checkpoint check passed.

The adjustment is implemented locally: cards are 1.2× the original, and slots use existing HUD portraits with Bot/You labels. Hero swapping was verified. Oskar's judgment on the revised card size is pending.

- [x] Reduce the enlarged character cards. Try roughly 1.2× the original size; the first 1.5× pass was too big.
- [x] Remove the top-right difficulty label; the difficulty boards already communicate the selection.
- [x] Remove difficulty colors from the boards so they don't get confused with character colors. Keep the selected difficulty readable.
- [x] Use a centered character icon on each of the six slots instead of repeating the character name. Keep Bot/You labels visible and follow the occupant's current character.

## Map introduction

Implemented locally: a subtle court-like orbital cue, five seconds of fully visible map preview after shader readiness/reveal, then a continuous camera landing. Fresh lobby-to-match route and slow-build gate proved: 5.02-second hold, tick zero before play, no camera delta at handoff, input works after landing.

- [x] Replace the loading bar after character selection with a subtle cue integrated into the world or the screen. Explore Moebius-inspired ornamentation; the exact treatment is open.
- [x] Let the side-view introduce the map for a few seconds, roughly five, then animate smoothly into the actual match starting viewpoint as one continuous shot.

## Match visuals and HUD

HP redesign is implemented locally: screen-sized crisp bars, compact minor-unit bars, readable ticks and a local-player accent, following interpolated unit positions. Real combat and desktop/narrow layouts proved; tuning defaults are centralized.

- [x] Redesign the HP indicators, using the supplied League of Legends and Heroes of the Storm screenshots as references for readability while keeping this game's visual style.
- [x] Improve Q casting animations for both Fletcher and Mitts so each cast reads clearly and feels better. Fletcher now pulls and releases a bow; Mitts winds up and snaps the glove forward. Actual keyboard casts captured, with cancel, pocket return, pause, reset and death checked headlessly. Human feel judgment is pending.
- [x] Replace the "OUT!" death marker with something simpler and more symbol-based, with less emphasis on lettering. Implemented as a 1.35 m crossed disc with a two-second fade; actual deaths, team-wipe information and pooled lifecycle proved.
- [x] Fix the round score cogs being clipped at the top and bottom.
- [x] Center the number labels inside the score cogs.
- [x] Add a small minimap. MVP scope: heroes and buildings. Implemented locally with team markers and a local-hero ring; desktop/narrow layouts, movement and marker cleanup proved.
- [x] Follow the actual map footprint instead of enclosing it in a circle. Oskar's 2026-10-08 feedback: the contents are fine; let the map itself float on screen. Implemented locally, desktop/narrow layouts proved; tightly grouped hero markers may still overlap.

## Pause and navigation

- [x] Stack the pause actions vertically and make their meaning clear: Resume and Leave game.
- [x] Replace "Modes" with "Leave game" and remove the direct Hero select action. Navigation should be: leave game → lobby → home.
- [x] Replace the confusing "Esc / B / Start · resume" line with a clear hint for the active input device.

Implemented locally: Resume and Leave game only; replay remains available as Again after a match. Escape/B/Start resume, live hint changes, and leave → lobby → home were proved in one focused session with setup preserved. Targeted checks passed; visual judgment is available through the local preview.

## Mitts gameplay ideas

- [x] Explore W also acting as a shield that absorbs a percentage of incoming damage while active. Set the amount and exact behavior through playtesting. A tunable 25% reduction is implemented locally; active, expired/consumed/disabled windows, other attacks, Ball, death/respawn and a full headless match were proved. Independent code review found no defects; human balance judgment is pending.
- [x] Explore Mitts being able to "save" shots and arrows as well as ball hits. Existing Catch already intercepts hero skillshots: real Fletcher Loose and Mitts Toss were proved before and after the shield change, fully negating damage and filling Pocket. Basics/towers/minions remain outside full interception.

## Debug menu

- [x] Reorganize the `?debug` menu into clear groups and nested sections. Build on the grouping already present in the MOBA debug menu; related options, especially sound settings, should live together.

Implemented locally: heroes/abilities, match/lane, bots/difficulty, presentation/audio, camera/input, front/lobby and engine. Try Mode stays first. Live tuning and lobby → match → lobby → match were proved without missing or duplicate controls. The settled UI checkpoint passed the full check: 296 tests passed, one skipped.

## Working arrangement

If implementation is split across agents, use BB threads in this shared checkout. Don't create worktrees. Keep file ownership clear between threads.

The coordinator maintains instructions, briefs and this checklist; builders implement game code. Start with the lobby cleanup, then take small HUD/feel batches. Keep Mitts gameplay experiments separate from visual changes.

Browser proof stays focused: one session, expand only the changed input or layout axis, and repeat only after a relevant change or failure. Use headless checks for logic. Save full route proofs for checkpoints where navigation or transitions changed.

Ping Oskar when there is something useful to judge. Supply a working local dev URL and minimal route, a screenshot for layout or a short clip for motion, plus one concrete judgment. If automation setup stalls, report the missing proof and make manual review easy. Close the builder's browser afterwards; keep the shared dev server running.

## Art concepts awaiting judgment

The early cream causeway/scalloped-trim pitch has been superseded in the art thread. The current target is our own setting from docs/world.md: the Slab, a schoolyard court on a mesa above a cold dusk desert, with warm low light, the Yard planet, torn edges and chain-link. Heroes are the lost props they carry; towers use sandcastle silhouettes. Keep the lit-stage readability and team discs/inked units.

The art director recommends the warm fight concept K. Oskar's judgment is pending before a world-art build brief. UI/gameplay and the camera intro have progressed separately.

- [ ] Judge concept K as the world/cast target; strengthen team foot discs and unit ink, and cool/pale the court for separation.
- [ ] Check the crowded fight in grayscale before locking the palette.
- [ ] Build the smallest code-drawn world experiment from the chosen target, preserving movement, timing, collisions, map layout and the current lobby.

Proof for that eventual build: one default-match-camera frame with actual combat; side-view intro if cheap. Oskar judges whether the stage reads instantly and units still separate.
