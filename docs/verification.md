# Verify multiplayer

Run `bun run check` from the repository root for lint, formatting and the tests; it runs files in parallel and prints only failures. Tests cover logic and contracts (engine, net, input, geometry, setup links, the agent protocol), not tuning, timing budgets or visuals: prove those by playing. `bun run test:slow` adds the long agent-session proof. `bun run build` also runs the fast check. Tests use real Rapier worlds for gameplay and replica checks, and fake PeerJS connections/clocks for transport failure cases.

Automated coverage includes roster/controller assignment, shared human actions, input ownership and validation, charge authority, stale match/round/sequence rejection, neutral input timeout, host-only state, snapshot validation/interpolation, event deduplication, round scoring, connection cancellation, and cleanup.

## Verification commands

| Command                                                  | Purpose                                                                          |
| -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `bun test [file]`                                        | Existing logic and contract tests                                                |
| `bun run test:slow`                                      | Include the long agent-session proof                                             |
| `bun run play:headless --help`                           | Control a MOBA seat and save a replay; see [agent play](moba-agents.md)          |
| `bun run simulate --help`                                | Bot matches, revision comparisons and balance reports                            |
| `bun run simulate --logs runs`                           | Analyse saved combat logs with DuckDB                                            |
| `bun run profile:dodgeball [preset] [seed]`              | Physics and AI tick time; defaults to 20v20, seed 42; excludes rendering and FPS |
| `bun run verify:browser <preview URL> <shots directory>` | Browser controls, navigation, layouts and match completion                       |

## Bot simulations

`bun run simulate --summary` plays headless bot matches through `createAgentMatch` and prints tables instead of writing logs. It is the tool for balance and bot-logic questions; reach for it before writing a probe script, a `git archive` baseline or an env-var hack. These are bot-only samples, not evidence that a human can win.

