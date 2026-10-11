# MOBA lane design

M3 and M4 of [moba-plan.md](moba-plan.md). Where the numbers differ, this doc wins. Mirror 3v3, one hero (the Fletcher), shared XP, no items. Every number goes in `tune.js`.

## What awesome means here

- **Readable at a glance.** From any screen you can tell whose ground you're on, what can shoot you and what's shielded. Range rings, target tethers, invulnerability domes and edge pips do that job, alongside the minimap and fog of war.
- **A heartbeat.** Waves meet every 30 s, the objective comes every 2.5 min, and the tempo rises after 10:00. Nobody should spend 40 s with nothing to decide.
- **Fights happen at cover.** Skillshots are the game, so the map is built around what stops them: pillars at mid and near the towers, and hedges between the lane and two flanks. The flanks are there for ganks, because a single strip plays like a treadmill.
- **One twist, on brand: the Ball.** A giant dodgeball appears at mid. Carry it, throw it, dodge it. It doesn't win sieges on its own; it opens them by silencing a structure, which is why every siege starts with a fight at mid. The game is called dodgethis, and the map should say so.

## Layout (x is the lane; team A is at −x)

```
z +13 ┌──────────────── flank ────────────────┐
      │   ┌──hedge──┐   ( lobby )   ┌──hedge──┐   │
 base  core        tower     ○ ● ○     tower        core  base
      │   └──hedge──┘   (  r 9  )   └──hedge──┘   │
z −13 └──────────────── flank ────────────────┘
     −52 −40        −18  −12   0   12  18        40   52
```

- **Bounds:** 104 × 26 m. Walkable is the outer rectangle (|x| ≤ 52, |z| ≤ 13) minus the base walls (|x| > 28 and |z| > 8) and four hedges (12 ≤ |x| ≤ 24, 6 ≤ |z| ≤ 8). That leaves a lane 12 m wide, and a flank 5 m wide on each side, whose centre lines are 21 m apart so a flank fight stays near the lane camera's edge. Each flank opens into the lobby and into the lane just short of each fort; the fort-to-base throat is 16 m wide. The base is |x| ≥ 44: heroes spawn at ±48, and standing in your own base heals 10% of max HP per second.
- **Obstacles:** circles plus axis-aligned boxes, answered by one mode-local module that everything shares, with each sim owning its obstacle list: `walkable`, `clampWalkable`, the rectangular A* grid, path shortcuts, skillshot sweeps and basic-attack sight lines. `obstacles.js` supplies the shapes and queries, including the movement colliders. The conservative grid is built once per mode start (rebuilt on live path-tune changes); inflated free cells and no corner cutting keep its edges safe without per-neighbour sweeps. Shortcuts keep body radius plus clearance, except the first escape leg from a tight start. Line shots stop at the first obstacle and emit a `blocked` fact with a distinct cue and ink burst. Homing basics require a clear sight line before windup but ignore cover after release, like tower orbs; they cannot be dodged behind a pillar. Hedges and pillars block movement and every skillshot. Hedges stand 1.2 m tall, so they never hide a unit from the camera. Pillars (r 1.1): four in the lobby at (±4.5, ±4), and one in front of each tower at (±13, ±3).

## Structures

Every range is from the source's centre to the target's edge. There is no fort or keep: each side has a tower and a core, and the core is invulnerable until its tower falls, and shows a dashed cream dome while it is. Shielded structures are excluded from attack picks; a shielded skillshot hit pulses only that dome. Basic attacks and minions deal full damage to structures, abilities 25%. A structure kill gives the team 300 XP and leaves only opaque, non-colliding rubble; no hero/minion corpse effect. The Ball slice restores the full HP below in every roster size. Geometry and gun damage stay unchanged.

|       | x   | HP   | Damage | Rate | Range | Radius |
| ----- | --- | ---- | ------ | ---- | ----- | ------ |
| Tower | ±18 | 1400 | 165    | 1/s  | 7.75  | 1.2    |
| Core  | ±40 | 6000 | 270    | 1/s  | 9     | 2.5    |

Damage in the table is early-phase damage. At 6:00 guns deal one twentieth of it. Early guns make a three-hero siege need its wave or the Ball; the late reduction lets bot matches close instead of trading defences forever.

