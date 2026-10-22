# Verify

Pick the cheapest proof that answers the question.

- Logic, sim, bots, balance: `bun test <file>`, `bun run play:headless --help`, `bun run simulate --summary`. No browser.
- Sound: `bun run sound:check [words]` prints each sound's numbers and rule flags (docs/sound.md, Tooling). Never claim a sound is better by ear.
- Oskar is testing: hand him http://office-linux.heron-mermaid.ts.net:5173 (never `127.0.0.1` or the agent port) and one thing to judge; skip your own visual proof.
- Otherwise use one browser session, one device, one width; expand only the axis that input or layout work changed. A local visual fix goes straight to its screen. Prove the full route once at a checkpoint, only when navigation or transitions changed. Don't repeat a passing proof unless a new edit or failure calls for it.
- Route and wiring on a prod build (`bun run verify:browser <preview URL> <shots directory>`) and frozen builds (`bunx vite build --outDir /tmp/<slug>`) are orchestrator checkpoint smokes, not builder work.

## Check and headless tools

`bun run check` from the repository root runs lint, formatting and tests in parallel, printing only failures. Iterate with `bun test <file>`; tests cover logic and contracts, not tuning, timing budgets or visuals. `bun run test:slow` adds the long agent-session proof. `bun run build` also runs the fast check. Gameplay and replica tests use real Rapier worlds; transport failure tests use fake PeerJS connections and clocks.

`bun run profile:dodgeball [preset] [seed]` measures physics and AI tick time (defaults: 20v20, seed 42), not rendering or FPS.

`bun run simulate --summary` plays headless bot matches through `createAgentMatch`, printing tables without logs. Use simulations for bot behavior and balance, before writing a probe script, a `git archive` baseline or an env-var hack. Name the question first; a short play proof is cheaper for a local mechanic or human interaction. Bot-only samples cannot prove human winnability or how bots treat a human seat; an idle seat is no human.

- Start small: `bun run simulate --base --cross-only --matches 2 --max-seconds 30 --jobs 2 --report`. Summaries default to 4 matches, logs to 20. `--quick` means `--summary --cross-only --matches 4`. Use enough complete matches for balance comparisons; `bun run simulate --help` lists seed, duration and output options.
- `--heroes fletcher,mitts` gives each team three of one hero; `mixed` is practice's `mitts,fletcher,random`. Repeatable `--lineup mitts,fletcher,mitts` seats that lineup on both teams; `random` draws a seeded playable hero, identically across revisions and variants. `--cross-only` skips mirrors. `--idle A1` leaves a seat standing still; scripted seats aren't supported. `--practice` gives idle A1, normal allies and enemies on `--difficulty`.
- `--player A1:north` gives A1 its own bot outside the team's deal, in that lane. With `--report` on a two-lane map, it reports each seat's time per lane, yard and home, and structures lost per team and lane. `--map flagfall` uses that map's walls (`overthrow` or `flagfall`; default: the game's default map), including with `--summary`, `--base` and `--report`.
- Counts round up to whole matchup rotations. Every pairing and side swap share a rotation's seed; every variant and revision uses the same seeds. `--set path=v[,v…]` overrides a `tune` number; paths under `tune.heroes` may drop that prefix. Comma values sweep; several flags make a grid.
- Logic experiments use `tune.bots.exp.<flag>` (truthy or numeric), not patches: `--set bots.exp.dive=0,1` plays both. The flag needn't exist in `tune.js`. Land the winning variant as plain code and delete the flag; `exp` stays empty on main.
- `--base [rev]` unpacks another revision once into `/tmp/dodgethis-rev-<commit>` with this checkout's `node_modules`. Default: `@-` in jj, `HEAD` in a dirty git worktree, otherwise `origin/main`; revisions resolve through jj when it owns the checkout, otherwise git. Each side uses its own sim, bots, tune and per-match reporter, so renamed facts retain their baseline counts; summary formatting comes from the working copy. In a shared checkout, this also measures other threads' edits: use `--set <switch>=0,1` to isolate yours.
- `--same <rev>` replays seeds 2,3 with mixed rosters for 120 seconds on both revisions, compares full logs byte for byte with shared provenance, and prints identical or the first differing row/tick per seed; any difference exits non-zero. `--seed` starts the seeds, `--matches` counts seeds, and `--out` keeps both logs; unlike `--base`, this is an exact replay check, not a balance comparison.
- Win rates have 95% Wilson intervals; `--base` deltas have approximate Newcombe intervals and a verdict. Reused seeds are treated as independent, so deltas are descriptive, not calibrated paired intervals. Twenty-four matches give roughly ±20 points: read the interval. Edge is the win rate of the team fielding more of a hero, one sample per match; for one-hero teams it equals plain win rate.
- `--until N` adds `--matches` rounds until headline intervals (cross matchups' A win % and heroes' edge, or their `--base` deltas) exclude 50% or 0, or N matches are played. Optional stopping invalidates fixed-sample confidence bounds; stopped verdicts are exploratory. `--base`, `--until` and `--report` imply `--summary`.
- `--report` adds ability casts/hits/damage, summons destroyed per match by killer kind, deaths by killer kind, damage taken by source, bot brain-state shares, siege states split by tower distance (two friendly minions at a vulnerable enemy tower), and structure falls by kind with falls/match, median fall minute and seconds from first hit. Default tables show matchups and hero edge, seat win %, damage, hero damage, deaths, structure hits and catches.
- `--count flagTaken,campCleared` counts fact kinds per team and match, implies `--summary`, and works with `--base`. Richer questions need saved logs: each line's `.fact` has `kind`, `source`, `target`, `effective_damage`; `death` has `source`/`target`, `cast` has `ability_id`.
- Simulations share a per-machine worker budget (`FARM_CORES`, default cores − 2) in `/tmp/dodgethis-farm-cores`, capped by matches and free budget. `--jobs` caps the request; below a quarter of the budget they wait, then take what's free. Workers initialize Rapier and load each revision once, reusing them across matches and rounds. Fresh bb worktrees need `bun install`.

