---
name: verify
description: Prove a dodgethis change in the running game, the way a player reaches it. Use before opening a browser, when a brief asks for a proof by play, a screenshot or clip, or to check a screen, key or HUD element works. Picks the cheapest proof first; the browser is the last resort.
---

# Verify

## Pick the proof

- Logic, sim, bots, balance: `bun test <file>`, `bun run play:headless --help`, `bun run simulate --summary` (see `docs/verification.md`). No browser.
- Oskar is testing: hand him http://office-linux.heron-mermaid.ts.net:5173 (never `127.0.0.1` or the agent port) and one thing to judge, and skip your own visual proof. A human look costs seconds, an agent session minutes.
- Otherwise one browser session, below: one device, one width; expand only the axis that input or layout work changed. A local visual fix goes straight to its screen; prove the full route once at a checkpoint, and only when navigation or transitions changed. Don't repeat a proof that passed unless a new edit or failure calls for it.
- Route and wiring on a prod build (`bun run verify:browser <preview URL> <shots dir>`) and frozen builds (`bunx vite build --outDir /tmp/<slug>`) are orchestrator checkpoint smokes, not builder work.

## Launch and doctor

1. `uptime`: load past 12 turns timings into random failures; go headless or wait.
2. `bun run dev:agent` prints `http://127.0.0.1:5199/`, starting the shared server if nothing answers. Every thread uses it; never stop it. It doesn't live-reload, so reload yourself for fresh code.
3. `export AGENT_BROWSER_SESSION=$BB_THREAD_ID` first, or every thread drives the same tab. Then `agent-browser open <url>/?mode=moba&play&hero=fletcher&bots=easy&seed=2` (fast setup into `match`, not a route proof) or `<url>/` (the route).
4. Doctor before blaming your code: `agent-browser errors` is empty and `agent-browser eval "dt.screen()"` answers. A boot error after a reload may be another thread's half-done edit.

## Drive

Find the feature's code in `docs/feature-map.md`. agent-browser's own key presses don't reach the game; drive it through `window.dt` (`src/core/proof.js`): `dt.key(code, { hold, until })`, `dt.pad.press(name)`, `dt.pad.stick(x, y)`, `dt.device()`, `dt.screen()` (splash, lobby, descent, match, paused, result). Match state is `dt.game.moba`: `sim` (`heroes[i].body.position`, `.body.place(x, y, z)`; in direct play `heroes[0]` is you), `snapshot()`, `focus({ x, z })`, `fastForward({ ticks })`; lobby state is `dt.game.lobby.sim`. Poke what you need from `eval`; don't dump `Object.keys`. A prod build shows `dt` after Backquote.

| Feature    | Player path       | Drive                                                                                                                                                    | Proof                                                        |
| ---------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Route      | Enter, H, Enter   | the route template below                                                                                                                                 | `dt.screen()` goes `lobby`, `descent`, `match`               |
| Scoreboard | Tab or pad Select | `dt.key('Tab')` / `dt.pad.press('back')`; again to close                                                                                                 | `.moba-scoreboard` not `hidden`, then `hidden`               |
| Pause      | Esc               | `dt.key('Escape')`; again to resume                                                                                                                      | `dt.screen()==='paused'`, `.overlay[data-theme=moba-pause]`  |
| Result     | Kill the core     | open `?mode=moba&play&debug&bots-only&seed=2`, then repeat `eval "dt.game.moba.fastForward({ ticks: 3600 }).winner"` until it isn't null (about 8 calls) | `dt.screen()==='result'`, `.overlay` reads VICTORY or DEFEAT |
| Anywhere   | Walk there        | `dt.game.moba.sim.heroes[0].body.place(x, y, z)`, `dt.game.moba.focus({ x, z })`, wait ~0.5 s                                                            | position reads back; screenshot                              |

Route template, from `<url>/`: `wait --fn "window.dt?.screen()==='splash'"` → `eval "dt.key('Enter')"` → `wait --fn "dt.screen()==='lobby'"` → `eval "dt.key('KeyH')"` → `eval "dt.key('Enter')"` → `wait --timeout 60000 --fn "dt.screen()==='match'"`.

Gotchas:

- Wait on conditions (`wait --fn "<js>"`, `wait <selector>`), never `sleep`; `wait --fn "false"` is a sleep too. To pause, `wait <ms>` or await a promise in `eval`.
- One `eval` that runs many `fastForward` batches times out the browser connection; one batch per call.
- Esc first drops a held aim or an armed attack-move, then pauses. Tab is ignored while an overlay is up.
- Bots-only fast-forward proves the result wiring, never that a human can win.
- Flagfall coordinates are scaled; read `sim.obstacles` for real positions.
- Try Mode reset keeps its paused state; resume before waiting on a cast, move or death.

## Evidence

Save to `$BB_THREAD_STORAGE/proof/`, then publish with `bun run review -- --title … --ask … --thread $BB_THREAD_ID <files>` and report http://office-linux.heron-mermaid.ts.net:5173/review/, never the storage path. `agent-browser set viewport <w> <h>` (there is no `resize`), `agent-browser mouse move 0 0`, assert the state you claim with `eval`, then `agent-browser screenshot <path>`. A screenshot for layout, a short clip for motion; a screenshot alone doesn't prove feel. Report the action, the asserted state and how the proof was made.

## Cleanup

`agent-browser close` closes your session only. Leave the dev server running; never `pkill`. If setup stalls, stop: report the exact proof gap and a manual-review URL rather than burning the build on automation.
