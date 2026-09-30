# MOBA mode plan

A small Heroes of the Storm-style mode: the smallest thing that already feels like HotS in your hands. One lane, shared team XP, no items, no last-hitting, short matches, dodgeable skillshots. Feel first; MOBA systems after the hero feels right on an empty floor. Contract: [plugin-architecture.md](plugin-architecture.md). Metres, seconds, 60 Hz; HotS units read as metres.

## Scope

- **Match:** 3v3 (human + 2 bot allies vs 3 bots), all the same hero. Destroy the enemy core. 8–12 minutes. Boots with `?mode=moba` until the hub plugin exists.
- **Map:** one flat lane along x, 104 × 26 m, with hedged flanks and six pillars; layout and structure positions are specified in [moba-lane.md](moba-lane.md). The full lane is built: towers, forts, cores, waves, shared levels, killer-team globes, base healing and a core-kill win. Practice is a human plus two allied hero bots against three enemy hero bots, all Fletcher seats built from the hero table. Bots feed the same fixed-tick intents as players.
- **Structures** (no ammo; HotS removed it in 2017). Each is invulnerable until the one in front falls. Abilities deal 25% to structures; a kill is worth 300 XP.

|       | HP   | Damage | Rate | Range | Targets                    |
| ----- | ---- | ------ | ---- | ----- | -------------------------- |
| Tower | 2400 | 220    | 1/s  | 7.75  | nearest minion, then hero  |
| Fort  | 5000 | 320    | 1/s  | 8.5   | same                       |
| Core  | 6000 | 360    | 1/s  | 9     | same; death ends the match |

Early gun damage is shown above. At 8:00 guns deal 25% of it, waves accelerate and brutes join. The stronger early guns protect a weak human's team; late pressure stops mirror bots from defending forever. Structure HP and the Ball's damage fraction are unchanged.

- **Minions:** a wave every 30 s from each core, first at 0:15. Each wave is 3 melee, 2 ranged and 1 wizard; the wizard drops a regen globe (+15% max HP, killing team only, 15 s lifetime). They walk the centreline and take the nearest enemy within 6 m: minion, then structure, then hero. They are plain agents, not character controllers. A dying minion's XP goes to the enemy team if any enemy hero is within 12 m, which replaces last-hitting.

|        | HP  | Damage | Rate   | Range | Speed | XP  |
| ------ | --- | ------ | ------ | ----- | ----- | --- |
| Melee  | 400 | 18     | 0.67/s | 0.9   | 3.5   | 40  |
| Ranged | 280 | 30     | 0.67/s | 5     | 3.5   | 40  |
| Wizard | 220 | 15     | 0.67/s | 3     | 3.5   | 40  |

- **XP:** XP to go from level L to L+1 is `600 + 100(L−1)`, 9000 total to reach the cap of 10. Passive trickle is 8 XP/s from 0:30. A takedown is worth `200 + 40 × victim level`. Each level gives +4% HP and damage. The death timer is `6 + 2 × level` s.
- **Hero, the Fletcher:** 1400 HP, 5.0 m/s. Basic attack: 90 damage, 5.5 m range, 1/s, homing.

| Key   | Name     | What it does                                                                                                              |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| Trait | Momentum | A Q hit on a hero (including training dummies) takes 2 s off Vault's cooldown                                             |
| Q     | Loose    | Line skillshot, first hit. Cast point 0.3 s with a ground line tell, range 11, 20 m/s, radius 0.3, 140 damage, cooldown 4 |
| W     | Vault    | `dash(dir, { distance: 4, time: 0.18 })` toward aim, cooldown 3. Blocked by structures                                    |
| E     | Rain     | Ground circle. Range 10, radius 2.5, lands after 0.7 s, 180 damage, 30% slow for 1.5 s, cooldown 6                        |
| R     | Volley   | Heroic, unlocks at level 10. Piercing line, cast point 0.5 s, range 30, 30 m/s, radius 0.8, 320 damage, cooldown 60       |
| Mount | —        | 1 s channel, then `speedMul` 1.3. Movement cancels the channel; damage, attacking or casting dismounts                    |

