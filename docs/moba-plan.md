# MOBA mode plan

A small Heroes of the Storm-style mode: the smallest thing that already feels like HotS in your hands. One lane, shared team XP, no items, no last-hitting, short matches, dodgeable skillshots. Feel first; MOBA systems after the hero feels right on an empty floor. Contract: [plugin-architecture.md](plugin-architecture.md). Metres, seconds, 60 Hz; HotS units read as metres.

## Scope

- **Match:** 3v3 (human + 2 bot allies vs 3 bots), all the same hero. Destroy the enemy core. 8–12 minutes. Boots with `?mode=moba` until the hub plugin exists.
- **Map:** one flat lane along x, 96 × 16 m. Per side: tower ±22, fort ±32, core ±42, base ±46. The base heals 10% max HP/s. A few round pillars.
- **Structures** (no ammo; HotS removed it in 2017). Each is invulnerable until the one in front falls. Abilities deal 25% to structures; a kill is worth 300 XP.

|       | HP   | Damage | Rate | Range | Targets                    |
| ----- | ---- | ------ | ---- | ----- | -------------------------- |
| Tower | 2400 | 110    | 1/s  | 7.75  | nearest minion, then hero  |
| Fort  | 5000 | 160    | 1/s  | 8.5   | same                       |
| Core  | 6000 | 180    | 1/s  | 9     | same; death ends the match |

- **Minions:** a wave every 30 s from each core, first at 0:15. Each wave is 3 melee, 2 ranged and 1 wizard; the wizard drops a regen globe (+15% HP, either team). They walk the centreline and take the nearest enemy within 6 m: minion, then structure, then hero. They are plain agents, not character controllers. A dying minion's XP goes to the enemy team if any enemy hero is within 12 m, which replaces last-hitting.

|        | HP  | Damage | Rate   | Range | Speed | XP  |
| ------ | --- | ------ | ------ | ----- | ----- | --- |
| Melee  | 400 | 18     | 0.67/s | 0.9   | 3.5   | 40  |
| Ranged | 280 | 30     | 0.67/s | 5     | 3.5   | 40  |
| Wizard | 220 | 15     | 0.67/s | 3     | 3.5   | 40  |

- **XP:** XP to go from level L to L+1 is `600 + 100(L−1)`, 9000 total to reach the cap of 10. Passive trickle is 8 XP/s from 0:30. A takedown is worth `200 + 40 × victim level`. Each level gives +4% HP and damage. The death timer is `6 + 2 × level` s.
- **Hero, the Fletcher:** 1400 HP, 5.0 m/s. Basic attack: 90 damage, 5.5 m range, 1/s, homing.

| Key   | Name     | What it does                                                                                                        |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| Trait | Momentum | A Q hit on a hero (including training dummies) takes 2 s off Vault's cooldown                                       |
| Q     | Loose    | Line skillshot, first hit. Cast point 0.133 s, range 11, 24 m/s, radius 0.3, 140 damage, cooldown 4                 |
| W     | Vault    | `dash(dir, { distance: 4, time: 0.18 })` toward aim, cooldown 3. Blocked by structures                              |
| E     | Rain     | Ground circle. Range 10, radius 2.5, lands after 0.7 s, 180 damage, 30% slow for 1.5 s, cooldown 6                  |
| R     | Volley   | Heroic, unlocks at level 10. Piercing line, cast point 0.5 s, range 30, 30 m/s, radius 0.8, 320 damage, cooldown 60 |
| Mount | —        | 1 s channel, then `speedMul` 1.3. Movement cancels the channel; damage, attacking or casting dismounts              |

