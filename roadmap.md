# MOBA feedback roadmap

Feedback collected on 2026-10-08. Unchecked items are goals, not completed work. The UI/gameplay batch landed on main in f921797d and is live. Oskar's first post-deployment feedback: "lol its super good". The combined production check passed: 296 tests, one skipped, no failures; lint, formatting and build passed. The first lobby terrain pass is live: pale chalk-marked tarmac and stepped sandstone/violet rock over a dusk desert. The approved DodgeThis home title is live too. Oskar’s terrain judgment is next. Oskar accepted Mitts' 25% damage reduction on 2026-10-09; further card/feel tweaks can follow concrete feedback. The broader project roadmap lives in [docs/roadmap.md](docs/roadmap.md).

## Visual direction

Keep the split Oskar likes: rough sketch drawing with a prototype feel in the game world; crisp UI with thick borders. The drawn line can jitter; movement and animation should stay fluid.

The feel reference is Super Smash Bros. Melee: extremely responsive controls, fast animations and fluid movement. The roughness belongs to the drawing, never to input latency or animation timing. Apply this to the Q casting improvements too.

The supplied League of Legends and Heroes of the Storm screenshots are references for readable HP indicators and combat information, not a target for the game's visual style. Translate their clarity into our sketch drawing and crisp UI.

Use the slowly animating ball-spawn ring at center court as the reference for communicating through the world. The game should "just be": animation, objects and symbols should carry information wherever they fit naturally.

## Home title

- [x] Redesign the home title at Oskar’s direct request: one word, DodgeThis, with the gold Ball as the first “o”, occasional letter dodges and Ball glints. Reduced motion keeps it still. Approved and landed in `a0853646`; desktop/phone checks and home-screen tests passed. Mode names stay unchanged.

## Lobby

First pass reviewed by Oskar on 2026-10-08: difficulty changes are good; cards are too big, and slot identifiers should be character icons rather than repeated names. Keep the Bot label: it's important. First-pass targeted checks and the full checkpoint check passed.

The adjustment landed on main: cards are 1.2× the original, and slots use existing HUD portraits with Bot/You labels. Hero swapping was verified. The shipped batch received positive first feedback; adjust card size further only if play reveals a problem.

- [x] Reduce the enlarged character cards. Try roughly 1.2× the original size; the first 1.5× pass was too big.
- [x] Remove the top-right difficulty label; the difficulty boards already communicate the selection.
- [x] Remove difficulty colors from the boards so they don't get confused with character colors. Keep the selected difficulty readable.
- [x] Use a centered character icon on each of the six slots instead of repeating the character name. Keep Bot/You labels visible and follow the occupant's current character.

## Map introduction

Landed on main: a subtle court-like orbital cue, five seconds of fully visible map preview after shader readiness/reveal, then a continuous camera landing. Fresh lobby-to-match route and slow-build gate proved: 5.02-second hold, tick zero before play, no camera delta at handoff, input works after landing.

- [x] Replace the loading bar after character selection with a subtle cue integrated into the world or the screen. Explore Moebius-inspired ornamentation; the exact treatment is open.
- [x] Let the side-view introduce the map for a few seconds, roughly five, then animate smoothly into the actual match starting viewpoint as one continuous shot.

## Match visuals and HUD

HP redesign is implemented on main: screen-sized crisp bars, compact minor-unit bars, readable ticks and a local-player accent, following interpolated unit positions. Real combat and desktop/narrow layouts proved; tuning defaults are centralized.