- **Bots (built):** hero bots play through `app.intents` exactly like players; see [Hero bots](#hero-bots-m4).
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
- **Skillshots** are swept circles, not Rapier bodies. They're registered with `app.smooth`. Q's measured dodge deadline at 8 m is about 0.52 s, including its 0.3 s cast point. Tune projectile speed before anything else.
- **Telegraphs:** your own indicators while held: a line for Q and R, a circle for W, an arrow for E. Enemies see W's circle for its full 0.7 s, filling toward impact, and R's line during its cast point. Q nocks at the press and holds an interpolated draw pose through its 0.3 s cast point. Its enemy ground line clips at cover and the map edge, alongside the yaw snap; the released shot has a bright trail. The sparring dummy freezes its aim and shows enemies a filling line for 0.4 s before releasing Q; basic attacks have their own pose. A near miss within 0.8 m plays the "close" cue for both players (moba has its own detector).
- **Hit feedback:** via juice-kit verbs. Every hit gets a 70 ms flash, a squash and a few chips. Hits on you add shake 0.15 and rumble (0.2, 0.3, 60 ms); your hits on a hero add a hitmarker and rumble (0.1, 0.2, 40 ms). HP bars tick every 200. Gold XP numbers float up. Your own takedowns get `clock.scale` hitstop (65 ms), which is ignored when the session is shared. A structure kill adds shake 0.6, an FOV kick and a banner.
- **Camera:** `camera.frame(dt)` follows rendered positions. Pitch ~58° (height 20, back 12.5, FOV 40), for ~30 m of lane visible. Spring response ~0.12 s. Only held pad aim gets 25% look-ahead, capped at 3 m; mouse movement never shifts the camera. Arrow keys detach and pan at 20 m/s. The four ground-projected view corners are clamped to the map at the current aspect, not just the target; near an edge the hero is off-centre. A 1.25 m allowance covers shake, and FOV kicks reserve their wider footprint. Live camera tunes that cannot fit the court narrow the FOV. Loading lands on the same clamped frame at the same aspect. Space snaps to the hero and follows while held; release returns to the previous follow/free mode.

## Facts and state

- **`app.present` facts** (each has a `type`, carries copied data plus ids, and passes `validFact`): `order`, `cast`, `projectile`, `hit`, `caught`, `catchExpired`, `boardExpired`, `channelEnd`, `channelCancelled`, `nearMiss`, `death`, `spawn`, `denied`, `xp`, `levelUp`, `mount`, `globe`, `structureDown`, `matchOver`, `aggro`, `expired`. Expired homing shots report a lost target; missed skillshots report spent range, both with a fizzle. The full lane emits `aggro` on a call-for-help; `xp` on soak, structure kills, takedowns and the passive trickle; `levelUp`, `globe` (spawn/pickup/expired), `structureDown` and `matchOver`. Invulnerable hits emit `shielded` with their own cue. `order` carries the ping (and `repeat` for RMB re-sends, which ping small and silent); `denied` is the cooldown flash. Cast, projectile, hit and impact facts carry the ability id; effects resolve that definition rather than interpreting the slot. Moba's own switch maps them to juice verbs, sfx and rumble.
- **Snapshot:** full plain JSON with timers in ticks, positions quantised inside the state, and the static layout keyed by map id. Paths are never replicated. Projectile records include speed, radius, range, ability, pierce, passed ids and frozen damage; zones retain their ability. Slows are per-unit `{ until, factor }`, freeze and prone are unit timers, and boards/cutouts live in separate lists.

  ```
  { t, match, teams: { A: { xp, level }, B }, heroes: [{ id, team, heroId, abilityState, hp, pos, vel, yaw, order, cast, cd[5], mounted, dead, respawnTick }],
    minions: [{ id, kind, team, hp, pos, yaw, target, attackTick }], structures: [{ id, hp }], projectiles, zones, boards, cutouts, globes }
  ```

## Hero bots (M4)

Built in `src/plugins/moba/bots.js`. Practice uses match seed 2; enemies take the signboard's difficulty or `?bots=easy|normal|hard`, with easy as the default; allies stay normal. The roster and every bot's abilities come from the hero table. The scripted controller remains only for older characterization fixtures. Live difficulty knobs have their own GUI folders; seed and lane files apply on restart. `catchRate` is reserved for a hero with a catch kit; Fletcher has none.

Siege tuning from real play: early structure guns are doubled, the late phase starts at 8:00 with quarter-strength guns and a 3500 HP brute, waves come every 15 s, and the Ball interval is 150 s early / 30 s late. Minions gain 4% HP and damage per whole minute. A disadvantaged bot uses Rain to clear a wave attacking its frontmost friendly structure. These changes keep default Practice with an idle local seat alive past eight minutes while letting seeded mirror matches finish.

Map, Ball and structure rules come from [moba-lane.md](moba-lane.md). A bot is a brain per hero id that writes a `pointClick` frame with `app.intents.feed(id, frame)` at the top of moba's `simulate`, before any hero reads its intents. That keeps bots on the fixed tick, independent of render rate, paused while the sim is held, and absent on replicas. The sim can't tell a bot from a mouse player: `order` to move or attack, `aim` plus a `slotN` press whose `at` is the aim, never `move` or `held`. It reads sim state through a read-only view and never writes it. It thinks every 6th tick, staggered by id, and feeds its current frame on the ticks between. Randomness comes from one seeded stream per bot, forked from the match seed, so changing one bot doesn't reshuffle the others.

- **Perception:** there's no fog, and edge pips show every enemy hero, so a bot sees the whole map, late. Every enemy query goes through one perception view: the sim state as it was `reaction` seconds ago, from a ring buffer of views. That covers heroes, minions, structures' targets, casts, projectiles and zones, and it includes first-hit sweeps, mid-Vault checks and dodge prediction. Only the bot's own hero, cooldowns and Ball state are read live.
- **Orders:** a move order is sent once per new goal and re-sent only if the hero's resolved order has lapsed. An attack order clicks the target's live position once. The bot keeps the target id and sends nothing more while its hero's resolved order is an attack on that id. It re-clicks only if the order lapsed, since re-sending a stale point would turn into a move.
- **Roles:** the three bots of a team take files z −3, 0 and +3 in the lane, so they don't stack in one Rain.
- **Priority** each think, first match wins: dodge, retreat, Ball, fight, push, lane. Other states hold for at least 0.5 s. Retreat latches: once entered, it lasts until 90% HP or death, and dodge interrupts it without clearing it.
- **Lane:** defend an invaded friendly structure with Rain on clustered minions when disadvantaged; otherwise stand 2–4 m behind the most advanced allied minion, inside its own file, and basic the minion the wave is hitting. With no allied wave, hold 3 m behind its own frontmost structure. Always stay within 12 m of dying enemy minions, since that's the soak.
- **Push:** the centre-file bot takes a screened siege opening before fighting; other files fight first. A brute counts as two escorts. When the allied wave is inside a vulnerable enemy structure's range, basic the structure only while that structure targets a minion, and step back out of its range when fewer than 2 allied minions are left.
- **Tower safety** gates every offensive action in every state: a basic, Q, E, W or throw. An action is illegal if it would make an enemy structure call for help on the bot. That applies when the bot's position after the action (W's landing spot included) is inside the structure's range, and when any hero it could hit is inside that range (E's whole circle counts). The one exception is a kill. The target's perceived HP must be at most the bot's burst available in the next 1.5 s, and the bot's HP minus 2 s of that structure's damage must stay above `retreatHp`.
- **Fight:** enter when an enemy hero is within 9 m and `advantage ≥ −aggression`. Advantage is the sum of HP × (1 + 0.04 × level) over allied heroes within 12 m, minus the same for enemies, divided by max HP, with 1.0 subtracted per enemy structure whose range the bot stands in. Target the lowest effective HP in reach, sticky for 1 s. Order of play: E on the predicted spot, Q, basics with a stutter-step back toward the bot's own side after every shot, W to chase a target under 25% HP within 7 m.
- **Retreat:** enter below `retreatHp` (0.35), or when advantage drops under −`aggression` − 1. Order to its own base (|x| ≥ 44), take any own-team globe within 6 m of the path, and save W for a telegraph.
- **Dodge:** triggered by a perceived enemy `cast` fact, so the cast point counts toward reaction time. A normal bot sees an 8 m Q with about 0.27 s left to clear it. For each Q, R or Ball shot whose predicted sweep passes within the bot's radius + 0.6 m, roll `dodge` once; a failed roll commits, with no re-roll for that shot. On success, the obstacle module finds the nearest cleared spot perpendicular to the shot. The bot walks there if it can arrive before impact at its current speed; otherwise it Vaults there if W is up; otherwise it doesn't try. Rain uses the same test for its nearest edge + 0.5 m. From the centre, walking is too slow and it takes a Vault.
- **Skillshots:** Q aims at an intercept solved from the perceived position and velocity, then misses like a human would. The lead is scaled by `1 + N(0, leadError)`, the angle rotated by `N(0, jitter)` radians, and the release waits `reaction` after the target first came into range. A bot casts only if the perceived sweep says the first thing on the line is a hero, since Q stops at the first minion. It holds Q while the target is perceived mid-Vault. E aims at the perceived position plus 0.7 s of velocity and prefers a spot that covers two heroes. R (M5) only on two heroes in a line or a target under 30%.
- **Ball:** at the 30 s warning a bot finishes its wave. At 10 s left, every bot above 50% HP walks toward the plaza. After that, the lane doc's rule applies. A bot contests when its side has at least as many heroes within 12 m of the Ball and more than half their HP. Otherwise it shadows at 8 m, focuses the carrier to force a drop, and grabs the loose Ball. Only the nearest ally channels the pickup; the others stand between the carrier and the nearest enemy. If the catch rule ships, bots catch at `catchRate`.
- **Carrier:** since any slot or `primary` press throws, a carrier sends no edges except the deliberate throw. Dodge and retreat still apply, as movement only at ×0.85. It walks the lane to the frontmost vulnerable enemy structure, or the flank if an enemy hero is within 10 m of the lane path. It throws when that structure's centre is 0.5 m inside the Ball's reach (6.9, 7.9 and 8.2 m for tower, fort and core), or at an enemy hero within 4 m when below half health or when the Ball can finish that hero. Otherwise it keeps the objective for siege instead of spending every pickup on a healthy hero at mid. A completed flank waypoint advances toward siege rather than repeatedly selecting itself.
- **Knobs:** `tune.bots` with a preset per difficulty and each value tunable in the GUI. Enemies take `?bots=easy|normal|hard` (default easy); allies are always normal. During easy's opening phase, only the nearest opponent may target each human, avoiding an immediate three-bot pile-on.

