# Play a MOBA match as an agent

Run `bun scripts/play.js --seed 2 --seat A1`; `--help` teaches the JSON verbs.
Other seats are bots; repeat `--seat` for another agent or `--idle` for an idle seat.
Read through `act A1`, then send one JSON line. Time stays frozen until every due seat replies.
Coordinates are metres: x along the lane, y across it (the sim's z). Times are seconds.
Bearings are degrees: 0 points +x, 90 points +y. IDs persist through a unit's lifetime.
Self-state is live. The whole world, including the Ball and tells, has normal-bot perception lag.
There is no fog; nearby minions are filtered by distance. Overflow rows are explicitly counted.
Sections and rows have stable ordering. `view` gives the delayed state's time.

Sample observation (excerpt):

```text
seat A1 t=0s view=0s event=decision
self -48,-1.5 hp=1400/1400 lv=1 Q/W/E=0/0/0s order=none
ball none next=180s
tells none
structures tower-B 18,0 hp=2400 open
heroes B1 48,-1.5 96m@0 hp=1400
nearby none
act A1
```

Reply: `{"action":"move","x":0,"y":-3}`. Orders persist; waiting doesn't stop them.
Damage, ready, death, respawn, denied/blocked actions and perceived Ball spawns interrupt waits.
Pickup approaches the loose Ball and channels automatically while still; throw needs a carried Ball.
Every run, including EOF, saves an input replay. Serve it under `public/`, then open
`?mode=moba&replay=/replays/name.json`. Replay runs the CLI's WASM build and validates its final state.
