# MOBA map 2: the sandlot

The second map, after [moba-lane.md](moba-lane.md) ("the paper lane"). Same heroes, structures, minion stats and heartbeat; two lanes instead of one, and capture the flag instead of the Ball. Where the numbers differ, this doc wins. Every number goes in the map's data file.

- **Two lanes make the 3v3 choose.** Soak XP needs a hero within 12 m, and the lanes are 30 m apart, so a team that stacks gives up half its XP. Someone always goes alone, and the edge pips are how the other team finds out who.
- **Capture the flag, on brand.** The playground's other great game. Each team's flag stands on its own side; take theirs home while yours is still there. The Ball pulls everyone to the middle; the flags pull the teams past each other diagonally, and a capture makes the loser defend both lanes at once. Bots follow one rule, the one kids use: two go, one stays.

## Layout (x is the lane; team A is at −x; the map is point-symmetric)

```
z +15 ┌ base  fort    tower ══════════ north lane ══════════ tower    fort  base ┐
   +9 │ ▓▓▓▓▓▓▓▓▓ ━━━━━━  post gap  ━━━━━  mid  ━━━━━  gap  ━━━━━━ ▓▓▓▓▓▓▓▓▓ │
   +5 core ▓▓▓▓▓▓      ⚑A             ○    yard    ○              ▓▓▓▓▓▓ core
   −5 │ ▓▓▓▓▓▓▓▓▓              ○          ○              ⚑B       ▓▓▓▓▓▓▓▓▓ │
   −9 │ ▓▓▓▓▓▓▓▓▓ ━━━━━━  gap  ━━━━━  mid  ━━━━━  post gap  ━━━━━━ ▓▓▓▓▓▓▓▓▓ │
  −15 └ base  fort    tower ══════════ south lane ══════════ tower    fort  base ┘
      −52 −42 −38 −32 −28 −18 −16 −12  −4   0   4   12  16  18  28  32  38 42  52
```

- **Bounds:** 104 × 40 m (|x| ≤ 52, |z| ≤ 20). Lanes are 10 ≤ |z| ≤ 20, 10 m wide, centred on z ±15. Between them the yard is |x| ≤ 28, |z| < 8, behind hedges at 8 ≤ |z| ≤ 10 that run 4 ≤ |x| ≤ 12 and 18 ≤ |x| ≤ 28. That leaves an 8 m mid gap and two 6 m post gaps per lane. A base block fills 28 ≤ |x| ≤ 38, |z| ≤ 10, so the yard opens only onto the lanes, which enter a full-height courtyard at |x| ≥ 38. The base is |x| ≥ 46 with map 1's healing; heroes spawn at (±49, 0).
- **Posts:** A's flag at (−16, +5), B's at (+16, −5). Pillars (r 1.1): four in the yard at (±7, ±2), one beside each post at (∓12, ±3), and one in front of each tower at (±13, ±13).
- **Structures:** per side, a tower in each lane at (±18, ±15), a fort in each at (±32, ±15), and the core at (±42, 0), with map 1's HP, damage, rate, range and XP. A fort is vulnerable once its lane's tower falls; the core once either fort falls.
- **Waves:** every 30 s each lane gets half a wave, spawned at (±40, ±15) and walking z ±15 in two files 1.5 m either side: 2 melee and 1 ranged in one lane, 1 melee, 1 ranged and the wizard in the other, swapping each wave. From 10:00 the brute alternates lanes too.

## Capture the flag

- **Rounds:** the first opens at 3:00, then every 2:30 (every 1:30 from 10:00). For 30 s before, both flags climb their poles with a whistle at the top. A round lasts 60 s, and then carried and dropped flags go home and the poles lower. One capture ends the round early.
- **Steal:** a 1 s channel within 1 m of the enemy post, interrupted by damage. Any owner within 3 m of their own post contests it: no channel starts. The carrier moves at ×0.85 and can't attack, cast or mount. Death or a stun drops the flag. A dropped flag goes home after 8 s, or at once when an owner touches it; the enemy can re-steal it after 1 s.
- **Capture:** the carrier reaches its own post while its own flag is home. If it isn't, the carrier waits: that's the standoff, and a `flagDenied` cue says why. Payoff: 300 team XP, and the losing team's frontmost vulnerable structure in each lane is silenced for 20 s (the core counts once).

| Time       | Phase  | What changes                                                              |
| ---------- | ------ | ------------------------------------------------------------------------- |
| 0:00–3:00  | Early  | Both lanes; first half waves 0:15                                          |
| 3:00–10:00 | Rounds | Hoist 30 s, round 60 s, lull 60 s; the HUD counts to the hoist or round end |
| 10:00–     | Late   | Waves every 20 s, brute alternating lanes; a flag is always up or rising   |

## Why these numbers

