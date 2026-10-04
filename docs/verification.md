# Verify multiplayer

Run `bun run check` from the repository root for lint, formatting and the fast tests, including a short seeded MOBA match. Run `bun run test:slow` once per checkpoint: `SLOW=1 bun test` includes every fast test plus whole-match and multi-Hz proofs with their original assertions. `bun run build` also runs the fast check. Tests use real Rapier worlds for gameplay and replica checks, and fake PeerJS connections/clocks for transport failure cases.

Automated coverage includes roster/controller assignment, shared human actions, input ownership and validation, charge authority, stale match/round/sequence rejection, neutral input timeout, host-only state, snapshot validation/interpolation, event deduplication, round scoring, connection cancellation, and cleanup.

## Combat logs

Run `bun run farm` for 20 hard bot matches, then `bun run balance`. Workers play through `createAgentMatch`, rounding the count up to complete ordered team-kit rotations, including mirrors. Every pairing and its side swap share the rotation's seed. Mitts is skipped with a warning if her definition is absent. Logs live in gitignored `runs/<date>/<match>.jsonl`; only completed files enter queries. Use `--help` for seed, duration limit and output options.

Each fact has effective damage (HP removed, excluding overkill), actor seat/kit, ability and position, with the original fact retained. A single match row records the roster, result, run id, working-copy commit and tuning hash; a timeout has no winner and is excluded from win rates, but counted in match length. `createAgentMatch` exposes `logRows` by default, or streams rows through `onLog` without retaining them. Each farm log has a compact `<match>.tape.json` alongside it: replay regenerates the seeded bots and checks the final snapshot hash. Copy it into `public/replays/` and open `?mode=moba&replay=/replays/<match>.tape.json` on the same tuning/build. Browser download UI is not wired yet.

[The DuckDB queries](../scripts/balance.sql) report hero/team appearances, ordered matchups, damage per hero-seat minute, kill participation, match length and side bias, separated by run, commit, tuning hash, difficulty and map. Kill participation counts the killer or a damaging hit in the preceding ten seconds of that victim's life. These are bot-only balance samples, not evidence that a human can win. The default report reads every run directory without pooling them; legacy logs without provenance are reported individually.

## MOBA playability

`node scripts/verify-moba-playability.mjs <preview URL> <shots directory>` checks a frozen production build: keyboard, mouse and pad get through selection, loading, pause, resume and exit; the hub portal and the Play MOBA button both work; hero select, Numbers, pause and the panned-away marker fit at four viewport sizes; a six-bot seeded 3v3 reaches the result card, the frozen result and a clean Again, with no browser errors. `tests/moba-practice.test.js` plays a cautious scripted human through ordinary orders in Easy Practice and wins, which shows the policy can win, not that a first-time player has been playtested.

## MOBA debug-link proof

`node scripts/verify-moba-debug.mjs <preview URL> <artifact directory>` checks direct setup links and bad-value warnings, then enters from a fresh `/` through the MOBA tile, Easy and hero lock. It sends a real mouse order and fast-forwards the ordinary app loop with the local human seat, without injected damage. It asserts a frozen pause snapshot, exactly one tick per step, clipboard success and live speed changes, then saves `debug-1440.png` and `report.json`. The recorded production pass captured tick 1337 with all 12 first-wave minions alive and no browser errors. DOM-free coverage is in `tests/moba-setup.test.js` and `tests/moba-debug.test.js`.

## Two-device check

Use the same build on both devices, preferably with one device on home Wi-Fi and the other on mobile data. Host a lobby on one, join its code on the other, and complete a human-only match. Repeat with allied humans against bots and mixed teams. Compare scores, deaths, pickups, and bow/bowl ownership; test leaving/rejoining and host departure.

Record device/browser versions, network types, final scores, whether a relay was used, and visible delay or disconnects. If a pair cannot connect, verify [signaling and TURN configuration](network.md); success on one machine does not establish connectivity through independent NATs.

## Recorded browser checks

On 2026-09-09 and again on 2026-09-28 (protocol 2), independent `agent-browser` sessions on the dev build, through the public PeerJS signalling service, covered join by code, human-only, allied-human and one-human-plus-one-bot matches with matching scores and entities on both sides, mid-match leave and rejoin, host departure, refusal of a third joiner, and returning to solo. A remote machine over Tailscale played a match with a direct connection and no TURN relay. The 2026-09-30 playability pass and review fixed the loading, focus and camera issues the checks found.
