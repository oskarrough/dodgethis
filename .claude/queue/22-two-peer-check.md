Goal: keep a headless two-peer check for moba online play. The online-parity thread wrote a throwaway one (host and guest sims on Flagfall with Pong, each snapshot passed through JSON for ~60 s, comparing flag phase, camps, gates, cover and dropped facts). Turn it into `bun run online:check [--map flagfall] [--seconds 60]` that prints rejected-snapshot count, dropped facts by type and a short host-vs-guest diff table, and add one line to docs/verification.md.

Finish: on main it reports 0 rejected snapshots and 0 dropped facts on both maps; breaking a fact (remove one from FACTS locally) makes it report drops.

Constraints: scripts and docs only. No new unit tests. Under ~30 calls. Commit with jj; don't push.
