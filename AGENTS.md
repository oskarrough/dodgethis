# Agent notes

- Use jujutsu version control when `jj` is available
- Keep learnings in the repo (docs, this file), never in a harness's private memory; the user works across many harnesses.
- Don't use `jj restore`; parallel agents may be working in this checkout.
- Commit only if your brief says so (parallel builds leave it to the orchestrator), and then only your own files, always with a message: `jj commit <paths> -m "…"`. Run `bunx oxfmt <paths>` first, docs included; `bun run check` fails on unformatted markdown. Then `jj bookmark set main -r @-`. `jj commit <path>` takes every hunk in that file, other threads' edits included, so commit a file only when all its changes are yours and otherwise leave it to the orchestrator. Leave other threads' changes in the working copy; never create an empty-described commit. When parallel threads have tangled the same files, the orchestrator may commit unrelated features together rather than hand-split hunks; name each feature in the message.
- Don't write new unit tests yet; prove changes by playing them. Keep the existing suite green.
- A red check in files you don't own isn't yours: name them in your report and leave them alone. Iterate with `bun test <file>`; finish with `bunx oxlint <your files>`, `bunx oxfmt <your files>` and the test files near your change. In a shared checkout the orchestrator runs the full `bun run check` at the checkpoint, so don't loop on it: other threads' half-done edits make it red.
- The machine is shared: browser sessions and full checks starve each other (load past 12 turns timing tests into random failures). Open a browser only when the change is visual or someone asked, and close it when done.
- Deploys happen automatically when `main` moves on GitHub (Cloudflare Workers build). Never run `wrangler deploy` by hand. `bun run build` runs `bun run check` first, so a lint or test failure blocks the deploy. MOBA work goes on `main`.

## Git worktrees

- A bb thread may land in a plain git worktree: no `node_modules`, no jj. Run `bun install` first (a second or two), then use git; the jj lines above don't apply.
- To land: commit only your own files with a user-facing message, `git fetch origin && git rebase origin/main`, rerun the tests near your change, then `git push origin HEAD:main`. If the push is refused because main moved, fetch, rebase and push again. Never force-push.

## Balance and bot experiments

- `bun run simulate --summary` runs bot simulations: headless bot matches, compact tables, no logs. `--base` replays the same seeds on another revision and prints deltas with approximate 95% intervals and a verdict; `--report` adds per-ability, death-cause and bot-state sections; `--set bots.exp.<flag>=0,1` toggles a logic variant. Read the simulation section of `docs/verification.md` before building your own harness, git archive or env-var hack.
- Full logs (`bun run simulate` without `--summary`) feed `bun run simulate --logs runs`, DuckDB over saved match logs, for questions the simulation tables don't answer.

## Browser proofs

- When the user is testing in the browser, hand over the URL and one thing to judge, and skip your own visual proof: a human look costs seconds, an agent session minutes. Otherwise browse when the change needs it, as below.
- Keep browser proof proportional to the change: one focused session, one device and one width; expand only the axis changed by input or layout work. Use headless checks for logic. Don't repeat proof after it passes unless a new edit or failure warrants it.
- For a local visual fix, go straight to the relevant screen. Prove the full route once at a checkpoint when navigation or transitions changed, rather than replaying a whole match per builder. Capture a screenshot for layout or a short clip for animation; screenshots alone don't prove feel.
- If browser setup stalls, report the exact proof gap and a working manual-review URL instead of burning the build on automation. Close only your own browser session when finished; leave the shared server running.
- `bun run dev:agent` prints the shared agent server's URL, starting it if nothing answers. Every thread reuses it; never stop it. It doesn't live-reload, so other threads' edits can't wipe your page: reload yourself when you want fresh code. A boot error after a reload may be another thread's half-done edit; read `agent-browser errors` before blaming yours.
- `export AGENT_BROWSER_SESSION=$BB_THREAD_ID` first. Without it every thread drives the same browser tab.
- Wait on conditions (`agent-browser wait --fn "<js>"`, `wait <selector>`), never `sleep`. Before a screenshot, resize, park the mouse in a corner, and assert the state you claim.
- Drive the game through `window.dt` (`src/core/proof.js`), since agent-browser's own key presses don't reach it: `dt.key('KeyH', { hold, until })`, `dt.pad.press('start')`, `dt.pad.stick(x, y)`, `dt.device()`, `dt.game` (window.game), and `dt.game.moba.focus({ x, z })`, which parks the match camera on a world point (wait ~0.5 s to settle; Flagfall coordinates are scaled, read `dt.game.moba.sim.obstacles` for real positions), and `dt.screen()`, which names splash, lobby, descent, match, paused or result (else the mode id). In dev both are always there; a prod build shows them after a Backquote toggles diagnostics, and `dt` stays when it toggles back.
- The template, no sleeps: `open $URL/` → `wait --fn "window.dt?.screen()==='splash'"` → `eval "dt.key('ArrowRight')"` → `eval "dt.key('Enter')"` → `wait --fn "dt.screen()==='lobby'"` → `eval "dt.key('KeyH')"` → `eval "dt.key('Enter')"` → `wait --timeout 60000 --fn "dt.screen()==='match'"`. `?mode=moba&play&hero=mitts&bots=hard` skips straight to `match`: a fast setup, not a proof of the route.
- Reset match preserves Try Mode settings, including its paused state. Resume explicitly before waiting for a cast, movement or death; repeated resets do not fix a paused capture.
- Frozen builds (`bunx vite build --outDir /tmp/<slug>`) are for checkpoint smokes the orchestrator runs, not for builders.

## Vocabulary

- Screens, in both modes: `splash` (home), `lobby` (walk around, pick, ready up), `match`, `paused`, `result`. `dt.screen()` reports them. The crane and descent are a transition, not a screen. Say screen, never scene: `scene` is the Three.js scene.
- Maps are values of `setup.map` (`?map=`), chosen on the splash and played on the match screen: `overthrow` and `flagfall`. Each brings its own ground and rules. Don't use the old names Slab, Sandlot or plaza.

## Layout

- `src/core/` is the engine; `src/plugins/{dodgeball,online,moba}/` are plugins. The contract is the 10 lines at the top of `docs/plugin-architecture.md`. Core never imports plugins, and plugins never import each other; `tests/boundaries.test.js` enforces this.
- `tests/characterization.test.js` locks dodgeball's behaviour. Its snapshots must stay identical unless a change is deliberate and explained.
- Modes: `/` opens the splash. `?mode=moba&play&bots=easy&hero=fletcher&seed=2&debug` jumps straight into a match with the debug panel.
- Docs: `docs/roadmap.md` (the big picture), `docs/world.md` (setting), `docs/moba-plan.md` (scope, feel, milestones), `docs/moba-lane.md` (map, structures, Ball), `docs/moba-ideas.md` (creative pitches), `docs/network.md`, `docs/verification.md`.

## Orchestration

- The loop is `.claude/skills/loop/SKILL.md`; the queue of next briefs is `.claude/queue/`.
- Build rules every builder follows: `.claude/queue/build-rules.md`.
- The coordinating thread owns instructions, briefs, review and roadmap updates; builder BB threads implement game code in this shared checkout. No worktrees.
- Ping the user when a meaningful visual or feel judgment is ready. Give an actual working local dev URL with the shortest route, a screenshot for layout or a short clip for motion, and one concrete thing to judge. Don't make them decipher an agent report or discover the review point themselves.
