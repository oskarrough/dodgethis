# MOBA lane design

M3 and M4 of [moba-plan.md](moba-plan.md). Where the numbers differ, this doc wins. Mirror 3v3, one hero (the Fletcher), shared XP, no items. Every number goes in `tune.js`.

## What awesome means here

- **Readable at a glance.** From any screen you can tell whose ground you're on, what can shoot you and what's shielded. Range rings, target tethers, invulnerability domes and edge pips do that job, and there's no minimap to lean on.
- **A heartbeat.** Waves meet every 30 s, the objective comes every 2.5 min, and the tempo rises after 10:00. Nobody should spend 40 s with nothing to decide.
- **Fights happen at cover.** Skillshots are the game, so the map is built around what stops them: pillars at mid and near the towers, and hedges between the lane and two flanks. The flanks are there for ganks, because a single strip plays like a treadmill.
- **One twist, on brand: the Ball.** A giant dodgeball appears at mid. Carry it, throw it, dodge it. It doesn't win sieges on its own; it opens them by silencing a structure, which is why every siege starts with a fight at mid. The game is called dodgethis, and the map should say so.

## Layout (x is the lane; team A is at −x)

```
z +13 ┌──────────────── flank ────────────────┐
      │   ┌──hedge──┐   ( plaza )   ┌──hedge──┐   │
 base  core  fort  tower     ○ ● ○     tower  fort  core  base
      │   └──hedge──┘   (  r 9  )   └──hedge──┘   │
z −13 └──────────────── flank ────────────────┘
     −52 −40  −29  −18  −12   0   12  18   29  40   52
```

- **Bounds:** 104 × 26 m. Walkable is the outer rectangle (|x| ≤ 52, |z| ≤ 13) minus the base walls (|x| > 28 and |z| > 8) and four hedges (12 ≤ |x| ≤ 24, 6 ≤ |z| ≤ 8). That leaves a lane 12 m wide, and a flank 5 m wide on each side, whose centre lines are 21 m apart so a flank fight stays near the lane camera's edge. Each flank opens into the plaza and into the lane just short of each fort; the fort-to-base throat is 16 m wide. The base is |x| ≥ 44: heroes spawn at ±48, and standing in your own base heals 10% of max HP per second.
- **Obstacles:** circles plus axis-aligned boxes, answered by one mode-local module that everything shares: `walkable`, `clampWalkable`, the A* grid, path shortcuts (today's `segmentClear` tests circles only) and skillshot sweeps (today's `stepShot` sees enemies only). Hedges and pillars block movement and every skillshot. Hedges stand 1.2 m tall, so they never hide a unit from the camera. Pillars (r 1.1): four in the plaza at (±4.5, ±4), and one in front of each tower at (±13, ±3).

## Structures

Every range is from the source's centre to the target's edge. Each structure is invulnerable until the one in front of it falls, and shows a dashed cream dome while it is. Basic attacks and minions deal full damage to structures, abilities 25%. A structure kill gives the team 300 XP and leaves rubble that nothing collides with.

|       | x   | HP   | Damage | Rate | Range | Radius |
| ----- | --- | ---- | ------ | ---- | ----- | ------ |
| Tower | ±18 | 2400 | 110    | 1/s  | 7.75  | 1.2    |
| Fort  | ±29 | 5000 | 160    | 1/s  | 8.5   | 2.2    |
| Core  | ±40 | 6000 | 180    | 1/s  | 9     | 2.5    |

- **Targeting:** the nearest minion, then the nearest hero. A structure switches to any enemy hero that damages an allied hero inside its range and holds that target for 2 s. This is the "don't dive" rule, and it's the one thing players need to learn about towers. Shots are homing orbs at 16 m/s that can't be dodged, with a team-coloured tether to the current target. The range ring appears when an enemy hero comes within range + 3 m.

## Minions

- **Waves:** from each core every 30 s, the first at 0:15. Each wave is 3 melee, 2 ranged and 1 wizard (stats in the plan). From 10:00 a brute joins every wave: 1500 HP, 50 damage, double damage to structures, range 1.2, speed 3, 120 XP. Minion HP and damage grow 4% per minute.
- **Pathing:** they walk the centreline in three files (z −2, 0, +2), 1.2 m apart, and never enter the flanks. Aggro goes to the nearest enemy within 6 m: minion, then structure, then hero. The same call-for-help rule as structures pulls them onto a hero who hits an allied hero. When a minion is more than 8 m off its path or its target dies, it goes back to the path.
- **Soak and globes:** XP as in the plan (an enemy hero within 12 m). A wizard's globe goes to the team that killed it: that team sees it in its colour and can pick it up (1 m radius), the other sees it grey. +15% max HP, lasts 15 s.

## The Ball

