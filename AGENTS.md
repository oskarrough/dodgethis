# Dodgethis

A web game: two modes, dodgeball and a MOBA, on one engine.

- Four words (glossary in `docs/extending.md`): core is the engine (`src/core/`); a mode is a game you can play (`src/modes/dodgeball`, `src/modes/moba`); a mod is a piece dropped into a mode (hero, ability, map, mechanic, or a dungeon encounter: a folder with `<id>.js`, `<id>-view.js`, `<id>-tune.js`); online is networking (`src/online/`)
- Core imports only core; modes and online import core; nothing imports sideways
- `docs/moba.md` design, `docs/roadmap.md` plan, `docs/verify.md` proving, `docs/build-rules.md` builder rules
- `docs/world.md` is the world bible: setting, mood, keywords and prompt words for art and music. Read it before you draw, write, name or compose anything
- Images (concept frames, plates, tiles, inlays, sheets) go through the `art` skill (`.agents/skills/art/`, `bun scripts/art-prompt.js`), which builds every prompt from world.md and look.md
- Music is made in Oskar's Jukebox (`oskarrough/jukebox`, https://jukebox.0sk.ar); never build a music tool inside dodgethis

## Navigating

- Screens: `/` home (splash) → lobby → match, plus paused and result; `dt.screen()` says which
- `?mode=moba|dodgeball`, `&play` skips the lobby, `&map=overthrow|flagfall`, `&hero=ibis`
- `&bots=easy|normal|hard`, `&seed=2`, `&debug` for the panel, `&bots-only`, `&fog=0`, `&replay=<tape>`
- `/CODE` joins an online room

## Scripts

- `bun run dev:agent` shared dev server, never stop it
- `bun run check` lint, format and leftovers, a few seconds: run it often
- `bun run test` the unit tests and map smoke, before every push (the pre-push hook runs it under git; jj skips hooks, so run it yourself)
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

- No new unit tests; keep the suite green with `bun test <file>` while iterating and `bun run test` before pushing
- Default: make the change and trust it
- Prove only when the brief asks or the user must judge a look or feel: one screenshot, clip or headless number, once, via `bun run review`
- `pages/` is the pinboard (proofs, pitches, concept art, one folder each, listed in `pages/index.html`), served by the dev server; link there, never to thread storage

## Voice

Everything we write for players or for each other (game text, tooltips, docs, presentations, briefs) should read like the Warcraft II manual and its mission briefings, not like a startup pitch deck. Picture a narrator who believes in the world and has been there: a little gravitas, some dry humour, and concrete detail about the places, the creatures and what happens to you.

- Write whole sentences that flow and have some rhythm and warmth. No staccato fragments ("Fast. Fun. Co-op."), no slogans, no em-dash punchlines, no bullet lists of three-word phrases
- Explain a mechanic the way a good manual does: what you see, what you do, and what befalls you if you don't
- Keep headings short and nominal: a place, a foe or a rule. Never a rhetorical question
- Leave out startup and AI vocabulary: "seamless", "unlock", "elevate", "core loop", "delightful", "game-changer", "it's not X, it's Y"

## Coordinating

- The coordinator briefs (goal, done means, owned files; a proof only when Oskar must judge a look or feel), reviews with the reverse model, owns `pages/items.json` and this file. Briefs never ask for replay sweeps, probes or proof pages unless Oskar does (2026-10-22)
- The user owns the look; questions that can wait go to the inbox
