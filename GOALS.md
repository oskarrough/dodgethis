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

- [ ] Round-by-round AI difficulty ramp (reaction/jitter scale with `roundNum`)
- [ ] Pause the sim when the tab is hidden (visibilitychange), not just dt-clamp
- [ ] Tie-round handling: both teams wiped in the same step currently scores B's
      wipe-out check first (A checked first → winner B). Decide draw vs replay.
- [ ] Gamepad input (plan.md lists stick controls)
- [ ] Arrow types / net down the middle (plan.md open questions)
- [ ] Some automated smoke test (boot headless, step N frames, assert no throw)

## Done

(move items here with the commit hash)