- [x] Redesign the HP indicators, using the supplied League of Legends and Heroes of the Storm screenshots as references for readability while keeping this game's visual style.
- [x] Improve Q casting animations for both Fletcher and Mitts so each cast reads clearly and feels better. Fletcher now pulls and releases a bow; Mitts winds up and snaps the glove forward. Actual keyboard casts captured, with cancel, pocket return, pause, reset and death checked headlessly. The shipped batch received positive first feedback; further feel tuning follows play.
- [x] Replace the "OUT!" death marker with something simpler and more symbol-based, with less emphasis on lettering. Implemented as a 1.35 m crossed disc with a two-second fade; actual deaths, team-wipe information and pooled lifecycle proved.
- [x] Fix the round score cogs being clipped at the top and bottom.
- [x] Center the number labels inside the score cogs.
- [x] Add a small minimap. MVP scope: heroes and buildings. Landed on main with team markers and a local-hero ring; desktop/narrow layouts, movement and marker cleanup proved.
- [x] Follow the actual map footprint instead of enclosing it in a circle. Oskar's 2026-10-08 feedback: the contents are fine; let the map itself float on screen. Landed on main, desktop/narrow layouts proved; tightly grouped hero markers may still overlap.

## Pause and navigation

- [x] Stack the pause actions vertically and make their meaning clear: Resume and Leave game.
- [x] Replace "Modes" with "Leave game" and remove the direct Hero select action. Navigation should be: leave game → lobby → home.
- [x] Replace the confusing "Esc / B / Start · resume" line with a clear hint for the active input device.

Landed on main: Resume and Leave game only; replay remains available as Again after a match. Escape/B/Start resume, live hint changes, and leave → lobby → home were proved in one focused session with setup preserved. Targeted checks passed; visual judgment is available through the local preview.

## Mitts gameplay ideas

- [x] Explore W also acting as a shield that absorbs a percentage of incoming damage while active. Set the amount and exact behavior through playtesting. A tunable 25% reduction is implemented on main; active, expired/consumed/disabled windows, other attacks, Ball, death/respawn and a full headless match were proved. Independent code review found no defects; Oskar accepted the shield on 2026-10-09.
- [x] Explore Mitts being able to "save" shots and arrows as well as ball hits. Existing Catch already intercepts hero skillshots: real Fletcher Loose and Mitts Toss were proved before and after the shield change, fully negating damage and filling Pocket. Basics/towers/minions remain outside full interception.

## Debug menu

- [x] Reorganize the `?debug` menu into clear groups and nested sections. Build on the grouping already present in the MOBA debug menu; related options, especially sound settings, should live together.

Landed on main: heroes/abilities, match/lane, bots/difficulty, presentation/audio, camera/input, front/lobby and engine. Try Mode stays first. Live tuning and lobby → match → lobby → match were proved without missing or duplicate controls. The settled UI checkpoint passed the full check: 296 tests passed, one skipped.

## Working arrangement

If implementation is split across agents, use BB threads in this shared checkout. Don't create worktrees. Keep file ownership clear between threads.

The coordinator maintains instructions, briefs and this checklist; builders implement game code. Start with the lobby cleanup, then take small HUD/feel batches. Keep Mitts gameplay experiments separate from visual changes.

Browser proof stays focused: one session, expand only the changed input or layout axis, and repeat only after a relevant change or failure. Use headless checks for logic. Save full route proofs for checkpoints where navigation or transitions changed.

Ping Oskar when there is something useful to judge. Supply a working local dev URL and minimal route, a screenshot for layout or a short clip for motion, plus one concrete judgment. If automation setup stalls, report the missing proof and make manual review easy. Close the builder's browser afterwards; keep the shared dev server running.

## Overthrow terrain and art direction

The early cream causeway/scalloped-trim pitch has been superseded in the art thread. The current target is our own setting from docs/world.md: Overthrow, a schoolyard court on a mesa above a cold dusk desert, with warm low light, the Yard planet, torn edges and chain-link. Heroes are the lost props they carry; towers use sandcastle silhouettes. Keep the lit-stage readability and team discs/inked units.

Oskar has asked to start with the MOBA lobby's terrain and background, keeping characters and everything else as they are. The art director's warm fight concept K is the reference for the ground and mood. The first floor-and-edge pass is implemented in BB thread thr_p8g7giv53a; this does not lock the match terrain or character designs.

The chain is explicit: thr_4f8w6iasfh supplies prompts, style, taste and lore; thr_kw2v4a95ea generates the images. The coordinator turns the resulting briefs into shared-checkout builder work.