| Knob            | Easy | Normal | Hard | Meaning                                     |
| --------------- | ---- | ------ | ---- | ------------------------------------------- |
| `reaction`      | 0.45 | 0.3    | 0.18 | Perception lag and hold before a release, s |
| `dodgeReaction` | 0.3  | 0.2    | 0.12 | Lag from a perceived `cast` to the dodge, s |
| `jitter`        | 0.14 | 0.08   | 0.04 | Aim angle σ, radians                        |
| `leadError`     | 0.35 | 0.2    | 0.1  | Lead scale σ                                |
| `dodge`         | 0.2  | 0.5    | 0.75 | Chance to try dodging a threatening shot    |
| `aggression`    | 0.3  | 0.6    | 0.9  | Disadvantage a bot will still fight at      |
| `catchRate`     | 0.1  | 0.3    | 0.5  | Ball catch chance                           |

**Test** (`tests/moba-bots.test.js`):

- **Match:** a headless match on six bot heroes, all normal, with seeds 1, 2 and 3, stepped for at most 54 000 ticks. Each seed must end in `matchOver` from a core kill. Every bot frame must pass `validIntent`.
- **Determinism:** seed 2 runs through the real app clock at 60, 30 and 144 Hz. Every tick's complete snapshot and facts must hash identically; final states and objective facts are compared too.
- **Weak human:** default seed 2 with the local allied seat idle in base must last past 8:00 and still end naturally.
- **No stuck brain:** no living bot may move less than 2 m in 30 s while no enemy is within 12 m.
- **Fixtures:** retreat latches from 34% to 90% HP through a dodge; a carrier never sends a non-throw edge and throws at the right reach; no tower aggro unless the kill exception holds; an attack order survives its target moving 3 m; a blocked or too-late dodge falls back to Vault, or to nothing; a close Q and a centre-of-Rain escape.
- **If a seed runs long,** the lane doc's rule applies: shorten the Ball interval first, then bring the late phase and brutes forward.

