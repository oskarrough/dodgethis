---
name: loop
description: Orchestrate dodgethis work through bb threads. Brief, spawn, verify, report. Use when driving the plugin refactor or the moba mode, or when Oskar says "next" / "gogo".
---

# Loop

1. **Next.** Take the next step from `docs/plugin-architecture.md` (migration) or `docs/moba-plan.md` (milestones). One outcome per thread.
2. **Brief.** At most 10 lines: goal, files, done-check, "don't commit", "report in 5 lines". Save it to `$BB_THREAD_STORAGE/<slug>.md`.
3. **Route.** Opus for design, refactors, and judgment calls. Sonnet for research, scoped edits, and verification.
   `bb thread spawn --project proj_dhp5r3qujz --environment /home/oskar/sites/dodgethis --parent-self --provider claude-code --model claude-opus-5-5 --reasoning-level high --title "<title>" --prompt-file <brief>`
   For Sonnet: `--model claude-sonnet-5-5 --reasoning-level medium`. Never leave the provider on its default (pi/GLM).
4. **Parallel.** Only when the threads touch disjoint files. One writer in `src/` at a time; there's no worktree to protect anyone. Writers may improve what they touch and fix the spec in a line when it's wrong.
5. **Verify.** On completion: `git status --short`, `git diff --stat`, `bun run check`. Docs: `wc -l`; the architecture must stay about 10 lines at its core. Gameplay changes: build a frozen copy (`bunx vite build --outDir /tmp/dodgethis-<step>`) and have a Sonnet thread smoke-test that with `agent-browser`, solo and online, while the next Opus step edits `src/`. agent-browser key presses don't reach the game; use synthetic KeyboardEvents. In a prod build `window.game` appears only after a Backquote toggles diagnostics.
6. **Report.** Three lines to Oskar: what landed, whether it checks out, what's next. Ask only when a call is his. Then go back to step 1.

Rules: no commits unless Oskar asks. Short docs; if a doc keeps growing, the design is too big. A thread that produces a file dump was briefed wrong.
