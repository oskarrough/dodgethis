# Goals — stability & game loop

Working list for the improvement loop. Each iteration: pick goals, implement,
verify (`bun run check` + `bun run build`), commit, repeat.

## Iteration 1 — stability bugs (current)

- [x] **Arrows lost over the void** — an arrow/bowl that crosses the court edge
      "lands" floating in mid-air off the platform (arrow.js `update()` grounds at
      `GROUND_Y` regardless of x/z). The AI then chases the unreachable pickup
      straight off the edge. Fix: clamp the landing spot into the court bounds so
      the scarce pool stays intact (also prevents an all-arrows-lost soft-lock).
- [x] **AI walks off the edge** — brains steer straight at targets/arrows with no
      edge awareness. Fix: zero the outward move component near the platform rim.
- [x] **`removeUnit` leaks a held arrow** — removing an AI that holds an arrow
      strands that arrow in `held` state forever (pool shrinks). Ground it first.
- [x] **Collider-debug VRAM leak** — `debugRender()` replaces both BufferAttributes
      every frame without releasing the old GPU buffers. Reuse when sizes match,
      dispose before replacing otherwise.

## Backlog (later iterations)

- [x] Round-by-round AI difficulty ramp (reaction/jitter scale with `roundNum`)
- [x] Reset frame clock on tab re-show (rAF already pauses the sim while hidden)
- [x] Tie-round handling: a double wipe-out in the same step is now a DRAW —
      nobody scores, the round replays. (Win check moved to once-per-step so a
      simultaneous wipe is actually detectable.)
- [x] Automated tests: `bun test` (wired into `bun run check`) covers the
      ballistic solve, the charge meter, and `nearest`. Required extracting
      `tune` into src/tune.js so game logic stops importing lil-gui.
- [x] Headless round-simulation test: tests/round.test.js boots a real Rapier
      world + Round (via `@dimforge/rapier3d-compat`, test-only dep), steps it
      at 60Hz — asserts the AI wipes a passive human, onOver fires once, no
      arrow leaves the court, dispose() empties everything.
- [ ] Gamepad input (plan.md lists stick controls)
- [ ] Arrow types / net down the middle (plan.md open questions)

## Done

(move items here with the commit hash)
