# Agent notes

- `agent-browser` is installed; use it for browser testing. Its key presses don't reach the game, so dispatch synthetic KeyboardEvents. In a prod build `window.game` appears only after a Backquote toggles diagnostics.
- Don't use `jj restore`; parallel agents may be working in this checkout.
- Commit only if your brief says so (parallel builds leave it to the orchestrator), and then only your own files, always with a message: `jj commit <paths> -m "…"`. Run `bunx oxfmt <paths>` first, docs included; `bun run check` fails on unformatted markdown. Then `jj bookmark set moba -r @-`. `jj commit <path>` takes every hunk in that file, other threads' edits included, so commit a file only when all its changes are yours and otherwise leave it to the orchestrator. Leave other threads' changes in the working copy; never create an empty-described commit.
- Don't write new unit tests yet; prove changes by playing them. Keep the existing suite green.
- A red check in files you don't own isn't yours: name them in your report and leave them alone. Iterate with `bun test <file>`; finish with `bunx oxlint <your files>`, `bunx oxfmt <your files>` and the test files near your change. In a shared checkout the orchestrator runs the full `bun run check` at the checkpoint, so don't loop on it: other threads' half-done edits make it red.
- Prove browser flows on `bunx vite build --outDir /tmp/<slug>` served on your own port, not the dev server; it hot-reloads when other threads edit. Before a screenshot, resize first, park the mouse in a corner, wait on a sim or DOM condition, and assert the state you claim.
- Deploys happen automatically when `main` moves on GitHub (Cloudflare Workers build). Never run `wrangler deploy` by hand. `bun run build` runs `bun run check` first, so a lint or test failure blocks the deploy. MOBA work lives on the `moba` branch; don't merge it into main without Oskar.

## Layout

- `src/core/` is the engine; `src/plugins/{dodgeball,online,moba}/` are plugins. The contract is the 10 lines at the top of `docs/plugin-architecture.md`. Core never imports plugins, and plugins never import each other; `tests/boundaries.test.js` enforces this.
- `tests/characterization.test.js` locks dodgeball's behaviour. Its snapshots must stay identical unless a change is deliberate and explained.
- Modes: `/` opens the splash. `?mode=moba&play&bots=easy&hero=fletcher&seed=2&debug` jumps straight into a match with the debug panel.
- Docs: `docs/roadmap.md` (the big picture), `docs/world.md` (setting), `docs/moba-plan.md` (scope, feel, milestones), `docs/moba-lane.md` (map, structures, Ball), `docs/moba-ideas.md` (creative pitches), `docs/network.md`, `docs/verification.md`.

## Orchestration

- The loop is `.claude/skills/loop/SKILL.md`; the queue of next briefs is `.claude/queue/`.
- Build rules every builder follows: `.claude/queue/build-rules.md`.