Proof: `tests/moba-bots.test.js` checks all three seeds, both sides scoring, fixed-tick frame validity, every living unit's walkability, stalled brains, a late-phase median tick budget, close-Q and centre-Rain dodge intents, a committed failed dodge roll across release, the intercept equation, separate sims and pause clocks, retreat/death, carried edges, stable attack orders and protected targets. `scripts/verify-moba-bots.mjs` captures genuine six-hero combat at mid at 390, 1440 and 2560×1080, using the real camera and shared camera tunes. All six hero centres must be visible in frame. The first qualifying phone fight is replayed at the same tick at all widths; the real camera pans to the fight bounds without changing its scale. Debug-only `?mode=moba&debug&bots-only` gives the local seat a normal brain for that proof.

## Shared play (M6)

Measured on 2026-09-29: a headless 3v3 of six scripted Fletchers with full waves and the Ball, 12 simulated minutes, a snapshot every third tick; and a two-hero Q duel for dodge timing. Moba reads `session.local` and `session.authoritative` and nothing else about the network.

- **Host authority, not lockstep.** The host already runs the sim (0.52 ms a tick at 3v3). Lockstep would put RTT/2 plus jitter on every click, the host's included, stall everyone on the slowest peer, and need bit-identical Rapier across browsers, which `rapier3d-compat` doesn't promise.
- **Scope.** M6 is a replica, local-hero prediction of movement and windups, a hardened input boundary and bounded send queues. Out until later: rejoin, deltas, speculative projectiles, lag compensation and host migration. As today, a guest leaving cancels the match, losing the host ends the session, and a running match refuses new peers. A seat silent for 0.5 s gets a neutral frame and `cancel`, so its stick and held casts stop and its last click order walks on, as in HotS. Rejoin will first need a seat suspension that also sends `stop`, since `cancel` leaves moba's order walking.
- **Bandwidth.** Today's `snapshot()` is 7.17 KB mean and 10.5 KB peak, 7.6 KB with facts: 152 KB/s per guest at 20 Hz. A projection that drops host bookkeeping (`aggroOrigin`, `returnGoal`, `forced`, `aggroUntil`) and float noise (`hp: 1273.9999999999993`) while keeping full hero records is 3.9 KB mean. The predictor fields below add about 0.15 KB per hero, so about 4.8 KB with facts: 100 KB/s per guest, or 4 Mbit/s of host upload for five guests. `snapshot(sinceSeq)` and deltas are not needed. Slice 1 measures the whole schema.
- **Queues.** The channel is reliable and ordered, so a slow guest would queue stale states. The link skips state for a guest whose `bufferedAmount` exceeds two envelopes. Facts wait per guest and ride the next envelope that guest gets.
- **Input boundary** (online and core, dodgeball too). Connections switch to string serialization, so each message counts against the seat's rate and a 2 KB cap before `JSON.parse`. A core `readIntent(frame)` copies known fields or returns null, replacing `validIntent` and `structuredClone`. Three seconds of rejections or overruns drops the peer.
- **Replica.** It is built from `createSnapshotBuffer`, keyed by host time (`t × STEP` plus the smallest arrival offset seen), so a burst after a stall replays at its true spacing. The delay is 100 ms, two send intervals. Past the newest state, heroes dead-reckon on `vel` for up to 100 ms, then hold. Facts present on arrival, ahead of the bodies, because cast cues are the dodge signal.
- **Prediction input.** The core stamps the local frame with `n`, a per-render counter, and the link's unchanged-frame key ignores it, so an idle guest still sends 10 frames a second and each acknowledges. In `intents`, before the link drains, the predictor copies the frame into a private `createIntents()` store, so its `consume` calls never touch what online sends. It steps that store on its own 1/60 accumulator and logs each step's frames. The host sim keeps per hero `ack`, the highest `n` its seat store had been fed by the snapshot's tick.
- **Prediction state.** Only the local hero is predicted, with the solo code and one kinematic body (contract line 5 gains "except its local predictor"). The snapshot carries each hero's whole predictor record: path goal, dash direction, time left and speed, cast slot, ticks left, target and `cmd`, attack target, phase and ticks, the buffered slot, cd, slow and stun, and Ball carry or channel. The predictor world mirrors remote heroes as kinematic proxies at their newest positions, and removes structure colliders at rubble. Minions have no colliders. No knockbacks exist; a future one must bring its displacement state.
- **Reconciliation.** On apply, the predictor resets to the host's record, re-feeds logged frames with `n > ack`, and replays those steps. The position difference becomes a visual offset that decays over 0.1 s; over 2 m it snaps. Death, stun or a carried Ball on the host clears the predicted cast and the log.
- **Cast identity.** The host stamps each cast with `cmd`, the `n` of its press, and echoes it on `cast`, `projectile`, `hit`, `blocked` and `expired`. A buffered press that expires, or a cast pending at death or stun, emits `denied { cmd }`. The guest skips its own `cast` facts whose `cmd` it already played. It rolls back a predicted windup on `denied`, or when `ack ≥ cmd` and no cast carries it. Arrows come only from snapshots, interpolated like everything else, so hits line up with the enemies drawn.

