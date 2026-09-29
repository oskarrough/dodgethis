---
name: loop
description: Orchestrate dodgethis work through bb threads. Brief, spawn, verify, report. Use when driving the plugin refactor or the moba mode, or when Oskar says "next" / "gogo".
---

# Loop

1. **Next.** Take the lowest-numbered brief in `.claude/queue/` whose "after" is met; delete it once it lands. Add new briefs there as they come up. One outcome per thread.
2. **Brief.** At most 10 lines: goal, files, done-check, "report in 5 lines". Build briefs end with "mashed checkpoint commit on `moba`" and get `.claude/queue/build-rules.md` appended. Reviews use `.claude/queue/review.md`. Save the brief to `$BB_THREAD_STORAGE/<slug>.md`. When a review finds a new class of bug, add a line to build-rules.md so the next build avoids it.
3. **Route.** Opus (claude-code) for design. GPT 6.1 (pi) for building and general work. Sonnet for research and smoke tests.
   `bb thread spawn --project proj_dhp5r3qujz --environment /home/oskar/sites/dodgethis --parent-self --provider claude-code --model claude-opus-5-5 --reasoning-level high --title "<title>" --prompt-file <brief>`
   For Sonnet: `--model claude-sonnet-5-5 --reasoning-level medium`. For GPT: `--provider pi --model openai-codex/gpt-6.1-sol` (if it's missing, run `pi update --all` and upgrade codex). Never leave the provider on its default (pi/GLM).
4. **Parallel.** Only when the threads touch disjoint files. One writer in `src/` at a time; there's no worktree to protect anyone. Writers may improve what they touch and fix the spec in a line when it's wrong.
5. **Verify.** On completion: `git status --short`, `git diff --stat`, `bun run check`. Docs: `wc -l`; the architecture must stay about 10 lines at its core. Gameplay changes: build a frozen copy (`bunx vite build --outDir /tmp/dodgethis-<step>`) and have a Sonnet thread smoke-test that with `agent-browser`, solo and online, while the next build step edits `src/`. agent-browser key presses don't reach the game; use synthetic KeyboardEvents. In a prod build `window.game` appears only after a Backquote toggles diagnostics.
6. **Review.** An adversarial review by the reverse model: GPT reviews Opus designs, Opus reviews GPT builds. Brief it to find what's wrong, not to summarise, and feed its findings to the author.
7. **Failures.** "Interrupted" is often the host daemon dropping, not Oskar: read `bb thread log <id> | tail`, and if it says the daemon disconnected, `bb thread retry <id>`. If Oskar stopped it, leave it. A completion notice with no text: read the report from `bb thread log`.
8. **Report.** Three lines to Oskar: what landed, whether it checks out, what's next. Ask only when a call is his. Then go back to step 1.

Every few steps, spawn an Opus creative thread (name the taste, ban the obvious) and turn the best pitches into queue briefs.

Rules: prototyping, so no git ceremony. Commit only at checkpoints, mashed together ("Add lanes, fix cursor, and tune W"), and one thread finishes entangled work rather than two splitting it. Short docs; if a doc keeps growing, the design is too big. A thread that produces a file dump was briefed wrong.