- **Schedule:** spawns land on a fixed clock whatever happened to the last Ball: at the plaza centre at 3:00, then every 2:30 (every 1:30 from 10:00), each with a 30 s warning (a banner, a filling ring, a whistle). Each Ball lives 45 s from its spawn, carried or not, then pops. Hoarding it in your base buys nothing.
- **Carry:** a 0.75 s pickup while standing on it, interrupted by damage. The carrier moves at ×0.85 and can't attack, cast or mount. Dying drops the Ball.
- **Throw:** any slot or `primary` press throws toward the aim. It's a line skillshot (range 5, 14 m/s, radius 0.7) that counts its first hit only. An enemy hero takes 300 damage and a 0.75 s stun, and the Ball drops there. A vulnerable enemy structure takes 30% of its max HP, its guns go silent for 10 s, and the Ball is spent in a confetti burst. An invulnerable structure, a hedge or a pillar bounces it to the ground, and a miss lands at full range. A dropped Ball can't be picked up for 1 s.
- **Why range 5:** it reaches a tower's centre from 6.9 m, a fort's from 7.9 m and a core's from 8.2 m. The guns reach a hero's centre from 8.2, 8.95 and 9.45 m, so scoring always means standing in range, and the defenders' best answer is a dodge. A silenced tower with a wave on it falls to three heroes' basics in about 9 s.

## Match timer and state

| Time       | Phase     | What changes                                                    |
| ---------- | --------- | --------------------------------------------------------------- |
| 0:00–3:00  | Early     | Laning; first wave 0:15, trickle XP from 0:30                   |
| 3:00–10:00 | Objective | A Ball every 2:30; the HUD counts down to the next wave or Ball |
| 10:00–     | Late      | Waves every 20 s with a brute in each, a Ball every 1:30        |

Win by destroying the enemy core. There's no hard cap. XP comes to about 960/min fully soaked, so level 10 lands around 9–10 min. If seeded bot matches run past 15 min, shorten the Ball interval first. `matchOver` gets a 3 s slow-motion core shatter (skipped in shared sessions), a banner, and R to restart. Snapshot additions, all timers in ticks: `match: { phase, nextWave, nextBall }`, `ball: { id, state: 'warning'|'loose'|'channel'|'carried'|'flying', pos, carrier, channel: { hero, endTick }, shot: { pos, dir, travelled }, pickableAt, popAt }` (null between Balls), `stunUntil` on heroes and `silentUntil` on structures. Facts: `ballWarn`, `ballSpawn`, `ballPickup`, `ballThrow`, `ballHit` (hero or structure), `ballDrop`, `ballPop`.

## Look

The comic-sticker style: flat role fills, ink outlines, cream highlights, halftone. Everything is stylised primitives from `makeStyleMaterial`, and there are no assets.

- **Ground:** the lane is a cream-printed road with a dashed ink centreline. The flanks are `courtShade` with halftone dots, so off-road reads as off-road. Each half of the road carries a faint team tint. The plaza is a printed dodgeball centre circle, a callback that costs nothing.
- **Hedges** are rounded `courtShade` boxes with scalloped tops; **pillars** are the M1 cylinders. New palette roles: at most two in `core/style.js`, `road` and `hedge`. Off-screen enemy heroes get a pip at the screen edge, shipped with the flanks.
- **Structures:** the tower is a squat drum, a tapered shaft and a team-coloured cone flag, 4 m tall. The fort is an octagonal drum with crenels and a team banner, 5 m. The core is a faceted team crystal spinning above a pedestal, 7 m tall and visible from mid; it cracks (darker facets) at 66% and 33% HP. A silenced structure wears a cream gag of crossed tape.
- **Minions** are the mannequin at 0.6 scale in team colour, told apart by one prop each: a shield disc (melee), a stick (ranged), a cone hat (wizard). The brute is at 1.0 scale with a block helmet. **The Ball** is a cream sphere 1.4 m across with ink seams and a long printed shadow, tinted by its carrier's team.

## Build order

M2 comes first: hero HP, death, respawn and basic attacks, which the sim doesn't have yet (M1 dummies die by hit count). Then one thread each:

1. **Map and collision:** the layout, the shared obstacle module (movement, paths, shots), the look of the ground, hedges and pillars, and edge pips. Test: shots stop at hedges, and paths never cut through a box.
2. **One tower and waves:** a tower per side with targeting, tethers and call-for-help; waves, aggro and leash; soak XP. Test: waves meet at mid by ~0:28, and the tower switches to a diving hero.
3. **The full lane:** the fort and core chain, levels, killer-team globes, base healing, the win condition, and the HUD clock with levels, played against a scripted hero that walks the lane and casts Q. Test: the invulnerability chain, the globe team rule, and a core kill ending the match.
4. **The Ball:** the schedule, carry, throw, silence, state and facts. It's testable solo by throwing at a tower.
5. **M4 bots:** the lane first, then the Ball. A bot contests when its side has at least as many heroes within 12 m of the Ball and more than half their HP. Otherwise it shadows at 8 m, focuses the carrier to force a drop, and grabs the loose Ball. It throws only at a vulnerable structure or a hero within 4 m.
6. **Later:** the late phase and brutes (tuned from bot matches), brush in the flanks, the core shatter.