- Start small: `bun run simulate --base --cross-only --matches 2 --max-seconds 30 --jobs 2 --report`. Summaries default to 4 matches and 2 workers; logs default to 20 matches. `--quick` is `--summary --cross-only --matches 4`.
- Teams: `--heroes fletcher,mitts` gives each team three of one hero; `mixed` is practice's `mitts,fletcher,random`. `--lineup mitts,fletcher,mitts` adds a team of those seats (repeatable); `random` draws a seeded playable hero, the same draw on every revision and variant. `--cross-only` skips mirrors. `--idle A1` leaves seats standing still. Scripted seats are not supported. `--practice` is practice's shape: an idle A1, allies on normal, enemies on `--difficulty`.
- Bot simulations can't see bugs in how bots treat a human seat (lane split, following up, peeling): the deal leaves humans out, and an idle seat is no human. `--player A1:north` plays A1 with its own bot outside the team's deal, in that lane; with `--report` on a two-lane map you get each seat's share of time per lane, yard and home, and structures lost per team and lane.
- `--map flagfall` plays every match on that map with its own walls (`overthrow` or `flagfall`; default is the game's default map); it works with `--summary`, `--base` and `--report`.
- Counts round up to whole matchup rotations; every pairing and its side swap share a rotation's seed, and every variant and revision plays the same seeds.
- `--set path=v[,v…]` overrides a `tune` number (a path under `tune.heroes` may drop that prefix; comma values sweep, several flags make a grid).
- Logic experiments are flags, not patches: bot code may read `tune.bots.exp.<flag>` (truthy, or a number), and `--set bots.exp.dive=0,1` plays both. A flag needn't exist in `tune.js` to be set. When a variant wins, land it as plain code and delete the flag; `exp` stays empty on main.
- `--base [rev]` plays the same seeds on another revision, unpacked once into `/tmp/dodgethis-rev-<commit>` with this checkout's `node_modules`. The default is the commit under your edits: `@-` in the jj checkout, `HEAD` in a dirty git worktree, else `origin/main`. Revisions resolve through jj when it owns the checkout, else git. Each side plays its own sim, bots and tune; the reporting is the working copy's.
- Win rates carry 95% Wilson intervals; with `--base`, each delta carries an approximate Newcombe interval and a verdict ("working copy higher", "base higher", "no difference detected"). The delta calculation treats samples as independent despite reused seeds, so it is descriptive rather than a calibrated paired confidence interval. Twenty-four matches pin a win rate only to about ±20 points, so read the interval, not the number. Edge is the win rate of the team fielding more of a hero, one sample per match, so it works for mixed lineups and equals the plain win rate for one-hero teams.
- `--until N` keeps adding `--matches` rounds until every headline rate (cross matchups' A win % and heroes' edge; with `--base`, their deltas) has left 50% or 0, or N matches are played. These fixed-sample intervals are not valid confidence bounds under optional stopping; treat stopped verdicts as exploratory.
- `--report` adds per-ability casts, hits and damage; deaths by killer kind (hero, tower, minion); damage taken by source (an enemy hero's ability, tower, minion); bot brain-state shares; and states in a siege window (two or more friendly minions at a vulnerable enemy tower), split by distance to that tower. The default output is the matchup table and the per-hero table (edge, seat win %, damage, hero damage, deaths, structure hits, catches).
- `--base`, `--until` and `--report` imply `--summary`.
- The machine is shared. Farms reserve worker threads from one per-machine budget (`FARM_CORES`, default cores − 2) in `/tmp/dodgethis-farm-cores`; a farm that can't get a quarter of it waits and says so, then takes what is free. `--jobs` caps the request (default 2).
- Fresh bb worktrees have no `node_modules`; farm says so. Run `bun install`.

## Combat logs

Run `bun run simulate` (no `--summary`) for 20 hard bot matches, then `bun run simulate --logs runs`, for questions the simulation tables don't answer. Logs live in gitignored `runs/<date>/<match>.jsonl`; only completed files enter queries. Pass a log directory, a single `.jsonl` file or a quoted glob to `--logs`; directories are searched recursively. Saved-log analysis requires the DuckDB CLI. Use `--help` for seed, duration limit and output options.

Each fact has effective damage (HP removed, excluding overkill), actor seat/kit, ability and position, with the original fact retained. A single match row records the roster, result, run id, working-copy commit and tuning hash; a timeout has no winner and is excluded from win rates, but counted in match length. `createAgentMatch` exposes `logRows` by default, or streams rows through `onLog` without retaining them. Each farm log has a compact `<match>.tape.json` alongside it: replay regenerates the seeded bots and checks the final snapshot hash. Copy it into `public/replays/` and open `?mode=moba&replay=/replays/<match>.tape.json` on the same tuning/build. Browser download UI is not wired yet.

[The DuckDB queries](../scripts/balance.sql) report hero/team appearances, ordered matchups, damage per hero-seat minute, kill participation, match length and side bias, separated by run, commit, tuning hash, difficulty and map. Kill participation counts the killer or a damaging hit in the preceding ten seconds of that victim's life. The default report reads every run directory without pooling them; legacy logs without provenance are reported individually.

## MOBA playability

The MOBA collision floor is one flat plane, bounded by the lane's wall colliders or the lobby's walking limits. It has no terrain grid or triangle seams. When changing it, check player movement, wall contact and dashes in both the lobby and a match; short bot timings measure simulation cost, not displayed FPS or balance. Floor changes can alter old seeded results, so record and replay tapes on the same build.

`bun run verify:browser <preview URL> <shots directory>` proves the browser wiring on a production build: a fresh splash opens the MOBA lobby, hero and difficulty selections survive one real ready walk/crane/descent, mouse orders move the hero, and keyboard, mouse and mocked pad can pause or resume. It checks restart, retained hero selection, return to the splash and the Dodgeball portal. The same lobby is resized to four viewports to assert hero-strip and back-arrow bounds; screenshots support visual review rather than asserting every pixel.

A separate direct-play match uses six normal bots and explicit seed 2. It advances the real app frame phases until a winner, checks the relative result card and frozen ended snapshot, then checks a clean Again and return to the splash. It proves result/restart integration, not human winnability, balance or rendered FPS. Both documents must have no browser errors. Independent entry routes for every input device and the old Ball/hero-marker screenshots are outside this smoke pass; use focused browser proofs when changing those features.

The pass writes screenshots and `report.json`, including stage timings, command count, seed, roster, result and failure stage. It uses a private writable temporary directory for the browser socket, closes its own browser once on success or failure, and removes the directory after a successful close. It has a 90-second wall-clock budget; the usual target is 20–40 seconds. Production animation timings and simulation rules are unchanged. Synthetic Space events bubble from the focused element through the camera's capture listener; mouse movement waits for actual displacement rather than a fixed delay.

## Two-device check

Use the same build on both devices, preferably with one device on home Wi-Fi and the other on mobile data. Host a lobby on one, join its code on the other, and complete a human-only match. Repeat with allied humans against bots and mixed teams. Compare scores, deaths, pickups, and bow/bowl ownership; test leaving/rejoining and host departure.

Record device/browser versions, network types, final scores, whether a relay was used, and visible delay or disconnects. If a pair cannot connect, verify [signaling and TURN configuration](network.md); success on one machine does not establish connectivity through independent NATs.

## Recorded browser checks

On 2026-09-09 and again on 2026-09-28 (protocol 2), independent `agent-browser` sessions on the dev build, through the public PeerJS signalling service, covered join by code, human-only, allied-human and one-human-plus-one-bot matches with matching scores and entities on both sides, mid-match leave and rejoin, host departure, refusal of a third joiner, and returning to solo. A remote machine over Tailscale played a match with a direct connection and no TURN relay. The 2026-09-30 playability pass and review fixed the loading, focus and camera issues the checks found.

The 2026-10-05 input-boundary pass used protocol 3 on a frozen production build, entered from fresh `/` and joined by code through the UI. Keyboard movement and bowl selection plus a real mouse throw eliminated the host and ended the round with matching scores in both tabs at 1280×720. At 390×300 (software-rendered Chromium), a guest console sent 1000 frames/s plus one 10 KB frame: host rendering measured 60.00 fps (16.7 ms median), removal took 2.353 s from flood start, and the guest displayed the same removal notice at 2.386 s. The worst transport receive took 0.5 ms. Keep both pages visible in independent browser sessions: a hidden tab can stop requestAnimationFrame and trigger host timeout even with background-throttling flags. Report viewport size alongside software-rendered FPS.

The input-boundary review replayed a 2.5 s host stall through real dodgeball intents: all 175 queued frames and the fresh release were accepted, charge stayed live and the release fired. At 144 Hz, all 144 point-order edges were sent. A 1000/s flood pulsed for 1.9 s of every 3 s was removed after 3.16 s, with dirty windows 0, 1 and 3. Frozen-build browser checks used the actual protocol-2 transport in both directions against protocol 3 and got readable version-mismatch notices. A refusal queued for 350 ms remained connected at 250 ms and closed only after delivery; this simulates a slow relay buffer, not an independent-NAT test. Both tabs agreed on match cancellation, and a lobby removal showed no cancelled match. Refusal cleanup clock fixtures read online's tune value, not a duplicated timeout.
