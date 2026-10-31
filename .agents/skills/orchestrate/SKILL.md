---
name: orchestrate
description: Run several agent threads on dodgethis at once as their coordinator, briefing, steering and judging. Use when a job is bigger than one thread (several maps, a look pass, a set of tools), or when Oskar says go and leaves you in charge.
---

# Orchestrate

The coordinator holds the goal and the bar; builders hold the code.

## Who does what

- **A standing builder per area.** One thread that keeps the code in its head beats a fresh thread per task: it learns the map code once and then builds three maps, structures, lights and units. Send follow-ups with `bb thread tell` to that thread. Start fresh threads for one-off paintings and standalone tools.
- **Pick the model for the job.** GPT Astra (Codex) for big visual builds and every image. Opus for tools and careful plumbing; it catches bugs in the brief. A cheap model (DeepSeek Flash on pi) for well-specified jobs that have a recipe and a check. It follows recipes in one pass, but its own eye is weaker, so judge its look work.
- **Painting is a service.** Code threads ask a painter thread by message for an image with an exact path and spec, then wait. Never ask a thread that can't make images to make one.
- **The coordinator doesn't dig.** Hunting through code for where a thing lives is a worker's job, even a small one: hand it to a cheap model with the leads you have, and stay free to talk with Oskar.

- **Spread across machines.** office-linux has the GPU and Oskar's dev server: browser, shot and clip jobs go there. Headless jobs (simulate, docs, logic, tuning) go to hetzner (`bb thread spawn --machine hetzner --new-environment worktree`); it is slower, which shows up slowness that a fast box hides.

## The brief

Six parts, every time: the goal (in the player's terms, plus the target image), the skill to read, the files it owns, the files it must not touch (and who's in them), the fast check, and how to report (`bb thread tell <coordinator> '<what, the shot path>'`). Briefs missing the off-limits line cause collisions.

## Steering

- Steer the first step or two hard, with numbered notes, each a look fact ("the haze swallows the cliff"), not a code instruction. Then let go: "send a compare every two steps", "go to the end".
- Judge with `bun run shot <map> --compare <target> --gray`: one picture, one look.
- When a builder reports a bug in a file you own, fix it at once and tell them; when a builder needs a shared file, hand it over by name for one job.

## Keep the thread

Long sessions drift. Keep the plan and every next step in GitHub issues, labelled per project, and close them in commit messages. Report to Oskar per real beat with one before-and-after image; a decision he must make becomes an issue assigned to him (AGENTS.md, Coordinating).
