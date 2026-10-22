# Dodgethis

A web game: two modes, dodgeball and a MOBA, on one engine.

- Four words (glossary in `docs/extending.md`): core is the engine (`src/core/`); a mode is a game you can play (`src/modes/dodgeball`, `src/modes/moba`); a mod is a piece dropped into a mode (hero, ability, map, mechanic: a folder with `<id>.js`, `<id>-view.js`, `<id>-tune.js`); online is networking (`src/online/`)
- Core imports only core; modes and online import core; nothing imports sideways
- `docs/moba.md` design, `docs/roadmap.md` plan, `docs/verify.md` proving, `docs/build-rules.md` builder rules

## Navigating

- Screens: `/` home (splash) → lobby → match, plus paused and result; `dt.screen()` says which
- `?mode=moba|dodgeball`, `&play` skips the lobby, `&map=overthrow|flagfall`, `&hero=fletcher`
- `&bots=easy|normal|hard`, `&seed=2`, `&debug` for the panel, `&bots-only`, `&fog=0`, `&replay=<tape>`
- `/CODE` joins an online room

## Scripts

- `bun run dev:agent` shared dev server, never stop it
- `bun run check` lint, format, tests
- `bun run simulate --summary` headless bot matches; `play:headless` drives one
- `bun run review` pins a proof to `pages/`
- `bun run where <word>` finds a feature
- `bun run collect-mods` after adding or removing a mod folder
- Read big files with `ast-grep outline` or `grep -n`, never cat; tokens are the budget

## Shared checkout

- Others work here at the same time: touch only your files
- No `jj restore`, worktrees or PRs
- Commit your own files with a user-facing message
- Every push to `main` deploys: push checkpoints, never `wrangler deploy`

## Proving

- No new unit tests; keep the suite green with `bun test <file>`, oxlint, oxfmt
- Schema migration: no per-slice replay or probe proofs; one `bun run simulate --same` sweep at the end (Oskar, 2026-10-22: "trust your code")
- Default: make the change and trust it
- Prove only when the brief asks or the user must judge a look or feel: one screenshot, clip or headless number, once, via `bun run review`
- `pages/` is the pinboard (proofs, pitches, concept art, one folder each, listed in `pages/index.html`), served by the dev server; link there, never to thread storage

## Coordinating

- The coordinator briefs (goal, done means, one proof, owned files), reviews with the reverse model, owns `pages/items.json` and this file
- The user owns the look; questions that can wait go to the inbox