- **Targeting:** the nearest minion, then the nearest hero. A structure switches to any enemy hero that damages an allied hero inside its range and holds that target for 2 s after the last hit. Repeated hits on the same hero refresh the hold without restarting the tell or emitting another aggro fact. A switch flashes the guard's tether; only a local victim gets a warning ping. This is the "don't dive" rule, and it's the one thing players need to learn about towers. Shots are homing orbs at 16 m/s that can't be dodged, with a team-coloured tether to the current target. The range ring appears when an enemy hero comes within range + 3 m.

## Minions

- **Waves:** from each core every 30 s, the first at 0:15. Each wave is 3 melee, 2 ranged and 1 wizard (stats in the plan). Taking an enemy fort adds one melee to every later wave of the team that took it, in that lane only. From late game (3:00 on Overthrow, 6:00 on Flagfall) waves come every 20 s, 0.5 s sooner each minute down to 15 s, and a brute joins every wave: 3500 HP, 50 damage, double damage to structures, range 1.2, speed 3, 120 XP. Minion HP and damage gain 4% per whole minute, frozen for each wave. Each minion's snapshot carries `damageScale`. Brutes have a larger body and block helmet, a square tell, their own pose and hit cue, and a separate cached path grid for their radius.
- **Pathing:** they walk the centreline in three files (z −2, 0, +2), 1.2 m apart, and never enter the flanks. Aggro goes to the nearest enemy within 6 m: minion, then structure, then hero. The same call-for-help rule as structures pulls them onto a hero who hits an allied hero. Each chase records its starting point. After travelling more than 8 m from that point, or when its target dies, the minion returns to that x and its lane file. A fresh call-for-help overrides the return leg. Minions plan obstacle-safe routes on new goals or target displacement, not every tick, so all six pass their own tower.
- **Soak and globes:** XP as in the plan (an enemy hero within 12 m). A wizard's globe goes to the team that killed it: that team sees it in its colour and can pick it up (1 m radius), the other sees it grey. +15% max HP, lasts 15 s.

## The Ball

- **Schedule:** spawns land on a fixed clock whatever happened to the last Ball: at the lobby centre at 1:00, right after the second wave, then every 2:30 (every 0:30 from 6:00), each with a 30 s warning (a banner, a filling ring, a whistle). Each Ball lives at most 45 s from its spawn, carried or not, and is replaced sooner if the next scheduled Ball arrives. The HUD counts down to the earlier deadline. Replacing a carried Ball clears any pending throw and emits a deny. Hoarding it in your base buys nothing. The first Ball of a match shows a 10 s sticker saying what it's for, and while you carry a Ball a pointer marks the enemy structure to throw at.
- **Carry:** a 0.75 s pickup while standing on it, interrupted by damage. Eligible heroes from both teams contest it: no channel starts or continues, and a contested cue plays once until the contest clears. Otherwise the nearest eligible hero starts the pickup. The carrier moves at ×0.85 and can't attack, cast or mount. Dying drops the Ball.
- **Throw:** any slot or `primary` press throws toward the aim after a visible 0.3 s windup. Orders (including held RMB resends) queue through the windup. Only stop or cancel aborts it with a deny cue; death drops it. It's a line skillshot (range 5, 14 m/s, radius 0.7) that counts its first hit only. An enemy hero takes 300 damage and a 0.75 s stun, and the Ball drops there. A vulnerable enemy structure takes 20% of its max HP, its guns go silent for 6 s, and the Ball is spent in a confetti burst. An invulnerable structure, a hedge or a pillar bounces it to the ground, and a miss lands at full range. A dropped Ball can't be picked up for 1 s.
- **Interception contract:** `createSim({ intercept })` sends ordinary projectiles and the Ball through the same pre-collision hook: `{ kind: 'projectile'|'ball', shot, from, to, tick, ball, obstacles }`. The swept segment stops at cover or the map boundary; catch cones test it before body damage. Return `true` to consume the flight, or mutate the shot and return `false` to redirect it. `ball.give(hero)` immediately carries it without a pickup channel or refreshed lifetime (false for dead heroes or an expired/missing Ball). Backboard calls `ball.drop('backboard', point)` and returns true; this preserves expiry and starts the one-second pickup lock. Mitts and Pong's actual abilities remain the hero slice.
- **Why range 5:** it reaches a tower's centre from 6.9 m and a core's from 8.2 m. The guns reach a hero's centre from 8.2 and 9.45 m, so scoring always means standing in range, and the defenders' best answer is a dodge. The Ball's 20% (280 damage) leaves a tower at 1,120 HP. Three heroes' basics plus a wave finish that in about 3 s, within the 6 s silence; one hero plus a wave needs about 6.3 s, so the guns resume just before the solo siege finishes.

