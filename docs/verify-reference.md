# Verify reference

Read [verify.md](verify.md) first. Use only the recipe or gotcha your proof needs; this page holds the detailed drive recipes and prior measurements.

## Drive recipes

| Feature    | Player path       | Drive                                                                                                                                                    | Proof                                                        |
| ---------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Route      | Enter, H, Enter   | the route template below                                                                                                                                 | `dt.screen()` goes `lobby`, `descent`, `match`               |
| Scoreboard | Tab or pad Select | `dt.key('Tab')` / `dt.pad.press('back')`; again to close                                                                                                 | `.moba-scoreboard` not `hidden`, then `hidden`               |
| Pause      | Esc               | `dt.key('Escape')`; again to resume                                                                                                                      | `dt.screen()==='paused'`, `.overlay[data-theme=moba-pause]`  |
| Result     | Kill the core     | open `?mode=moba&play&debug&bots-only&seed=2`, then repeat `eval "dt.game.moba.fastForward({ ticks: 3600 }).winner"` until it isn't null (about 8 calls) | `dt.screen()==='result'`, `.overlay` reads VICTORY or DEFEAT |
| Anywhere   | Walk there        | `dt.game.moba.sim.heroes[0].body.place(x, y, z)`, `dt.game.moba.focus({ x, z })`, wait ~0.5 s                                                            | position reads back; screenshot                              |

Route template, from `<url>/`: `wait --fn "window.dt?.screen()==='splash'"` → `eval "dt.key('Enter')"` → `wait --fn "dt.screen()==='lobby'"` → `eval "dt.key('KeyH')"` → `eval "dt.key('Enter')"` → `wait --timeout 60000 --fn "dt.screen()==='match'"`.

## Gotchas

- Wait on conditions (`wait --fn "<js>"`, `wait <selector>`), never `sleep`; `wait --fn "false"` is a sleep too. To pause, `wait <ms>` or await a promise in `eval`.
- One `eval` that runs many `fastForward` batches times out the browser connection; one batch per call.
- Esc first drops a held aim or an armed attack-move, then pauses. Tab is ignored while an overlay is up.
- Bots-only fast-forward proves the result wiring, never that a human can win.
- Flagfall coordinates are scaled; read `sim.obstacles` for real positions.
- Try Mode reset keeps its paused state; resume before waiting on a cast, move or death.
- Corner buttons are `.corner-nav .back-button` and `.corner-nav .online-entry` (`src/core/corner-nav.js`); query them after the screen lands, they don't exist on the splash.
- Two-browser online proofs: open the host in its own window and keep it visible (a hidden tab stops simulating), then wait on `dt.screen()` in the guest with `--timeout 60000`.
- Host a room from the console: in the lobby `dt.game.online.host(false)` returns the code; `dt.key('KeyH'); dt.key('Enter')` starts the lane. The guest opens `<url>/CODE`; a bot-only lane ends in about 7 minutes, after which a link is turned away.

## Performance

Frame stats are `dt.game.perf`; `dt.game.benchmark()` is dodgeball-only (it crashes in moba). To time one system, wrap it in `performance.now()` temporarily and remove the hook before committing. The headless GPU is SwiftShader (software), so whole-frame ms mean nothing; trust only CPU spans, compared in the same run under the same load.

## Join by link: ten seconds, counted

The M1 target is tap to moving in under 10 s. Measured 2026-10-10 on a production build behind the worker (`bunx vite build --outDir /tmp/<slug>`, then `bunx wrangler dev --assets /tmp/<slug> --port 8799`), host mid-lane, guest a fresh browser on `/CODE?debug`: lobby at 0.9 s, seated in the match and taking host state at 3.4 s; phone-emulated (`set device "iPhone 14"`, 390 px, DPR 3, no CPU throttle) 4.1 s. Load average was 28 and the server was localhost, so network time is missing: the guest pulls 1.9 MB. No real phone timed yet. To retime, pass `agent-browser --init-script` a script whose rAF loop stamps `performance.now()` once `dt.screen()==='match'`, the guest holds a seat in `dt.game.online.state.humans` and `dt.game.link.stats.received > 0`.
