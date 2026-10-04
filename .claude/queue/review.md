Model: reverse of the author (GPT reviews Opus, Opus reviews GPT). After: the thing under review lands.
Adversarial review of <WHAT> in dodgethis `?mode=moba`. Context: `docs/moba-plan.md`, `docs/moba-lane.md`, `docs/plugin-architecture.md`, the diff since the last checkpoint.
Review the named commit (`jj show <rev>`) or doc, never the live working copy: other threads are writing in it. Find what's wrong; don't summarise. Bugs, feel regressions (judder, input lag, unreadable telegraphs), numbers that don't add up, boundary violations, dodgeball changes (characterization snapshots must be identical), missing tests for tricky logic.
Don't edit files. At most 8 findings, most severe first, one or two lines each with a concrete fix.
