# Play a MOBA match as an agent

Run `bun scripts/play.js start --session s --seed 2 --seat A1 --replay public/replays/s.json`.
It detaches, prints its pid and first observation, and stays frozen between calls.
Send `bun scripts/play.js act --session s '{"action":"move","x":0,"y":-3}'`.
Each call prints the next observation; invalid JSON/actions can be retried without advancing time.
Use a fresh session name per match; `bun scripts/play.js stop --session s` saves and ends it.
Without `start`, read through `act A1` and send one JSON line on stdin.
Other seats are bots; repeat `--seat` for another agent or `--idle` for idle seats.
With several agents, reply to each `act <seat>` before time advances.
`--help` teaches verbs, ability numbers, healing and coordinates. Orders persist through waits.
`move` never attacks. `attack-move` engages nearby enemies, then resumes its ground route.
`{"action":"cast","slot":"Q","target":"B2"}` aims at the perceived position, not live tracking.
Coordinates are metres: x along the lane, y across it (the sim's z). Times are seconds.
Bearings run from live self to the perceived unit: 0 points +x, 90 points +y.
Self-state is live. Everything else, including the Ball and tells, has normal-bot perception lag.
Rows mark position age with `stale`; dead heroes give remaining respawn time.
There is no fog; nearby minions are distance-filtered. Overflow rows are explicitly counted.
Sections and rows have stable ordering. `view` gives the delayed state's time.

Use `{"action":"wait","seconds":30}` to advance without changing your order.
Only own death, a new enemy tell aimed at you, a Ball spawn or one hit above 10% max HP interrupts.
Events of one kind coalesce within a wait. Re-waiting keeps its original deadline and coalescing.
Other events are counted at that deadline; `denied` and `blocked` include verb and reason.
Pickup approaches the loose Ball and channels automatically while still; throw needs a carried Ball.
Heal at x ≤ −44 for A or x ≥ 44 for B, anywhere across the lane; levels apply automatically.

Accepted decisions append immediately to `<replay>.actions.jsonl`; all inputs to `<replay>.inputs.jsonl`.
Every run, including EOF, SIGINT and SIGTERM, saves a replay. Serve it under `public/`, then open
`?mode=moba&replay=/replays/s.json`. Replay uses the CLI's WASM build and validates its final state.
