# Agent notes

- `agent-browser` is installed; use it for browser testing. Its key presses don't reach the game, so dispatch synthetic KeyboardEvents. In a prod build `window.game` appears only after a Backquote toggles diagnostics.
- Don't use `jj restore`; parallel agents may be working in this checkout.
- Commit only your own files, always with a message: `jj commit <paths> -m "…"`. Leave other threads' changes in the working copy; never create an empty-described commit.
- Deploys happen automatically when `main` moves on GitHub (Cloudflare Workers build). Never run `wrangler deploy` by hand. `bun run build` runs `bun run check` first, so a lint or test failure blocks the deploy. MOBA work lives on the `moba` branch; don't merge it into main without Oskar.

## Layout

- `src/core/` is the engine; `src/plugins/{dodgeball,online,moba}/` are plugins. The contract is the 10 lines at the top of `docs/plugin-architecture.md`. Core never imports plugins, and plugins never import each other; `tests/boundaries.test.js` enforces this.
- `tests/characterization.test.js` locks dodgeball's behaviour. Its snapshots must stay identical unless a change is deliberate and explained.
- Modes: dodgeball boots by default, and the MOBA runs at `?mode=moba` (add `&debug` for the tune GUI).
- Docs: `docs/moba-plan.md` (scope, feel, milestones), `docs/moba-lane.md` (map, structures, Ball), `docs/moba-ideas.md` (creative pitches), `docs/network.md`, `docs/verification.md`.

## Orchestration

- The loop is `.claude/skills/loop/SKILL.md`; the queue of next briefs is `.claude/queue/`.
- Build rules every builder follows: `.claude/queue/build-rules.md`.