## Match timer and state

| Time      | Phase     | What changes                                                                                        |
| --------- | --------- | --------------------------------------------------------------------------------------------------- |
| 0:00–3:00 | Early     | Laning; first wave 0:15, trickle XP from 0:30, first Ball 1:00                                      |
| 3:00–6:00 | Objective | A Ball every 2:30; the HUD counts down to the next wave and Ball, or a live Ball's pop              |
| 6:00–     | Late      | One-twentieth-strength guns, waves every 20 s shrinking to 15 s, a brute in each, a Ball every 0:30 |

Win by destroying the enemy core. There's no hard cap. XP comes to about 960/min fully soaked, so level 10 lands around 9–10 min. If seeded bot matches run past 15 min, shorten the Ball interval first. `matchOver` freezes the sim, plays a distinct win cue and burst, shows a banner, and offers R / pad Start to restart. The 3 s slow-motion core shatter (skipped in shared sessions) remains slice 6. The full-lane snapshot includes `match: { phase, nextWave, winner, endedTick }`, team XP/levels, structure vulnerability and killer-team globes `{ id, team, pos, expires }`. Ball-slice snapshot additions, all timers in ticks: `match: { phase, nextWave, nextBall, winner, endedTick }`, `ball: { id, team, contested, releaseTick, releasePos, state: 'warning'|'loose'|'channel'|'carried'|'flying', pos, carrier, channel: { hero, endTick }, shot: { pos, dir, travelled }, pickableAt, popAt }` (null between Balls), `stunUntil` on heroes and `silentUntil` on structures. Facts: `ballContested`, `ballWarn`, `ballSpawn`, `ballChannel`, `ballInterrupted` (damage, movement or contest), `ballPickup`, `ballWindup`, `ballThrow`, `ballHit` (hero or structure), `ballBounce` (shield or cover), `ballDrop` (death, hero hit, bounce or miss), `ballPop` (expired, spent or consumed by an intercept), `ballDenied`. The Ball also records `spawnAt` and `warnAt`; pickup channels record `startTick`, and heroes record `ballThrow: { dir, startTick, endTick }`. A stun cancels a dash or windup; released shots keep flying. Silence cancels a structure's pending tell, not its released orbs.

## Look

The comic-sticker style: flat role fills, ink outlines, cream highlights, halftone on units and structures; lineless colour on terrain. Everything is built from stylised primitives, with no imported assets.

- **Ground:** Overthrow is a quiet pale chalk-marked tarmac court on a finite torn rock edge, above a darker cold violet/teal surround. Sidelines, service lines and a chalk centre circle replace the dashed ink centreline and flank dots. Small opaque team kerbs, base hatching, structure pads and the animated Ball-spawn ring retain their gameplay cues. Lineless forward terrain shares its geometry with opaque depth proxies; restart-only presentation tuning changes neither the 104 × 26 m walking bounds nor the obstacles.
- **Hedges** are rounded `courtShade` boxes with scalloped tops; **pillars** are the M1 cylinders. New palette roles: at most two in `core/style.js`, `road` and `hedge`. Off-screen enemy heroes get a pip at the screen edge, shipped with the flanks.
- **Structures:** the tower is a squat drum, a tapered shaft and a team-coloured cone flag, 4 m tall. The core is a faceted team crystal spinning above a pedestal, 7 m tall and visible from mid; floating team/type labels distinguish tower and core; it cracks (darker facets) at 66% and 33% HP. A silenced structure wears a cream gag of crossed tape.
- **Minions** are the mannequin at 0.6 scale in team colour, told apart by one prop each: a shield disc (melee), a stick (ranged), a cone hat (wizard). The brute is at 1.0 scale with a block helmet. **The Ball** is a cream sphere 1.4 m across with ink seams and a team-coloured ring, held above the carrier. It has no carried shadow; loose or flying it has a flat ink disc. The 1.4 m team-coloured throw strip shows the actual collision width and fills over the windup. On release the sphere travels from its carrier's position and eases down over 0.1 s. Possession banners say you, your team or enemy; while live the HUD shows its remaining 45 s lifetime instead of the next spawn. A structure hit is a goal: scattered coloured confetti, a distinct scoring cue, a 0.09 s solo freeze-frame and screen shake.