- [ ] Judge concept K as the world/cast target; strengthen team foot discs and unit ink, and cool/pale the court for separation.
- [ ] Check the crowded fight in grayscale before locking the palette.
- [x] Build the first lobby terrain pass: pale chalk-marked tarmac, a finite torn edge, lineless rock ledges and the existing desert visible beyond. All six seats, gallery and dummies stay inside safe bounds; geometry restart, disposal and slider limits are checked.
- [ ] Judge the implemented lobby direction: does this feel like the world to walk into? The visible courses step outward; choose whether to keep the stacked floor or push toward K’s sheer cliff and haze.
- [x] Add sparse sagging chain-link and bollards along the lobby rim. Oskar approved proceeding on the current stacked floor; implemented in `thr_v44vxey6wv`. Default lobby, six occupant/dummy readability and leave/re-entry disposal proved; 78 targeted tests and owned-file lint/format passed. Human visual judgment is ready.
- [x] Carry the pale court and dusk surround into Overthrow match terrain; preserve movement, timing and map layout. Implemented in `thr_893kthfc7g`: quiet chalk-marked tarmac, finite rock edge and low mesas over a cold surround. Real pad-driven combat with a 12-minion wave, grayscale readability, direct/descent agreement and restoration through lobby/splash/Flagfall proved. Restart applies changed geometry with stable resource counts; ground stays below existing shadow discs. 51 targeted tests passed and both characterization snapshots stayed identical. Flagfall remains separate; human visual judgment is ready.

Terrain landed in `761026c4`, atomic headless replay publication in `464d016e`, and the approved title in `a0853646`. GitHub and Cloudflare passed the title checkpoint, and production now includes both Overthrow and the title. The live terrain bundle matches the verified local build; the local combined check passed all 296 tests, one skipped. Review the lobby at https://dodgethis.0sk.ar/?mode=moba&hero=fletcher or locally at http://127.0.0.1:5199/?mode=moba&hero=fletcher.

The art-directed corrections are implemented: a lobby-scoped dusk backdrop, a visible front rock face and fewer/fainter cracks. The camera is unchanged. Debug controls sit in the hierarchy, safe slider ranges preserve the walk limits, and restarting rebuilds both the visible surface and its depth geometry. Default and real-walk edge frames at 1440×900, leave/re-entry and disposal passed; dummies remain at their authored posts. The director says the final first pass answers the value/raised-stage question; Oskar’s judgment is pending.

Lobby proof: one default 1440×900 screenshot against K, plus one after walking to the edge. Oskar judges whether the lobby reads as a pale floor above the desert and the cutouts still stand out. A future match pass needs actual combat at the default camera; the side-view intro is an optional cheap extra.

The fence and Overthrow terrain checkpoint passed the combined production build: 296 tests, one skipped, no failures, with lint and formatting clean. The released naming sweep is included: screens use lobby, map ids use overthrow/flagfall, and the dodgeball debug helper is enterLobby so it cannot collide with the MOBA lobby object. The two terrain briefs are complete; screenshots and before copies remain in their builder thread storage.

## Flagfall and map selection

The standalone Opus5.5 thread `thr_kzp3fgubvw` owns the second map. Its first checkpoint is live in `734a3334`: the splash offers Dodgeball, Overthrow and Flagfall, so map choice happens before lobby ready-up. Returning from the lobby preserves the selected map. The player frame is top-left in lobby and match; the match minimap is top-right.

- [x] Audit the Flagfall design and ship the smallest walkabout: two lanes, central yard, cover and placeholder posts, with one human and two dummies. Structures, waves, capture-the-flag, bots and balance are still pending.
- [x] Choose maps before ready-up through named splash tiles with chalk map plans; preserve selection on return. Fresh route, pad navigation and desktop/phone layouts proved.
- [x] Define and complete the first walkabout and map-selection slices. Full check passed: 296 tests, one skipped; GitHub and Cloudflare passed.
- [ ] Judge the walkabout and direct its terrain art from real screenshots, starting with the outer lanes. Continue in the standalone map thread.
- [ ] Brief the separate structures/waves, flag objective and bot stages after the walkabout direction is settled.