What a guest sees. An unobstructed 8 m Q makes contact 25 ticks (0.417 s) after its cast tick, and a centred target's order must land by tick 16 (0.267 s) to clear the swept 0.75 m. Averages are 25 ms batching, 8 ms render and 8 ms tick. Worst cases are 50, 17 and 17 ms plus 20 ms of jitter each way.

| RTT      | Own click moves | Host ack (avg / worst) | Others drawn (avg / worst) | Reaction left, centred 8 m Q (avg / worst) |
| -------- | --------------- | ---------------------- | -------------------------- | ------------------------------------------ |
| 0 (host) | ≤ 17 ms         | —                      | live                       | 0.25 / 0.23 s                              |
| 100 ms   | ≤ 17 ms         | 133 / 207 ms           | 175 / 220 ms               | 0.13 / 0.04 s                              |
| 200 ms   | ≤ 17 ms         | 233 / 307 ms           | 225 / 270 ms               | 0.03 s / none                              |

With about 0.2 s of human reaction, only the host can dodge a centred 8 m Q on sight; guests dodge by reading the windup or pre-moving, and at 200 ms they see their predicted hero clear the arrow and still take the hit. Without prediction, their own clicks would start moving after 233 and 333 ms. Flushing facts every host frame would win back 33 ms; that comes after M6.

