# MOBA heroes

The next three heroes after the Fletcher, for [moba-plan.md](moba-plan.md). Mitts comes from [moba-ideas.md](moba-ideas.md); Carom and Skip are new. Each one takes a dodgeball rule the Fletcher doesn't use: catch, ricochet and deflect, out-not-gone. Nothing here is built. R abilities wait for M5, like Volley.

**Dodge budget.** The time from a cast tick to the last moment a centred target can start moving: contact time minus 0.15 s, which is how long 0.75 m of clearance takes at 5 m/s. The host needs 0.2 s of it to react. At 100 ms RTT a guest loses about 0.12 s on average and 0.21 s at worst (the plan's table: 0.25 s left for the host, 0.13 / 0.04 s for a guest). So every dodgeable thing here has a budget of at least 0.45 s at 8 m, which means contact at 0.6 s or later, and most of that time is windup that shows the hitbox. The Fletcher's 8 m Q has 0.27 s. That's why guests can't dodge it on sight, and raising its cast point to 0.3 s is the obvious fix (Oskar's call).

**Tells.** Anything that damages, stops or moves an enemy has a cast point of at least 0.3 s and shows its exact hitbox to enemies for all of it. Self-only casts (stances, dashes) are instant, and they show their state on the ground for as long as it lasts. Reactive windows (catches) last at least 0.6 s, so a guest who presses on an enemy's windup still lands inside the window after 0.21 s of lag.

**Silhouettes.** Every hero keeps the 0.45 m collision circle, and the body's shape from above stays within 0.1 m of it. Each hero owns one body shape and one prop, and no minion prop (shield disc, stick, cone hat, block helmet) is reused. Team colour lives on the foot disc, the prop and the top of the body, so a mirror match is the same shape in two colours. Grayscale test at 20 px: the shape alone tells heroes apart.

| Hero     | Role              | Shape from above                         | Prop                                                     |
| -------- | ----------------- | ---------------------------------------- | -------------------------------------------------------- |
| Fletcher | ranged poke       | circle: the capsule, slimmed to 0.32     | quiver of three big fletched arrows, fanned behind him   |
| Mitts    | keeper, frontline | rounded square, low and wide, no neck    | oversized catcher's mitt, a filled disc off one side     |
| Carom    | trick-shot burst  | rounded triangle, point forward          | squash racket over the shoulder, an open ring on a stick |
| Skip     | captain, support  | flat bar: a cardboard cutout, 0.9 × 0.25 | megaphone held out front, a flared cone lying flat       |

## Mitts, the keeper

Frontline counter to skillshots. She stands in front of her team, takes the shots and sends them back. Weak to ground circles, basics and flanks. 1600 HP, 5.0 m/s. Basic: a mitt slap, 3 m range, 110 damage, 1/s.

| Key   | Name       | Numbers                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trait | Pocket     | Holds one caught enemy projectile for 6 s. The mitt glows the thrower's colour and a ring on her disc counts down; at zero it drops harmlessly. A caught Ball counts as carried, with the normal carry rules.                                                                                                                                                                                                                                   |
| Q     | Toss       | Line skillshot, first hit. Cast point 0.35, range 9, 20 m/s, radius 0.35, 120 damage, cooldown 5. Contact at 8 m: 0.75 s. With something pocketed, Q throws that instead, with its original damage, speed, radius, range and piercing, and ignores Q's cooldown.                                                                                                                                                                                |
| W     | Catch      | Instant stance: mitt up, half speed, 0.6 s. The first enemy hero skillshot or Ball to enter a 100° cone within 2 m of her front is caught for no damage and pocketed. A full pocket still blocks. Cooldown 9, reset to 3 on a catch. Enemies see the cream arc for the whole window.                                                                                                                                                            |
| E     | Dive       | Instant 4 m dash toward the aim over 0.25 s, then prone for 0.4 s: no moving, casting or attacking. The catch rule of W is live along the whole dive and the prone, 0.65 s in all, in a full circle. Cooldown 12. Blocked by structures.                                                                                                                                                                                                        |
| R     | Dodge This | Channel up to 1.5 s, rooted, turning 180°/s toward the aim. Catches every enemy projectile entering a 120° cone within 3 m, basics, minion and tower shots included, up to 10. Release on R or at the end: a 0.4 s windup shows every return line in red to enemies, then the lot fires in an even 60° fan, each shot at its original speed and damage, range 12. An empty bag throws three Tosses. A stun or death drops the bag. Cooldown 70. |

The announcer yells "Dodge this!" on release. Tower shots become 110-damage balls, and returned shots deal the normal 25% to structures.

**The moment:** the enemy Fletcher looses Volley down the lane at her carry. Mitts dives across the line, catches it lying on her front, gets up and sends 320 damage back through all three of them.

**Counter-play:** throw a cheap shot at the arc to burn W, or wait out its 0.6 s. The cone faces one way, so flank her. Rain and every ground circle ignore the mitt. The prone after Dive is 0.4 s of free hits. Skip's Red light freezes her mid-Catch, because half speed is still moving.

**Online:** a guest Mitts presses on the enemy's windup, not on the projectile. The 0.6 s and 0.65 s windows cover the 0.21 s worst case. The host decides every catch; the guest predicts the pose and the cooldown and rolls back on `denied`.

## Carom, the trick shot

Burst from odd angles. The Fletcher pokes you down the lane; Carom hits you behind the pillar. Strongest in the plaza and near the walls, weakest in the open road. He hits rubber balls with a squash racket. 1300 HP, 5.0 m/s.

| Key   | Name       | Numbers                                                                                                                                                                                                                                                                                        |
| ----- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trait | Kiss       | Basic attack: 5 m range, 80 damage, 1/s, homing. It then bounces to the nearest other enemy within 3 m, heroes first, for 40.                                                                                                                                                                  |
| Q     | Bank       | Line skillshot, first hit. Bounces off pillars, hedges, structures, boundary walls and his board, up to 2 cushions, angle in equals angle out. Cast point 0.35, path length 10, 18 m/s, radius 0.35, 110 damage plus 55 per cushion before the hit, cooldown 5. Contact at 8 m: 0.79 s.        |
| W     | Kick off   | Instant 4 m dash over 0.2 s. Terrain and his board reflect it, and it keeps the remaining distance. Each reflection takes 1.5 s off the cooldown. Cooldown 6. Blocked by structures, like Vault.                                                                                               |
| E     | Backboard  | Cast point 0.3, range 8. Slams down a board 3 m wide and 1.5 m tall, square to the aim line, for 4 s. It is terrain for every projectile and no body. Enemy shots that hit it reflect and change sides; the Ball drops, as at a hedge. Its outline is printed for the cast point. Cooldown 10. |
| R     | Trick Shot | Cast point 0.6. Up to 6 cushions, path length 40, 26 m/s, radius 0.5, pierces heroes (each once), 180 damage plus 40 per cushion before the hit. The whole path is printed as a dotted red pool-cue guide to enemies for the cast point. Contact at 8 m: 0.91 s. Cooldown 60.                  |

His own aim indicator for Q and R draws the full bounce path, so aiming at a wall is a skill anyone can learn in one game.

**The moment:** the red dotted line zigzags across the plaza, everyone scatters, and after five cushions it still finds the Fletcher hiding behind the far pillar.

**Counter-play:** fight him in the open road, where there is nothing to bank off. Every banked path is printed for its cast point, so step off the line. The board has no body, so walk through it and shoot around it. Mitts catches any of his balls. With 1300 HP, he dies to one committed dive.

**Online:** the printed path is the dodge signal, and the dodge budget is 0.64 s for Q and 0.76 s for R at 8 m. A board reflecting a shot changes its owner on the host, and it arrives as a snapshot like any other projectile.

## Skip, the captain

Support. Keeps her team in the game by healing, swapping and calling people back, and controls space by making enemies stand still. She shouts through a megaphone. 1450 HP, 5.0 m/s. Basic: a tennis ball, 5 m range, 70 damage, 1/s, homing.

| Key   | Name          | Numbers                                                                                                                                                                                                                                                                                                                                                                                 |
| ----- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trait | Out, not gone | While dead, she's a flat grey cutout with a team outline on her side's touchline, just outside the boundary wall. She walks its full length at 5 m/s and is untargetable. Her one action is a throw: cast point 0.35, range 14, 12 m/s, radius 0.35, 60 damage, cooldown 3, heroes only, blocked by hedges and pillars. Each hit takes 2 s off her death timer. Contact at 8 m: 1.02 s. |
| Q     | Pass          | Line skillshot that stops at the first hero, friend or foe, and passes through minions. Cast point 0.3, range 10, 20 m/s, radius 0.4. An ally heals 180; an enemy takes 90 and a 25% slow for 1 s. Cooldown 5. Contact at 8 m: 0.7 s.                                                                                                                                                   |
| W     | Tag out       | Target the ally hero nearest the aim within 7 m. Cast point 0.3: her hand goes up and enemies see a dashed tether. Then the two swap places instantly. The ally's stun and slow end; Skip takes 30% less damage for 2 s. A Ball carrier takes the Ball along. Cooldown 14.                                                                                                              |
| E     | Red light     | Cast point 0.5: she turns her back, raises the megaphone, and enemies see a red 5 m ring filling. On resolve, every enemy hero inside moving faster than 0.5 m/s (walking, dashing, diving) is frozen for 1.25 s in its running pose. Standing, casting and attacking are safe. Minions ignore it. Cooldown 12.                                                                         |
| R     | Back in!      | Needs a dead ally. Channel 1 s behind a big "Back in!" speech bubble; a stun breaks it. The ally with the longest death timer runs on from the touchline and respawns at her side at 50% HP. Cooldown 100. Denied with the icon flash if nobody is dead.                                                                                                                                |

Out, not gone is the ideas doc's global rule, tried on one hero first. If it's fun on Skip, it goes to everyone.

**The moment:** the enemy Fletcher Vaults out of Rain straight into a red light and hangs there for a second, frozen mid-stride, while Skip's team turns round.

**Counter-play:** stand still. Red light is the one skill in the game you beat by doing nothing, or by walking 2.5 m out of the ring during its 0.5 s. Body-block Pass, since it stops at the first hero. Burst the ally during Tag out's tether, because Skip lands where they stood. Stun the Back in! channel. Mitts can catch her touchline throws.

**Online:** Red light is a stop test, not a dodge, and 0.5 s leaves a guest 0.29 s at worst to let go. Tag out is a teleport with no displacement state to predict; the guest's snap rule (over 2 m) covers it. Bots need a new reflex for Red light: stop instead of dodging.
