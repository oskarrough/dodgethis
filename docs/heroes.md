# Heroes

The cast of [moba.md](moba.md) and the rules every kit keeps. Who the heroes are is in [world.md](world.md#the-heroes); how they look is in [look.md](look.md#units). Each hero takes a dodgeball rule the others don't use: Kappa the catch, Carambola the ricochet, Mandador out-not-gone. Kits are Q, W and E, with a trait where the hero has one; there are no ultimates ([roadmap.md](roadmap.md#shelved)).

**Dodge deadline.** The latest tick a centred target at 8 m can start moving and still clear, measured in the stepper (projectile radius, edge contact and tick order included), not derived by formula. The host needs 0.2 s of it; at 100 ms RTT a guest loses 0.12 s on average and 0.21 s at worst. So every dodgeable shot here has a deadline of at least 0.45 s, and most of it is windup that shows the hitbox. Measure a shot's deadline again whenever its cast point or speed changes.

**Tells.** Anything that damages, stops or moves an enemy gives at least 0.3 s of visible warning. A zone may spend part of that warning in flight; its landing boundary remains exact throughout. A caught shot sent back shows its line for at least 0.5 s. Self-only casts (stances, dashes) are instant and show their state on the ground while it lasts.

**Interception.** One moba-local resolver handles every catch. It only takes straight hero skillshots: never basics, minion or tower shots, which home. A caught shot is frozen as `{ damage, speed, radius, range, pierce }`, with damage including any cushions it had banked, and it comes back as a new straight shot owned by the catcher: no further banking, no trait procs for its original owner. It hits structures like any ability (25%, blocked when invulnerable). The Ball is never a shot here; see Kappa.

**Silhouettes.** Every hero keeps the 0.45 m collision circle. The translucent team disc reaches beyond the body; it is a recognition mark, not the collision boundary. Bodies above it may be slimmer or wider. Each hero owns one body shape and one prop, and reuses no minion prop (shield disc, stick, cone hat, block helmet). Team colour sits on the disc plus at most one small accent; the body wears its own materials, as specified in [look.md](look.md#units).

| Hero      | Role                | Shape from above                                                  | Prop                                                                     |
| --------- | ------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Ibis      | ranged poke         | slim capsule with a notched crest                                 | quiver of three reed arrows, fanned behind her                           |
| Kappa     | keeper, frontline   | low rounded square, bevelled shell and two short horns            | cream catcher's glove with a thumb gap and finger bumps                  |
| Carambola | trick-shot burst    | triangle, point forward, stone beak                               | wooden paddle held open at his side                                      |
| Mandador  | captain, support    | flat painted board, 1.3 × 0.25 m, chipped square top              | flared speaking-trumpet with a rolled rim; the trumpet takes team colour |
| Lasso     | catcher, initiation | open crescent with a hooked tip                                   | weighted yo-yo and line                                                  |
| Oolong    | frontline, sustain  | broad low hexagonal drum                                          | chipped enamel tea jug; the sash takes team colour                       |
| Undine    | control, sustain    | squat round jug with a pointed side spout and loop handle         | enamel spout; no team accent beyond the disc                             |
| Salvia    | healer, warder      | rounded cloth skirt beneath a pointed sage hood, never a flat bar | bark satchel spilling sage; only its small clasp takes team colour       |

Salvia is a herb-gatherer, not Mandador's twin. Her round body, hood and satchel must remain distinct from the touchline director's board and trumpet, including in grayscale and in hero select. Her collision and the shipped foot-disc radius remain unchanged when her costume changes.

## How kits run

`heroes.js` owns the table; seats use `heroId` (default `ibis`), and a definition with a basic and a kit is `playable`. `bots.js` reads the seat's definition for basics, abilities, ranges and damage. Pocket, bag and folder-owned state (such as Oolong's Stagger pool) live in `abilityState`, are replicated and clear on death. Slows and other statuses follow [extending.md](extending.md#make-a-hero).

The sim owns the catch resolver. `openCatch(hero, { duration, radius, angle, acceptBall, mode, limit, resetSlot, resetCooldown })` arms a window; an enemy straight hero shot freezes into Pocket or Bag at the first eligible contact. Cover and boards win earlier contacts. A shot already touching the hero cannot be caught from behind after dealing damage. `returnsPocket: true` on a shot ability lets its press bypass cooldown and start the shared 0.5 s return tell; `throwCaught` exposes the same action. Stop, cancel or fresh movement aborts a windup; repeated attack orders do not. A cancelled cast puts that slot on the live `tune.cast.cancelLockout` (default 0.75 s), rather than giving a free refund. Cancelling a return preserves Toss's existing cooldown as it ticks down, with the same minimum lockout, and restores Pocket with its original expiry, never a fresh six seconds. Pocket cannot bypass the cancellation lockout; if it expired during the cancelled tell, the sim emits `catchExpired`. `launchShot(hero, dir, stats, origin?)` launches a new owned shot with finite damage/speed/radius/range; a cutout can supply its inside-the-wall origin. Returned shots cannot bank or proc the original owner's trait. Only `acceptBall` windows take the Ball, into carried state with its lifetime unchanged and Pocket emptied.

Abilities identify their `tell`, `held` shape and `effects`, independent of their slot. Stance and channel kinds are mobile by default; a channel can declare `root` or `cancelOnMove`. `onStart`, `onTick`, `onRelease`, `onEnd`, `onCancel` and `onDashEnd` handle their own state transitions. Trait hooks receive `{ hero, sim, tick, ticks, intents, present }`: `onTick` also runs while dead, `onDeath` runs after clearing Pocket/Bag, `onCatch` receives the intercepted source and window (Pocket keeps the thrower's team outside its frozen shot), and `onHit` additionally receives source, shot and target. A death hook can create a cutout; respawn removes it. Prone and freeze block the affected hero's actions, while a Dive window can remain active through prone. Freeze also blocks Ball pickup, like stun. The Ball's stun stops minions from moving and attacking for its duration. These are mechanisms, not the three new kits. Costumes and tells receive the unit and simulation tick explicitly, including replay and hero-select preview; the engine body carries no MOBA state or clock.

## Kappa, the keeper

Frontline counter to skillshots. She stands in front of her team, takes shots and sends them back. Rain, basics and flanks bypass interception; active Catch softens landed damage. 2200 HP, 5.6 m/s. Basic: a glove slap, 3.5 m range, 130 damage, 1/s.

| Key   | Name   | Numbers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Trait | Pocket | Holds one caught shot for 6 s. The glove glows the thrower's colour and a ring on her disc counts down; at zero it's gone. A new catch replaces it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Q     | Toss   | Line skillshot, first hit. Cast point 0.3, range 9, 22 m/s, radius 0.35, 180 damage, cooldown 4. Release kicks the camera; hero contact adds a short 25 ms slowdown and a heavier impact puff. The slowdown is ignored online. With something pocketed, Q throws that instead, through the resolver, with a 0.5 s cast point and its line shown, ignoring Q's cooldown.                                                                                                                                                                                                                                                                                                                                                  |
| W     | Catch  | Instant stance: glove up, half speed, 1.0 s. The first enemy skillshot or Ball to enter a 100° cone within 2 m of her front is caught for no damage. Until that catch, landed hits from any direction deal 25% less damage while W remains active and enabled (`tune.catch.damageReduction`, live 0–1). This is a playtest starting value, not a balance claim; expiry, consumption, cancellation, disable and death end the shield. Dive does not grant it. Cooldown 10, reset to 3 on a catch. The cone latches the cast direction: strafing does not turn it, so a flanker stays outside it. Both teams see a cream wedge filled from the centre, with a 0.15 m ink edge and an outer-rim timer for the whole window. |
| E     | Dive   | Instant 4 m dash toward the aim over 0.25 s, then prone for 0.4 s: no moving, casting or attacking. Catches skillshots like W along the dive and the prone, in a full circle, but lets the Ball pass. Cooldown 8. Blocked by structures.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

**The Ball.** Only W catches it, and it goes straight into the normal carried state with its 45 s life still running: ×0.85 speed, any press throws it under Ball rules. Whatever was pocketed is lost.

**Timing.** Catch is a read, not a guarantee. She presses on the enemy's windup: 1.0 s covers a 0.5 s cast point, the flight to her arc and 0.21 s of guest lag, but pressing too early still expires first. Test early and late guest presses at 100 ms RTT.

**The moment:** the enemy Ibis looses at her carry. Kappa dives across the line, catches the arrow lying on her front, gets up and sends it straight back.

**Counter-play:** throw a cheap shot into the arc to burn W, or wait it out. The cone faces one way, so flank her. Rain, basics and tower shots cannot be caught, but active, unconsumed W reduces their damage along with uncaught skillshot and Ball hits. The prone after Dive is 0.4 s of free hits.

## Carambola, the trick shot

Burst from odd angles. The Ibis pokes you down the lane; Carambola finishes you behind the pillar. Strongest in the lobby and near walls, weakest in the open road. He hits celluloid balls with a ping carambola paddle: a stocky stone-beaked bruiser in a cream tunic, a rolled net on his back. 1300 HP, the lowest, 5.0 m/s. Basic: the default ranged attack, 5.5 m range, 90 damage, 1/s.

| Key | Name     | Numbers                                                                                                                                                                                                                  |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q   | Ricochet | Line skillshot, first hit. Bounces off pillars, hedges, structures and boundary walls, up to 2 cushions. Cast point 0.3, path length 10, 20 m/s, radius 0.35, 170 damage plus 40 per cushion before the hit, cooldown 4. |
| W   | Lob      | Cast point 0.3, range 8. A ball goes up and drops after 0.7 s for 150 in a 2.2 m circle, then leaves hot ground for 3 s that burns 18 every 0.5 s and slows by 25%. Cooldown 9.                                          |
| E   | Pinball  | Targeted enemy serve: cast point 0.35, range 8. Serves the enemy nearest the aim for 130, then the ball pings on to up to 3 more within 4.5 m of the last hit, each hit 20% softer. Cooldown 9.                          |

His own Q indicator draws the full bounce path, so aiming at a wall is learnable in one game. Lob's landing circle is the tell, and the hot ground keeps a chokepoint closed after it lands. Pinball pings a serve from enemy to enemy, softer each hop.

**The moment:** the Ibis limps home on 400 HP behind the far pillar. The ball comes off the wall and the pillar both and finds him there.

**Counter-play:** fight him in the open road, where there's nothing to bank off. Every bank path is printed for its cast point, so step off the line. Step out of Lob's circle before it drops and stay off the hot ground. Kappa catches his balls, frozen at the damage they'd banked. Pinball chains to the nearest unhit enemy in reach: keep apart so the serve can't bounce through.

## Mandador, the captain

Support. Keeps her team in the game by healing and swapping, and chalks a ring that speeds friends and slows enemies. She shouts through a megaphone. 1450 HP, 5.0 m/s. Basic: a tennis ball, 5 m range, 70 damage, 1/s, homing.

| Key   | Name          | Numbers                                                                                                                                                                                                                                                                                                                           |
| ----- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trait | Out, not gone | While dead she's a flat grey cutout on her side's touchline, walking its full length at 5 m/s, untargetable. One action, a throw: cast point 0.35, range 14, 12 m/s, radius 0.35, 60 damage, cooldown 3, heroes only. Each hit takes 2 s off her death timer.                                                                     |
| Q     | Pass          | Line skillshot that stops at the first hero, friend or foe, and passes minions. Cast point 0.3, range 10, 20 m/s, radius 0.4. An ally heals 180; an enemy takes 90 and a 25% slow for 1 s. Cooldown 3.                                                                                                                            |
| W     | Tag out       | The ally hero nearest the aim within 7 m. Cast point 0.3: her hand goes up and enemies see a dashed tether. Then the two swap places instantly. The ally's stun, freeze and slow end; motion ends for both heroes. Dive's prone cost remains. Mandador takes 30% less damage for 2 s. A Ball carrier keeps the Ball. Cooldown 14. |
| E     | Rally ring    | Cast point 0.3, range 8: the megaphone goes up and enemies see the ring fill where it will land. A 3.5 m chalk ring for 5 s: allies inside get 25% Haste, enemies inside a 30% Slow, lingering 0.5 s after they step out. Cooldown 14.                                                                                            |

**The cutout** is its own moba-local unit, not the dead hero's body: the sim ignores a dead hero's intents, so the cutout reads them instead. Its throws launch from the inside edge of the boundary wall, since a shot born outside the map expires at once. Hedges, pillars and structures block them. They never call tower or minion help.

**The moment:** a fight turns on the chalk. Her team runs in hasted, the enemy wades out slowed, and nobody who stayed inside the ring gets away.

**Counter-play:** leave the ring or fight outside it; it does not follow anyone. Body-block Pass, since it stops at the first hero. Burst the ally during Tag out's tether, because Mandador lands where they stood.

**Online:** Tag out is a teleport with no displacement state; the guest's 2 m snap covers it.

## The six

A 3v3 picks from heroes who each do something no one else does (Oskar, 2026-10-14: six unique heroes). Eight are built. Lasso, Oolong and Mandador were picked against [compelling-abilities.md](compelling-abilities.md): Lasso starts fights (the catch, then the payoff), Oolong wins by being hit (the brave escape), Mandador saves allies (the save). Every number is a starting value, and silhouettes stay placeholders until Oskar draws them.

## Lasso, the initiator

Starts fights. Nothing else built can drag someone out of position; Lasso's whole kit is getting a target into his team's reach and keeping them there. Stitches with a yo-yo. 1900 HP, 5.2 m/s. Basic: a yo-yo flick, 3.5 m range, 90 damage, 1/s.

| Key | Name             | Numbers                                                                                                                                                                                                                               |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q   | Throw            | Line skillshot. Cast point 0.3 with the line shown, range 10, 24 m/s, radius 0.4. It stops at the first unit, hero or minion, deals 80 and drags it to 1.5 m in front of Lasso over 0.24 s. Structures and cover stop it. Cooldown 9. |
| W   | Tangle           | Cast point 0.3 with the cone shown: a 3.5 m, 90° cone for 110 damage and a 40% slow for 1.5 s. The payoff after Throw. Cooldown 6.                                                                                                    |
| E   | Around the world | Cast point 0.3 with the ring shown, then a 2.5 m loop: every enemy hero inside takes 60 and is knocked 2.5 m straight out from Lasso. Peel for when the fight he started comes back at him. Cooldown 10.                              |

**The moment:** their Ibis looses from behind his Kappa. The yo-yo threads the gap, Ibis lands at your feet, Tangle, and your Carambola banks the kill.

**Counter-play:** keep a minion or a teammate on the line; the yo-yo takes the first body. The line holds for 0.3 s before release; sidestep while the weight is drawn back. Kappa catches the yo-yo like any straight hero shot: the 80 comes back at Lasso, the drag doesn't.

## Oolong, the bruiser

Wins by being hit. Dives in, soaks the burst, drinks it off and kicks his way out. Chen with a sports drink. 1800 HP, 5.2 m/s. Basic: a palm strike, 3 m range, 85 damage, 1/s.

| Key | Name        | Numbers                                                                                                                                                                                                                          |
| --- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q   | Flying kick | Cast point 0.3 with the line shown, then a dash up to 6 m along the aim that stops at the first unit, friend or foe: 100 damage to an enemy, nothing to an ally. Kick a minion to get in or out. Cooldown 7.                     |
| W   | Stagger     | Instant stance, 3 s: damage he takes doesn't land; it fills a pool that pays out evenly over the 3 s after the stance ends. Shields soak the payout as it lands. The pool shows as a draining bar under his health. Cooldown 14. |
| E   | Swig        | Channel up to 2 s, rooted: 150 shield per second into one shield refreshed to 4 s. Moving, casting, a stun or a pull ends it. Cooldown 10 from the channel's end.                                                                |

**The moment:** Ibis, Kappa and their tower all on you at 600. You Stagger, kneel and Swig: the burst trickles into your shield. They've spent everything; you kick a minion out of the fight on 900.

**Counter-play:** burst him outside Stagger, or stop the drink: he's rooted, so Throw, Tangle's slow after it or any stun breaks it, and a stun is a stun. Wait out Stagger before committing. Tune so the drink beats a burst and loses to pressure: two heroes on him for 6 s still win.

## Undine, the water support

Heals by splashing, slows by soaking, and plants a sprinkler that keeps working while she moves on. Balloons, puddles and sprinklers outlive her death, but clear on hero swap, removal and match end. 1500 HP, 5.0 m/s. Basic: a water flick, 5 m range, 65 damage, 1/s, homing. Silhouette placeholder: a squat round jug with a spout, until Oskar draws her.

| Key | Name      | Numbers                                                                                                                                                                                                                                                                                             |
| --- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q   | Balloon   | Lob to a point within 9 m over 0.6 s, its landing ring shown to enemies. 2 m splash: allies heal 160, enemies take 80 and are soaked (20% slow, 2 s). Press again to pop early after a 0.15 s tell (at least 0.3 s into flight); the ring moves to that pop point. Leaves a 4 s puddle. Cooldown 5. |
| W   | Sprinkler | Plant within 6 m (cast point 0.3). A 300 HP summon for 5 s: its jet sweeps a 4 m circle once a second, healing allies 50 and soaking enemies it passes. Enemies can break it; it blocks nothing. Cooldown 14.                                                                                       |
| E   | Slide     | Instant 5 m belly slide toward the aim over 16 simulation ticks (about 0.267 s). On a puddle it doesn't stop until the puddle ends, up to 10 m. Cooldown 8.                                                                                                                                         |

**The moment:** your Oolong is drinking under three enemies. You plant the sprinkler on him, lob a balloon at his feet and slide out along the puddle; the chasers wade through soak and he walks out on full shield.

**Counter-play:** break the sprinkler first, with targeted basics, zones or balloon pops; untargeted skillshots pass through its 300 HP body. Fight away from puddles: the slide and the soak both live on them. The balloon's ring shows where it lands, so step off it, but watch for the early pop.