Build order. Every test runs two real `createApp` loops with moba and online on a stub DOM and net. The host renders at 60 Hz and the guest at 144, then at 30 Hz. The wire adds 50 ms each way, then 100 ms, with 20 ms jitter and a 300 ms burst. States are compared at matched host ticks, never on copies.

1. **Replica and boundary:** roster-driven heroes (bots from roster controllers, host only), restart gated on `session.actions`, the projection, `apply`, per-guest queues, `readIntent` and caps. Test: 3v3 with two humans for 5 minutes. The guest's replica at host tick t matches the host's state at t within 1 cm. Each fact presents once. Envelope p95 is at most 7 KB with the whole schema. A stalled guest's queue stays within two envelopes, and missed facts arrive after it. Oversize, extra-field and flooding frames never reach intents, a flooder is dropped, and host ticks stay under 4 ms.
2. **Movement prediction:** `n`, `ack`, the private store, proxies, reconciliation and Vault. Test: clicks, re-clicks, stick moves, a Vault into a remote hero and one into a pillar, a tower dying under the path, and 10 s of idling. The offset stays under 0.3 m outside collisions, and at zero delay it is exactly 0. The log stays under 30 steps when idle.
3. **Windups and denial:** cast `cmd`, `denied`, rollback, and the Ball. Test: Q, E and Vault at both render rates; a Q buffered through a Ball stun; a Q pending at death; a carrier's throw. Each denial rolls back the guest's pose and cooldown within one envelope. No own cast cue plays twice. At every acked tick, cooldowns equal the host's.

