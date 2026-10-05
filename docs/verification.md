# Verify multiplayer

Run `bun run check` from the repository root for lint, formatting and the tests; it runs files in parallel and prints only failures. Tests cover logic and contracts (engine, net, input, geometry, setup links, the agent protocol), not tuning, timing budgets or visuals: prove those by playing. `bun run test:slow` adds the long agent-session proof. `bun run build` also runs the fast check. Tests use real Rapier worlds for gameplay and replica checks, and fake PeerJS connections/clocks for transport failure cases.

Automated coverage includes roster/controller assignment, shared human actions, input ownership and validation, charge authority, stale match/round/sequence rejection, neutral input timeout, host-only state, snapshot validation/interpolation, event deduplication, round scoring, connection cancellation, and cleanup.

## Combat logs

Run `bun run farm` for 20 hard bot matches, then `bun run balance`. Workers play through `createAgentMatch`, rounding the count up to complete ordered team-kit rotations, including mirrors. Every pairing and its side swap share the rotation's seed. Mitts is skipped with a warning if her definition is absent. Logs live in gitignored `runs/<date>/<match>.jsonl`; only completed files enter queries. Use `--help` for seed, duration limit and output options.

For a tuning probe, use `bun run farm --cross-only --summary --set mitts.speed=5,5.6 --matches 4`. `--cross-only` skips mirror matchups, `--jobs` defaults to the core count, `--summary` writes no logs or tapes and prints win rate, kills, hero damage and length per matchup, and `--set path=value` overrides a `tune` number for the run (a path under `tune.heroes` may drop that prefix; comma values sweep, several flags make a grid, every variant plays the same seeds). Use full logs and `bun run balance` for the real report.

Each fact has effective damage (HP removed, excluding overkill), actor seat/kit, ability and position, with the original fact retained. A single match row records the roster, result, run id, working-copy commit and tuning hash; a timeout has no winner and is excluded from win rates, but counted in match length. `createAgentMatch` exposes `logRows` by default, or streams rows through `onLog` without retaining them. Each farm log has a compact `<match>.tape.json` alongside it: replay regenerates the seeded bots and checks the final snapshot hash. Copy it into `public/replays/` and open `?mode=moba&replay=/replays/<match>.tape.json` on the same tuning/build. Browser download UI is not wired yet.

[The DuckDB queries](../scripts/balance.sql) report hero/team appearances, ordered matchups, damage per hero-seat minute, kill participation, match length and side bias, separated by run, commit, tuning hash, difficulty and map. Kill participation counts the killer or a damaging hit in the preceding ten seconds of that victim's life. These are bot-only balance samples, not evidence that a human can win. The default report reads every run directory without pooling them; legacy logs without provenance are reported individually.

## MOBA playability

`node scripts/verify-moba-playability.mjs <preview URL> <shots directory>` checks a frozen production build: keyboard, mouse and pad get through selection, loading, pause, resume and exit; the hub portal and the Play MOBA button both work; hero select, Numbers, pause and the panned-away marker fit at four viewport sizes; a six-bot seeded 3v3 reaches the result card, the frozen result and a clean Again, with no browser errors.

## MOBA debug-link proof

`node scripts/verify-moba-debug.mjs <preview URL> <artifact directory>` checks direct setup links and bad-value warnings, then enters from a fresh `/` through the MOBA tile, Easy and hero lock. It sends a real mouse order and fast-forwards the ordinary app loop with the local human seat, without injected damage. It asserts a frozen pause snapshot, exactly one tick per step, clipboard success and live speed changes, then saves `debug-1440.png` and `report.json`. The recorded production pass captured tick 1337 with all 12 first-wave minions alive and no browser errors. DOM-free coverage of setup links is in `tests/moba-setup.test.js`.

## MOBA pre-ship polish

`node scripts/verify-moba-polish.mjs <preview URL> <artifact directory>` enters from fresh `/` for every play flow. It checks that only picked selections enter the URL, then traces human RMB movement, follow, manual pan and Space at 390, 1440 and 2560×1080. Ordinary app-loop fast-forward captures lethal damage from a practice Fletcher bot and a Mitts bot spawned through Try Mode, with named recap rows and no injected damage. It saves the opening frames, both death cards and `report.json`; incoming selection links are checked separately.

Synthetic Space events must bubble from the body, not target `window`: the camera's capture listener must run before core input suppresses page scrolling. Consume a mouse order for one frame before parking the pointer, since the input loop reads the pointer's current ground position. The frozen-build pass captured both named bot kills, a hero-centred FOV of 40 at all three sizes, and no browser errors. Camera bounds cover the ground target; the map boundary may be visible at base without changing the match scale.

## Two-device check

Use the same build on both devices, preferably with one device on home Wi-Fi and the other on mobile data. Host a lobby on one, join its code on the other, and complete a human-only match. Repeat with allied humans against bots and mixed teams. Compare scores, deaths, pickups, and bow/bowl ownership; test leaving/rejoining and host departure.

Record device/browser versions, network types, final scores, whether a relay was used, and visible delay or disconnects. If a pair cannot connect, verify [signaling and TURN configuration](network.md); success on one machine does not establish connectivity through independent NATs.

## Recorded browser checks

On 2026-09-09 and again on 2026-09-28 (protocol 2), independent `agent-browser` sessions on the dev build, through the public PeerJS signalling service, covered join by code, human-only, allied-human and one-human-plus-one-bot matches with matching scores and entities on both sides, mid-match leave and rejoin, host departure, refusal of a third joiner, and returning to solo. A remote machine over Tailscale played a match with a direct connection and no TURN relay. The 2026-09-30 playability pass and review fixed the loading, focus and camera issues the checks found.

The 2026-10-05 input-boundary pass used protocol 3 on a frozen production build, entered from fresh `/` and joined by code through the UI. Keyboard movement and bowl selection plus a real mouse throw eliminated the host and ended the round with matching scores in both tabs at 1280×720. At 390×300 (software-rendered Chromium), a guest console sent 1000 frames/s plus one 10 KB frame: host rendering measured 60.00 fps (16.7 ms median), removal took 2.353 s from flood start, and the guest displayed the same removal notice at 2.386 s. The worst transport receive took 0.5 ms. Keep both pages visible in independent browser sessions: a hidden tab can stop requestAnimationFrame and trigger host timeout even with background-throttling flags. Report viewport size alongside software-rendered FPS.

The input-boundary review replayed a 2.5 s host stall through real dodgeball intents: all 175 queued frames and the fresh release were accepted, charge stayed live and the release fired. At 144 Hz, all 144 point-order edges were sent. A 1000/s flood pulsed for 1.9 s of every 3 s was removed after 3.16 s, with dirty windows 0, 1 and 3. Frozen-build browser checks used the actual protocol-2 transport in both directions against protocol 3 and got readable version-mismatch notices. A refusal queued for 350 ms remained connected at 250 ms and closed only after delivery; this simulates a slow relay buffer, not an independent-NAT test. Both tabs agreed on match cancellation, and a lobby removal showed no cancelled match. Refusal cleanup clock fixtures read online's tune value, not a duplicated timeout.
