# Agent notes

- Use jujutsu version control when `jj` is available
- Keep learnings in the repo (docs, this file), never in a harness's private memory; the user works across many harnesses.
- Don't use `jj restore`; parallel agents may be working in this checkout.
- Commit only if your brief says so (parallel builds leave it to the orchestrator), and then only your own files, always with a message: `jj commit <paths> -m "…"`, and no Co-Authored-By or other agent trailers. Run `bunx oxfmt <paths>` first, docs included; `bun run check` fails on unformatted markdown. Then `jj bookmark set main -r @-`. `jj commit <path>` takes every hunk in that file, other threads' edits included, so commit a shared file only when `jj diff <path>` shows nothing but your hunks; otherwise leave it to the orchestrator and list your hooks in the report. Leave other threads' changes in the working copy; never create an empty-described commit. When parallel threads have tangled the same files, the orchestrator may commit unrelated features together rather than hand-split hunks; name each feature in the message. Never `jj squash`, `split`, `abandon` or rebase commits you didn't make; add a new commit instead.
- Tokens are the scarce resource (Oskar keeps hitting session limits). Proof budget: one screenshot, clip or headless number per change, taken once; never repeat a passing proof, never run simulate sweeps or the full check unless the brief asks. If a proof turns fiddly, stop and report the gap. For small visual or timing tweaks Oskar asked for himself, skip the proof: he tests them.
- Don't write new unit tests yet; prove changes by playing them. Keep the existing suite green.
- A red check in files you don't own isn't yours (another thread's half-done edit; don't `git archive` main to prove it): name them in your report and leave them alone. Iterate with `bun test <file>`; finish with `bunx oxlint <your files>`, `bunx oxfmt <your files>` and the test files near your change. In a shared checkout the orchestrator runs the full `bun run check` at the checkpoint, so don't loop on it: other threads' half-done edits make it red.
- The machine is shared: browser sessions and full checks starve each other (load past 12 turns timing tests into random failures). Open a browser only when the change is visual or someone asked, and close it when done.
- Commit freely but don't push: every push to `main` deploys and costs CI. Push only when Oskar asks or the orchestrator ships a batch (Oskar, 2026-10-10).
- The game ignores reduced-motion settings: every animation always plays. Never add `prefers-reduced-motion` paths (Oskar, 2026-10-10).
- Deploys happen automatically when `main` moves on GitHub (Cloudflare Workers build). Never run `wrangler deploy` by hand. `bun run build` runs `bun run check` first, so a lint or test failure blocks the deploy. MOBA work goes on `main`.

## Git worktrees

- A bb thread may land in a plain git worktree: no `node_modules`, no jj. Run `bun install` first (a second or two), then use git; the jj lines above don't apply.
- To land: commit only your own files with a user-facing message, `git fetch origin && git rebase origin/main`, rerun the tests near your change, then `git push origin HEAD:main`. If the push is refused because main moved, fetch, rebase and push again. Never force-push.

## Balance and bot experiments

- `bun run simulate --summary` runs bot simulations: headless bot matches, compact tables, no logs. `--base` replays the same seeds on another revision and prints deltas with approximate 95% intervals and a verdict; `--report` adds per-ability, death-cause and bot-state sections; `--set bots.exp.<flag>=0,1` toggles a logic variant. Read the simulation section of `docs/verification.md` before building your own harness, git archive or env-var hack.
- Full logs (`bun run simulate` without `--summary`) feed `bun run simulate --logs runs`, DuckDB over saved match logs, for questions the simulation tables don't answer.

## Browser proofs

- Before opening a browser or proving a change by play, read `.claude/skills/verify/SKILL.md`: which proof to pick, the shared dev server, `window.dt`, evidence and cleanup. Every visual proof, clip or variant goes through `bun run review -- --title … --ask … --thread $BB_THREAD_ID <files>`; reports link http://office-linux.heron-mermaid.ts.net:5173/docs/pages/, never thread-storage paths. `bun run review` also edits the shared `docs/pages/items.json`: builders commit only their page folder and leave `items.json` to the orchestrator. Oskar plays at http://office-linux.heron-mermaid.ts.net:5173, never `127.0.0.1`.

- Every HTML artifact lives in `docs/pages/<slug>/` and gets a row in `docs/pages/index.html` (title, what, date, status To review / Decided / Archived, Oskar's decision). The orchestrator updates the row when Oskar decides.
- HTML artifacts (pitches, look pages, review) link `/docs/page.css` with `<body class="page">` and are plain semantic HTML: no CSS or styling classes of their own.

## Vocabulary

- Screens, in both modes: `splash` (home), `lobby` (walk around, pick, ready up), `match`, `paused`, `result`. `dt.screen()` reports them. The crane and descent are a transition, not a screen. Say screen, never scene: `scene` is the Three.js scene.
- Maps are values of `setup.map` (`?map=`), chosen on the splash and played on the match screen: `overthrow` and `flagfall`. Each brings its own ground and rules. Don't use the old names Slab, Sandlot or plaza.

## Layout

- `src/core/` is the engine; `src/plugins/{dodgeball,online,moba}/` are plugins. The contract is the 10 lines at the top of `docs/plugin-architecture.md`. Core never imports plugins, and plugins never import each other; `tests/boundaries.test.js` enforces this.
- `tests/characterization.test.js` locks dodgeball's behaviour. Its snapshots must stay identical unless a change is deliberate and explained.
- Modes: `/` opens the splash. `?mode=moba&play&bots=easy&hero=fletcher&seed=2&debug` jumps straight into a match with the debug panel.
- Where is X: read `docs/feature-map.md` first (grep it for the player's word). Whoever adds or moves a feature updates its line there. `tune.js` holds match rules and assembles each map's, the lobby's and each hero's tune file (`maps/*-tune.js`, `front/lobby-tune.js`, `<hero>-tune.js`); edit the block where it lives, and read the landmark, not the file.
- To see a file's symbols without reading it: `ast-grep outline <file>`. For structural search (callers of a function, every `tune.x.y` use) use `ast-grep run -p '<pattern>' -l js src` instead of regex grep. Never `cat` a doc or any file over ~150 lines: `ast-grep outline` (or `grep -n` for docs) first, then `sed -n` only the range you need. Every token you read is re-read on every later call.
- Docs: `docs/roadmap.md` (the big picture), `docs/world.md` (setting), `docs/moba-plan.md` (scope, feel, milestones), `docs/moba-lane.md` (map, structures, Ball), `docs/moba-ideas.md` (creative pitches), `docs/network.md`, `docs/verification.md`, `docs/sound.md` (music and sound effects).

## Orchestration

- The loop is `.claude/skills/loop/SKILL.md`; the queue of next briefs is `.claude/queue/`.
- Build rules every builder follows: `.claude/queue/build-rules.md`.
- The coordinating thread owns instructions, briefs, review and roadmap updates; builder BB threads implement game code in this shared checkout. No worktrees.