## Milestones

Each ends with `bun run check` green and is playable behind `?mode=moba`. Requires the core migration through phase C, including render interpolation.

1. **Feel slice.** One hero on a flat 40 × 40 m floor with three pillars, and the court hidden. Build the `pointClick` scheme, `stickAim`, follow framing and the juice-kit extraction. RMB order with pathing, arrival and pings; left-stick move; Q with the cast rules and buffer; two strafing dummies that flash, cue near misses, go down after three Q hits and respawn 2 s later. Everything in the tune GUI. Headless tests: no overshoot on arrival, reversal time, buffer timing, order resumption, swept hits. Done when Oskar calls it smooth on mouse and pad at 144 Hz.
   Pulled forward from M2: W Vault (arrow, 4 m dash), E Rain (filling circle, delayed hit and slow), and three cooldowns; the feel slice swaps the planned W/E bindings, with W 3 s / E 6 s cooldowns. Q is unchanged; pad holds aim and releases fire.

2. **Kit.** W, E, basic attacks with stutter-step, the trait, HP, death and respawn, a dummy that casts back, indicators, the cooldown HUD, hit-feedback tiers. Keeps the feel slice's W Vault / E Rain bindings and cooldowns; Momentum recharges Vault (now W), not Rain. Dummies have 1400 HP and keep their 2 s respawn; the hero uses `6 + 2 × level` s.
3. **Lane.** Map, structures, waves, the soak rule, levels, globes, base healing, win condition. 1v1 against a scripted hero, then 2v2.
4. **Bots (built).** Hero bots and 3v3. A seeded headless bots-only match must end in a core kill within 15 simulated minutes.
5. **HotS layer.** Mount and the R heroic.
6. **Shared play.** Runs through online with no moba code knowing; designed in [Shared play](#shared-play-m6).

## Open questions for Oskar

1. Mirror match, or a melee bruiser against the Fletcher? One kit is half the work; two would test the lane harder.
2. Stay at 3v3, or go to 5v5 once bots hold up? Five a side on a 16 m lane is a scrum.
3. Regen globes are killing-team only, as settled in the lane design.
4. When moba needs the hub: a portal beside dodgeball's difficulties, or a separate mode picker?