- **30 m between lane centres:** a rotation through a post gap takes 6 s at 5 m/s, well inside a 30 s wave, so a solo can help and get back. The camera sees about 21 m of depth, so nobody sees both lanes at once. The yard centre is 15 m from each lane, outside the 12 m soak: loitering there earns nothing.
- **Posts at (∓16, ±5):** a thief standing 1 m off the post is 9.2 m from the nearest tower, past its 8.2 m reach to a hero's centre, so stealing is never a dive. The posts are 34 m apart: an 8 s carry, in which a full-speed chaser gains 0.75 m/s and closes a 6 m lead just at the post. Escorts decide it. The straight line between posts passes (±7, ±2.2), so the carry brushes a pillar and every chase has cover.
- **1 s channel, 3 m contest, 60 s rounds:** a guard standing on the post blocks the steal outright, and one pushed off it still interrupts with a basic a second, so stealing takes two. To contest, the guard stands in the open, where Q lines reach. Walk 4 s, channel 1 s, carry 8 s: three or four attempts fit a round, and a 60 s lull remains for laning.
- **Half waves, same HP:** minion count and XP per minute equal map 1's, so level 10 still lands near 9–10 min. One lane's chain is map 1's 13,400 HP, so a second lane is an option, not a tax.
- **20 s silence:** walking from your post to an enemy tower takes 7–8 s. On map 1's numbers, three heroes with a wave kill 2400 HP in about 7 s, two in about 9. So a pair can take one tower while the third threatens the other, and the defenders have to split too.

## Bots, online and look

- **Two go, one stays.** The flag step replaces the Ball step: dodge, retreat, flag, fight, push, lane. Between rounds, one ally per lane, the second in the lane with the enemy post. In a round, the ally nearest our post guards it (within 3 m); the other two steal. Our flag taken: everyone focuses the carrier. We carry: escorts use the Ball rule, and the carrier waits behind the post pillar if our flag is away. After our capture, all three go to the silenced structure with the least HP; after theirs, all three defend it. A human fills whichever role they're nearest. Tower safety still gates everything.
- **Online:** the start message carries the map id beside the tune hash, and a guest on another map refuses. `flags` is under 0.2 KB per snapshot. The hoist is a 30 s fixed-tick tell, and contest and channel are host-only, like the Ball's. The predictor's Ball-carry field becomes the objective's `carry`.
- **Look:** Moebius desert, no new palette roles. The yard is `courtShade` hatched in long parallel ink strokes instead of halftone dots; the lanes keep the cream road and kerbs. Cover is low adobe walls in `scenery` with a cream coping, 1.2 m tall like hedges. Posts are 6 m poles whose team pennant climbs during the hoist, so the flag is its own timer. A carried pennant flies 1.5 m above the carrier and gets an edge pip. The mid gaps carry a printed hopscotch grid.

## The seam: maps are data plus one objective

Map 1 becomes `maps/paper-lane.js`: floor, boxes, pillars, lane paths with files, structures with `after` chains (all-of by default, any-of for the sandlot's core), spawns, base zone, ground prints, and `objective: 'ball'`. `obstacles.js`, `lane.js`, `path.js` and the ground printer read that object instead of `tune.map`; minions follow `lane.path`, not the x axis. The sim talks to the objective only through the hooks the Ball already uses: `begin`, `control`, `carry(h) → { speed, range }`, `hurt`, `finish`, `snapshot`, plus a `botGoal` step. Each module owns its snapshot keys, facts and intercept context, so map 1's snapshot stays byte-identical and `sim.js` never says "ball".

## Build order

1. **The seam (map 1 only):** the six-Fletcher fixture and dodgeball characterization stay identical; a test fails if `sim.js`, `lane.js` or `obstacles.js` names a map id or objective.
2. **Sandlot geometry and lanes** (`?mode=moba&map=sandlot`): paths never cut a box; every post's channel spot lies outside every tower's reach, computed from the data; both lanes' half waves meet at mid within 1 s of map 1's 0:28; the core turns vulnerable after either fort; a hero at the yard centre soaks nothing; scripted-vs-idle kills the core before 10:00 through each lane.
3. **Flags:** the round clock through 10:00; contest blocks a channel and damage interrupts it; carry speed and no casts; death and stun drop; the 8 s return and owner touch; a capture refused while our flag is away, then accepted when it returns; silence hits one structure per lane and the core once; round expiry sends both home; every fact presents once. `scripts/verify-moba-flags.mjs` drives hoist, steal, carry, capture and silence with screenshots at 390, 1440 and 2560 × 1080.
4. **Bots (after 04):** six normal bots, seeds 1–3, each end in a core kill within 15 minutes; during rounds with our flag home, a living ally is within 3 m of our post ≥ 80% of ticks; between rounds each lane holds an ally ≥ 70% of ticks. If a seed runs long, shorten the round interval first. Look and online: screenshots at 1440 × 900 of a hoist, an escorted carry and two taped towers; the 3v3 envelope p95 stays at most 7 KB.