`bun run simulate` without `--summary` plays 20 hard bot matches and prints each finished match's fingerprint and replay path (`hash=… tape=runs/…tape.json`). `--summary` writes no replay and skips the final snapshot/fingerprint. Simulations skip external agent-observation history; bots retain ordinary perception history. Replay regenerates seeded bots and checks the final snapshot fingerprint. Copy the replay into `public/replays/` and open `?mode=moba&replay=/replays/<match>.tape.json` on the same tuning/build; browser download UI isn't wired yet.

`bun run simulate --logs runs` analyses completed `.jsonl` logs in gitignored `runs/<date>/` with the DuckDB CLI. `--logs` accepts a recursive directory, single file or quoted glob. Facts include effective damage (HP removed, excluding overkill), actor seat/kit, ability and position, retaining the original fact. Match rows record roster, result, simulation id, commit and tuning fingerprint; timeouts have no winner and don't enter win rates, but count in match length. `createAgentMatch` exposes `logRows` or streams through `onLog` without retaining rows. [DuckDB queries](../scripts/balance.sql) separate results by simulation, commit, tuning fingerprint, difficulty and map, without pooling; legacy logs lacking provenance stay separate. Kill participation includes the killer or a damaging hit in the victim's preceding ten seconds.

For a one-off, use `bun -e 'const { bootMoba } = await import("./tests/moba-harness.js"); const h = bootMoba(); try { h.step(60); console.log(h.sim.snapshot()); } finally { h.dispose(); }'`, not a new harness. `bootMoba` boots the sim, `shot()` fires a test shot, `sim.launchShot(hero, dir, stats, origin)` a real one. Floor changes need movement, wall contact and dashes in lobby and match; short bot timings measure simulation cost, not displayed FPS or balance. Record and replay on the same build.

### Headless play

Commands and actions: `bun run play:headless --help`. Protocol: [agents.js](../src/plugins/moba/agents.js).

Use a fresh session name per match. Detached sessions stay frozen between calls; invalid JSON/actions can be retried without advancing time. With several agents, reply to each `act <seat>` before time advances.

Replay uses the CLI's WASM build and validates its final state.

## Browser proofs

1. `uptime`: load past 12 makes timing failures random; go headless or wait.
2. `bun run dev:agent` prints `http://127.0.0.1:5199/`, starting the shared server if needed. Every thread uses it; never stop it. It doesn't live-reload: reload for fresh code.
3. First `export AGENT_BROWSER_SESSION=$BB_THREAD_ID`, or threads drive the same tab. `agent-browser open <url>/?mode=moba&play&hero=fletcher&bots=easy&seed=2` jumps into `match`; `<url>/` starts the route.
4. Before blaming your code, check `agent-browser errors` is empty and `agent-browser eval "dt.screen()"` answers. A boot error after reload may be another thread's half-done edit.

Find the feature in `docs/feature-map.md`. agent-browser key presses don't reach the game: use `window.dt` (`src/core/proof.js`), `dt.key(code, { hold, until })`, `dt.pad.press(name)`, `dt.pad.stick(x, y)`, `dt.device()`, `dt.screen()` (splash, lobby, match, paused, result; descent is a transition). A prod build exposes `dt` after Backquote. Match state is `dt.game.moba`: `sim.heroes[i].body.position`, `.body.place(x, y, z)` (direct play: `heroes[0]` is you), `snapshot()`, `focus({ x, z })`, `fastForward({ ticks })` (at most 3600/call; set long timers on live state instead). Lobby sim is `dt.game.lobby.sim`. Poke what you need with `eval`; don't dump `Object.keys`.

