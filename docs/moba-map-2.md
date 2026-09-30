# MOBA map 2: the sandlot

The second map, after [moba-lane.md](moba-lane.md) ("the paper lane"). Same heroes, structures, minion stats and heartbeat; two lanes instead of one, and capture the flag instead of the Ball. Where the numbers differ, this doc wins. Every number goes in the map's data file.

- **Two lanes make the 3v3 choose.** Leaving a lane unsoaked costs 240 of a team's ~960 XP a minute, and a trip to the other lane and back takes at least 12 s, so teams split 2–1 and pay for every rotation.
- **Capture the flag, on brand.** Each team's flag stands on its own side; take theirs home while yours is still there. The Ball pulls everyone to the middle; the flags send the teams past each other diagonally. Bots follow the rule kids use: two go, one stays.

## Layout (x is the lane; team A is at −x; the map is point-symmetric)

```
z +15 ┌ base  fort    tower ══════════ north lane ══════════ tower    fort  base ┐
   +9 │ ▓▓▓▓▓▓▓▓▓ ━━━━━━  post gap  ━━━━━  mid  ━━━━━  gap  ━━━━━━ ▓▓▓▓▓▓▓▓▓ │
   +3 core ▓▓▓▓▓▓      ⚑A             ○    yard    ○              ▓▓▓▓▓▓ core
   −3 │ ▓▓▓▓▓▓▓▓▓              ○          ○              ⚑B       ▓▓▓▓▓▓▓▓▓ │
   −9 │ ▓▓▓▓▓▓▓▓▓ ━━━━━━  gap  ━━━━━  mid  ━━━━━  post gap  ━━━━━━ ▓▓▓▓▓▓▓▓▓ │
  −15 └ base  fort    tower ══════════ south lane ══════════ tower    fort  base ┘
      −52 −42 −38 −32 −28 −18 −16 −12  −4   0   4   12  16  18  28  32  38 42  52
```

- **Bounds:** 104 × 40 m (|x| ≤ 52, |z| ≤ 20). Lanes are 10 ≤ |z| ≤ 20, centred on z ±15. Between them the yard is |x| ≤ 28, |z| < 8, behind hedges at 8 ≤ |z| ≤ 10 that run 4 ≤ |x| ≤ 12 and 18 ≤ |x| ≤ 28, leaving an 8 m mid gap and two 6 m post gaps per lane. A base block fills 28 ≤ |x| ≤ 38, |z| ≤ 10; the lanes enter a full-height courtyard at |x| ≥ 38. The base is |x| ≥ 46 with map 1's healing; heroes spawn at (±49, 0).
- **Posts and cover:** A's flag at (−16, +3), B's at (+16, −3). Pillars (r 1.1): four in the yard at (±7, ±2), one in front of each tower at (±13, ±13). Nothing stands beside a post.
- **Structures:** per side, a tower in each lane at (±18, ±15), a fort in each at (±32, ±15), and the core at (±42, 0), with map 1's numbers. A fort is vulnerable once its lane's tower falls; the core once either fort falls.
- **Waves:** every 30 s each lane gets half a wave, spawned at (±40, ±15) and walking z ±15 in two files: 2 melee and 1 ranged in one lane, 1 melee, 1 ranged and the wizard in the other, swapping each wave. From 10:00 the brute alternates lanes.

## Capture the flag

- **Rounds:** hoists land on a fixed clock whatever the last round did: the first round opens at 3:00, then every 2:30 (1:30 from 10:00). For 30 s before, both flags climb their poles. A round lasts 60 s; then flags go home and the poles lower. A capture ends the round early, and the poles stay down until the next hoist.
- **Steal:** a 1 s channel within 1 m of the enemy post, interrupted by damage. Any owner within 3 m of their own post contests it: no channel starts. The carrier moves at ×0.85 and can't attack, cast or mount. Death, a stun or any teleport drops the flag, and Tag out never picks a carrier. A dropped flag goes home after 8 s or when an owner touches it; the enemy can re-steal it after 1 s.
- **Capture:** the carrier reaches its own post while its own flag is home; otherwise it waits and `flagDenied` says why. Payoff: 300 team XP, and the losing team's frontmost vulnerable structure in each lane is silenced: 20 s for a tower, 30 s for a fort, 35 s for the core (counted once).

| Time       | Phase  | What changes                                                                    |
| ---------- | ------ | ------------------------------------------------------------------------------- |
| 0:00–3:00  | Early  | Both lanes; first half waves 0:15                                               |
| 3:00–10:00 | Rounds | Hoist 30 s, round up to 60 s, lull to the next hoist; the HUD counts to either |
| 10:00–     | Late   | Waves every 20 s, brute alternating lanes; a hoist every 1:30 on the same clock |

## Why these numbers

