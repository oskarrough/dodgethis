# Art week

A week from 2026-10-25 to bring the match look close to the Reference shelf. Arbe directs and judges; builders are agent threads. Oskar sees a before and after at each real step and steers when he likes; "go" means go, with no pick needed.

## What Oskar asked for (keep these in view)

- Look like the references, close, not a nod (look.md, Direction). Ink direction with glow, bloom and painted touches allowed (2026-10-25).
- Floors with life: decals and variety, but plain enough to fight on.
- Detail and polish. Push to main at every breather.
- Reuse techniques across maps, units and objects (the kit, below).
- Light that can change live; a sun slider first, a light picked per match later.
- The real goal is a machine: agents working together so that "make ten maps" is cheap. That means skills in the repo, tools instead of hand work, and above all fast verification: 10% of the time for 90% of the certainty, then move on and polish in a later round.
- Try a cheap model (DeepSeek V4.1 Flash on pi) beside Opus and Astra and compare how they fare.

## How a job runs

1. **Target.** A painter paints over a real match screenshot (`bun run shot <map>`) in the ink direction. Two takes; the judge picks unless Oskar wants to.
2. **Build.** One builder per map, owning its map folder. Shared files (`carve.js`, `rim-dress.js`, `floor-*.js`, `stylepass.js`) have one owner at a time.
3. **Check, fast.** `bun run shot <map> --gray`: one look at each spot against the target, the court lightest in grey, telegraphs loudest, triangles under 300k, no browser errors. Good enough is good enough.
4. **Steer.** The judge answers each step with numbered notes; the builder folds them into the next step.
5. **Push.** `bun run check` and `bun run test` green, commit, push.

## Done

Day 1, 2026-10-25: all three maps rebuilt toward their targets (Altamesa dawn, Flagfall night, Overthrow green morning in `pages/art/*-targets/`); the carving kit; glow; floor decals; carved towers and cores with damage stages; live sun with live shadows; `bun run shot` and `bun run decal-sheet`.

## Next

Tracked as GitHub issues labelled `art-week`.