- For fresh-entry proof, wait for both the onboarding root and the absence of `.moba-front`: the match and its HUD are already mounted during loading.
- Route from `<url>/`: `wait --fn "window.dt?.screen()==='splash'"` → `eval "dt.key('Enter')"` → `wait --fn "dt.screen()==='lobby'"` → `eval "dt.key('KeyH')"` → `eval "dt.key('Enter')"` → `wait --timeout 60000 --fn "dt.screen()==='match'"`.
- Scoreboard: `dt.key('Tab')` or `dt.pad.press('back')` (pad Select); `.moba-scoreboard` loses `hidden`, then gains it when pressed again. Pause: `dt.key('Escape')`, assert `dt.screen()==='paused'` and `.overlay[data-theme=moba-pause]`; press again to resume.
- Result: open `?mode=moba&play&debug&bots-only&seed=2`, repeat `eval "dt.game.moba.fastForward({ ticks: 3600 }).winner"` until non-null (about eight calls), assert `dt.screen()==='result'` and VICTORY or DEFEAT in `.overlay`. This proves wiring, not human winnability.
- Anywhere: `dt.game.moba.sim.heroes[0].body.place(x, y, z)`, `dt.game.moba.focus({ x, z })`, wait about 0.5 s, read back position, then screenshot. Flagfall coordinates are scaled: read `sim.obstacles` for real positions.
- Wait on conditions with `wait --fn "<js>"` or `wait <selector>`, never `sleep`; `wait --fn "false"` is also a sleep. For a pause, use `wait <ms>` or await a promise in `eval`. Many `fastForward` batches in one `eval` time out the connection; one batch per call.
- Esc first drops held aim or armed attack-move, then pauses. Tab is ignored under overlays. Try Mode reset keeps pause state; resume before waiting for a cast, move or death.
- Corner buttons are `.corner-nav .back-button` and `.corner-nav .online-entry` (`src/core/corner-nav.js`); query after the screen lands, not on the splash.

For online checks, keep both pages visible in independent browser sessions/windows; a hidden tab can stop requestAnimationFrame and cause host timeout even with background-throttling flags. In the lobby `dt.game.online.host(false)` returns the code; `dt.key('KeyH'); dt.key('Enter')` starts the lane. Guest opens `<url>/CODE`; wait for `dt.screen()` with `--timeout 60000`. A bot-only lane ends in about seven minutes, after which links are turned away.

Use the same build on both devices, preferably home Wi-Fi versus mobile data. Host, join by code, complete a human-only match, then allied humans versus bots and mixed teams. Compare scores, deaths, pickups and bow/bowl ownership; test leave/rejoin and host departure. Record device/browser versions, network types, scores, relay use and visible delay/disconnects. Failure to connect needs [signaling and TURN checks](network.md); one-machine success doesn't prove independent-NAT connectivity. Report viewport alongside software-rendered FPS.

To time join by link (target: tap to moving under 10 s), use a frozen build with `bunx wrangler dev --assets /tmp/<slug> --port 8799`, a host mid-lane and a fresh guest at `/CODE?debug`. Pass `agent-browser --init-script` a rAF loop stamping `performance.now()` once `dt.screen()==='match'`, the guest holds a seat in `dt.game.online.state.humans`, and `dt.game.link.stats.received > 0`. `set device "iPhone 14"` emulates a phone, not real hardware or network time.

Frame stats are `dt.game.perf`; `dt.game.benchmark()` is dodgeball-only and crashes in moba. Time one system with a temporary `performance.now()` wrapper, removed before commit. Headless SwiftShader is software: whole-frame ms prove nothing about hardware FPS. Trust CPU spans compared under the same load in the same session.

The prod `verify:browser` smoke checks lobby selections through ready/crane/descent, mouse movement, keyboard/mouse/mocked-pad pause/resume, restart, retained hero, splash return, Dodgeball portal and lobby bounds at four viewports. A separate seed-2 direct-play match with six normal bots checks result, frozen ended snapshot, Again and splash return, not human winnability, balance or FPS. Require no browser errors. Use focused proofs for independent device entry routes or visuals outside the smoke. It saves screenshots and `report.json` (timings, command count, seed, roster, result, failure stage), has a 90-second budget (target 20–40 s), and closes its own browser/socket directory on success or failure, removing the directory after successful close. Synthetic Space events must bubble through the camera capture listener; wait for actual mouse displacement, not a fixed delay.

## Evidence and cleanup

Save evidence to `$BB_THREAD_STORAGE/proof/`. Look at most one screenshot yourself per proof, resized to ≤800 px; send the rest straight to `bun run review -- --title … --ask … --thread $BB_THREAD_ID <files>` without reading them back. Shrink them first — webp stills at most 1440 px wide, clips VP9 at most 1440 (`magick`, `ffmpeg`; the recipes are in AGENTS.md): they are committed and ship with the site, so each proof should be a few hundred kB. Publish every visual proof, clip or variant and report http://office-linux.heron-mermaid.ts.net:5173/pages/, never a storage path. Oskar plays at http://office-linux.heron-mermaid.ts.net:5173, never `127.0.0.1` or the agent port.

`agent-browser set viewport <w> <h>` (no `resize`), `agent-browser mouse move 0 0`, assert the claimed state with `eval`, then `agent-browser screenshot <path>`. Use a screenshot for layout, a short clip for motion; a screenshot doesn't prove feel. Report the action, asserted state and how the proof was made.

`agent-browser close` closes only your session. Leave the shared server running; never `pkill`. If setup stalls, stop and report the exact proof gap and a manual-review URL rather than burning the build on automation.