- **Bots:** hero bots write intent frames into `app.intents` inside `simulate`. They stay 2–4 m behind their minions, poke with a led Q (reaction and jitter as in dodgeball's `tune.ai`), drop W on clumps, sidestep telegraphs, retreat below 35% HP and return at 90%.
- **Cut:** talents (Oskar's call), mana, items, extra lanes, mercenary camps, hearthstone, gates, fountains, shift-queue, attack-move, minimap, catch-up XP, and more than one hero.

## Controls

The mode declares the `pointClick` scheme. Moba sees one frame per participant, `{ move, order, aim, held, pressed: [{ action, at }], released }`, and one cast rule for both devices: a `slotN` press edge whose `at` is the aim at that moment.

| Action              | Mouse and keyboard                     | Pad                                                                            |
| ------------------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| `order` (point)     | RMB, re-sent every 100 ms while held   | —                                                                              |
| `move`              | —                                      | left stick, deadzone 0.18, curve exponent 1.5                                  |
| `aim`               | cursor ground point                    | `input.stickAim(dir, mag, slot)`: hero + dir × range × remap(0.25–0.9 → 0.3–1) |
| `slot1–4` (Q W E R) | quick-cast on key-down                 | RB RT LB LT: hold to aim (`held.slotN` shows the indicator), fire on release   |
| `slot5` (mount)     | Z                                      | X                                                                              |
| `primary` (attack)  | — (RMB on an enemy resolves to attack) | A: best target in a 45° cone within 1.5 × attack range, heroes first           |
| `stop` / `cancel`   | S                                      | B cancels a held cast, and always sends `cancel`                               |

Moba resolves `order` in `simulate`: an enemy collider within 0.6 m of the point (heroes first) means attack, anything else means move. The distance is to the unit's silhouette on the ground (its axis projected along the view), because a click on a torso lands about a metre behind the feet. Hover highlight is local presentation. With the stick neutral, pad aim falls back to the nearest enemy hero in range, then to facing. Aim assist lives in `stickAim`: within 10° of an enemy hero, bend Q's aim 60% toward it.

## Feel numbers

Obedience from HotS, springs and juice from dodgethis. Everything below is moba's movement profile and tune section, so all of it is tunable.

| Tunable           | Dodgeball | Moba | Why                                                                        |
| ----------------- | --------- | ---- | -------------------------------------------------------------------------- |
| `speed`           | 6.5       | 5.0  | HotS 4.84; mounted 6.5                                                     |
| `accel`           | 14        | 40   | Full speed in ~25 ms                                                       |
| `friction`        | 8         | 14   | Full-speed reversal in ≤ 8 ticks. If it feels weightless, lower this first |
| `stopFriction`    | 16        | 30   | Stops dead                                                                 |
| jump, air, coyote | on        | off  | Flat lane                                                                  |

- **Facing is cosmetic.** Yaw turns at 1080°/s and snaps to the cast direction when a cast starts. Nothing waits on it.
- **Pathing (moba-side):** go straight if the segment clears every static circle. Otherwise A* on a 0.5 m grid of the static layout, then string-pulling. Follow a carrot 0.8 m ahead. In the last metre the wish speed is `min(speed, dist/dt)`, with an arrival radius of 0.05 m: no overshoot, no easing. Repath if progress stays under 30% for 0.25 s. Clicks off the walkable area clamp to the nearest walkable point. The body gets a wish vector plus a max speed.
- **Click ping:** a team-coloured ring that contracts over 0.25 s, plus a tick sound. Attack orders ping red on the target.
- **Casts:** the hero is rooted for the cast point and the aim is frozen at `at`. Movement during a cast point is kept, and the previous order resumes at release. Only channels (mount, and R's cast) cancel on move, stop or cancel. Abilities have no backswing. Basic attacks have 0.15 s windup and 0.25 s backswing. Stop and movement (stick or a move order) cancel the windup without firing; any new order, stop, stick movement or casting cancels the backswing (stutter-step). Slot presses during windup buffer for the first tick of backswing, or flash denied if they cannot become legal within the buffer.
- **Buffering:** the core buffers slot edges for 0.15 s. Moba keeps one slot where the latest press wins, fires it on the first legal tick, and clears it on stop or death. A press on cooldown outside the buffer flashes the HUD icon for 60 ms.
- **Skillshots** are swept circles, not Rapier bodies. They're registered with `app.smooth`. Q's dodge window at 8 m is about 0.47 s. Tune projectile speed before anything else.
- **Telegraphs:** your own indicators while held: a line for Q and R, a circle for W, an arrow for E. Enemies see W's circle for its full 0.7 s, filling toward impact, and R's line during its cast point. Your Q's tell is the pose, the yaw snap and a bright trail. The sparring dummy freezes its aim and shows enemies a filling line for 0.4 s before releasing Q; basic attacks have their own pose. A near miss within 0.8 m plays the "close" cue for both players (moba has its own detector).
- **Hit feedback:** via juice-kit verbs. Every hit gets a 70 ms flash, a squash and a few chips. Hits on you add shake 0.15 and rumble (0.2, 0.3, 60 ms); your hits on a hero add a hitmarker and rumble (0.1, 0.2, 40 ms). HP bars tick every 200. Gold XP numbers float up. Your own takedowns get `clock.scale` hitstop (65 ms), which is ignored when the session is shared. A structure kill adds shake 0.6, an FOV kick and a banner.
- **Camera:** `camera.frame(dt)` follows rendered positions. Pitch ~58° (height 20, back 12.5, FOV 40), for ~30 m of lane visible. Spring response ~0.12 s. Only held pad aim gets 25% look-ahead, capped at 3 m; mouse movement never shifts the camera. Arrow keys detach and pan at 20 m/s, clamped to the floor edges. Space snaps to the hero and follows while held; release returns to the previous follow/free mode.

## Facts and state

- **`app.present` facts** (each has a `type`, carries copied data plus ids, and passes `validFact`): `order`, `cast`, `projectile`, `hit`, `nearMiss`, `death`, `spawn`, `denied`, `xp`, `levelUp`, `mount`, `globe`, `structureDown`, `matchOver`. `order` carries the ping (and `repeat` for RMB re-sends, which ping small and silent); `denied` is the cooldown flash. Moba's own switch maps them to juice verbs, sfx and rumble.
- **Snapshot:** full plain JSON with timers in ticks, positions quantised inside the state, and the static layout keyed by map id. Paths are never replicated.

  ```
  { t, match, teams: { A: { xp, level }, B }, heroes: [{ id, team, hp, pos, vel, yaw, order, cast, cd[5], mounted, dead, respawnTick }],
    minions: [{ id, kind, team, hp, pos, yaw, target, attackTick }], structures: [{ id, hp }], projectiles, zones, globes }
  ```

## Milestones

Each ends with `bun run check` green and is playable behind `?mode=moba`. Requires the core migration through phase C, including render interpolation.

1. **Feel slice.** One hero on a flat 40 × 40 m floor with three pillars, and the court hidden. Build the `pointClick` scheme, `stickAim`, follow framing and the juice-kit extraction. RMB order with pathing, arrival and pings; left-stick move; Q with the cast rules and buffer; two strafing dummies that flash, cue near misses, go down after three Q hits and respawn 2 s later. Everything in the tune GUI. Headless tests: no overshoot on arrival, reversal time, buffer timing, order resumption, swept hits. Done when Oskar calls it smooth on mouse and pad at 144 Hz.
   Pulled forward from M2: W Vault (arrow, 4 m dash), E Rain (filling circle, delayed hit and slow), and three cooldowns; the feel slice swaps the planned W/E bindings, with W 3 s / E 6 s cooldowns. Q is unchanged; pad holds aim and releases fire.

2. **Kit.** W, E, basic attacks with stutter-step, the trait, HP, death and respawn, a dummy that casts back, indicators, the cooldown HUD, hit-feedback tiers. Keeps the feel slice's W Vault / E Rain bindings and cooldowns; Momentum recharges Vault (now W), not Rain. Dummies have 1400 HP and keep their 2 s respawn; the hero uses `6 + 2 × level` s.
3. **Lane.** Map, structures, waves, the soak rule, levels, globes, base healing, win condition. 1v1 against a scripted hero, then 2v2.
4. **Bots.** Hero bots and 3v3. A seeded headless bots-only match must end in a core kill within 15 simulated minutes.
5. **HotS layer.** Mount and the R heroic.
6. **Shared play.** Runs through online with no moba code knowing. Includes snapshot size (`snapshot(sinceSeq)` if needed) and local-unit prediction, designed then.

## Open questions for Oskar

1. Mirror match, or a melee bruiser against the Fletcher? One kit is half the work; two would test the lane harder.
2. Stay at 3v3, or go to 5v5 once bots hold up? Five a side on a 16 m lane is a scrum.
3. Regen globes: either team, or killing team only (HotS)?
4. When moba needs the hub: a portal beside dodgeball's difficulties, or a separate mode picker?