- **Lanes 30 m apart:** a one-way rotation through a post gap is at least 6 s at 5 m/s, and the camera sees about 21 m of depth, so nobody sees both lanes. The yard centre is 15 m from each lane, outside the 12 m soak.
- **Posts at (∓16, ±3):** every point of the 3 m contest circle is at least 9.2 m from a tower's centre, past its 8.2 m reach to a hero, and the nearest cover, a hedge corner, is 2.4 m outside the circle. A guard contests in the open or not at all, and stealing is never a dive. A guard pushed off the post still interrupts the 1 s channel with a basic a second, so a steal takes two. Walk 4 s, channel 1 s, carry 8 s: three or four attempts fit a 60 s round.
- **The carry:** posts are 32.6 m apart in a straight line, which clips the yard pillars at (±7, ±2), so a carry is about 8 s. One chaser gains 0.75 m/s walking and 3.1 m per Vault, so an unescorted carrier is caught; escorts and cooldowns decide it, not the head start.
- **Silence by tier:** walking from your post to an enemy tower takes 7–8 s. Two level-4 Fletchers with a half wave need about 9.8, 20.3 and 24.4 s for a tower, fort and core, so each silence is travel plus that plus 2 s. A solo needs 16.5 s for a tower, so the other lane is a feint, not a threat: the silence makes the defenders choose a lane, and three defenders should hold it.

## Bots, online and look

- **Two go, one stays.** The flag step replaces the Ball step: dodge, retreat, flag, fight, push, lane. Roles lock at the hoist and change only on death. Between rounds: one ally per lane, the second in the lane toward the enemy post. **Guard:** holds within 3 m of our post while our flag is home. **Thieves:** go for the enemy post; if a guard contests, they fight the guard with the advantage check waived (2v1 is the plan; tower safety still applies), then channel. **Recovery:** our flag taken, the guard and any thief not carrying chase the carrier. **Carrier:** walks home by the Ball carrier's path rule and, if our flag is away, holds 5 m behind our post; nothing but dodge overrides it. After our capture, all three go to the silenced structure the pair can finish; after theirs, all three defend the nearer one.
- **Online** waits for M6: moba's `apply` still returns false. The start message carries the map id beside the tune hash. Judge whole envelopes, not the flags delta: four more structure records already cost about 0.7 KB idle, and two independent lanes change wave and fact peaks.
- **Look:** Moebius desert, no new palette roles. The yard is `courtShade` hatched in long parallel ink strokes; the lanes keep the cream road and kerbs. Cover is low adobe walls in `scenery`, 1.2 m. Posts are 6 m poles whose team pennant climbs during the hoist, so the flag is its own timer; a carried pennant flies 1.5 m above the carrier and gets an edge pip.

## The seam: maps are data plus one objective

Map 1 becomes `maps/paper-lane.js`: floor, boxes, pillars, lane paths with files, structures with `after` chains (all-of by default, any-of for the sandlot's core), spawns, base zone, ground prints and `objective: 'ball'`. `obstacles.js`, `lane.js`, `path.js` and the printer read that object, not `tune.map`; minions follow `lane.path`. The sim reaches the objective only through `begin`, `control`, `carry(h) → { speed, range }`, `hurt`, `intercept(context) → consumed`, `finish`, `snapshot`, `heroState(h)` and `botGoal`. `ball.js` owns hero `ballThrow`, `match.nextBall`, the `ball` key, its facts and `give`/`drop`, so `sim.js` never says "ball".

## Build order

1. **The seam (map 1 only):** every tick's raw snapshot JSON and facts for 12 minutes of six Fletchers equal the pre-seam commit's, byte for byte, with no `legacyState` rewrite; dodgeball characterization unchanged; a test fails if `sim.js`, `lane.js` or `obstacles.js` names a map id or objective.
2. **Sandlot geometry and lanes** (`?mode=moba&map=sandlot`): paths never cut a box; every contest point lies outside every tower's reach and no cover lies within 2 m of the circle, computed from the data; the measured obstacle-safe carry is 7.5–8.5 s; both lanes' half waves meet at mid within 1 s of map 1's 0:28; the core turns vulnerable after either fort; a lane left empty for a minute soaks 240 XP less (±5%), and a scripted 12 s round trip misses exactly the soak of the minions that died while away.
3. **Flags:** the fixed hoist clock survives an early capture; contest, interrupt, carry speed and no casts; death, stun and Tag out drop or skip the flag; the 8 s return and owner touch; a capture refused while our flag is away, then accepted; silence per tier, one per lane, core once. Matchups: a Vaulting Fletcher catches an unescorted 6 m lead; Mitts' W never stops a basic or Rain aimed at a carrier. An undefended pair finishes each tier inside its silence, three defenders stop it, and a solo can't finish a tower. `scripts/verify-moba-flags.mjs` screenshots hoist, steal, carry, capture and silence at 390, 1440 and 2560 × 1080.
4. **Bots (after 04):** six normal bots, seeds 1–3: each seed captures at least twice before 10:00 and ends in a core kill within 15 minutes; with both guards up, thieves break a guard in at least half the rounds; a carrier never gets conflicting goals when both flags are out. If a seed runs long, shorten the round interval first.
5. **Online (after M6):** 3v3 envelope p95 at most 7 KB, measured with both lanes unsoaked and with two simultaneous sieges.
