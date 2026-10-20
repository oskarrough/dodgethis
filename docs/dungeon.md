# Dungeon slice

The smallest proof of a WoW-style pull in the MOBA plugin: you play a mender, three bots fight a boss, and after every pull a fight report says why it went the way it did. Design borrowed from Balance Mender (`docs/combat.md` there), not code. The test: does keeping that party alive still feel good after ten minutes?

A new map value, `?mode=moba&play&map=dungeon&hero=mender`, not a new mode: a map already gets heroes, casting, statuses, facts, bots, camera and HUD for free, and the contract lets a map pick its own mechanics. Names (Mender, Warden, Mend, Ward, Slam) are placeholders until Oskar names them.

## A pull

1. The party (you plus Brew, Mitts, Fletcher bots) stands at the entrance of a round room. The Warden waits in the middle.
2. Someone walks within 8 m or hits it: the pull starts. Brew grabs it and holds it, because his damage counts triple for threat.
3. The Warden swings at whoever tops its threat table. Every 16 s it winds up Slam for 2.5 s: a ring on the ground around its target. When it lands, the target takes the big hit no matter what, and anyone else still inside the ring takes splash and a bruise that ticks.
4. You Mend whoever is hurting (a 1.5 s cast that locks you in place) and Ward the target before Slam lands. Over-healing wastes your time; healing too much pulls the Warden onto you.
5. The pull ends when the Warden dies or the whole party is dead. The report opens; three seconds later the room resets (everyone back at the entrance, full health, boss full). Walk back in to pull again. The report stays open until the next pull starts.

There is no mana (the mode cut it), so overheal costs time, not a resource: every overhealed Mend is 1.5 s you weren't healing someone else.

## Numbers (first guesses, tune after one play)

- Mender (`heroes/mender/`): 1400 hp, speed 5, basic `tennisBall` (reused). Slot1 Mend, slot2 Ward. No slot3.
- Mend (`abilities/mend/`): `kind: 'instant'`, picks the living ally nearest the aim point within 10 m (copy Tag out's `targetUnit`), `castPoint: 1.5`, `cooldown: 0`, heals 300, `critChance: 0.1`, `critMultiplier: 1.5`. Max 200 hps.
- Ward (`abilities/ward/`): same targeting, `castPoint: 0`, `cooldown: 12`, applies `ward.shield` (`absorb: true`, `bar: 'shield'`, copy `swig.shield`) of 500 for 8 s.
- Warden (`mechanics/boss/`, tune in `maps/dungeon/dungeon-tune.js` under `boss`): 24000 hp, radius 1.2, walks straight at its target at 3.5 m/s (the room has no obstacles, so no pathing), aggro 8 m.
- Swing (`abilities/swing/`): 150 to the threat target every 1.5 s, reach 2.5 m, 0.4 s tell. About 100 dps on the tank.
- Slam (`abilities/slam/`): first 10 s into the pull, then every 16 s. Windup 2.5 s: the Warden stops moving and swinging, and the ring's centre locks on the target's position at windup start. On land: 700 to the target (wherever it stands), 350 plus `slam.bruise` (periodic, 50 per second for 6 s, `tags: ['debuff']`, refresh) to every other party hero inside 4 m of the centre.
- Threat (`dungeon-tune.js` `threat`): damage to the boss adds `damage × multiplier[heroId] ?? 1` (`multiplier: { brew: 3 }`); effective healing (overheal excluded) adds `heal: 0.5 ×` to the boss while engaged; absorbs add nothing. The boss switches only when a challenger beats its current target by `switch: 1.1`.
- Sanity: Brew (1800 hp) takes about 160 dps averaged with Slam; Mend covers 200 hps if you cast nonstop, so Ward plus a good pre-Slam top-up is what keeps him up. Party damage around 330 dps makes a pull about 75 s, four or five Slams.

## Effects: statuses are the one system

`statuses.js` already is Balance Mender's aura system in small: refresh, replace and capped stacks per source, tick-based `periodic` hooks, `absorb` drained oldest first, live `damageTaken` modifiers, tags and cleanse. Ward's shield, Slam's bruise and any later buff are status declarations in their ability folder; nothing new to build, only to log. Two gaps get filled: every apply, refresh and removal becomes a fact, and an absorb shield that falls off unspent reports what it left (`wasted`, Balance Mender's overheal for shields).

Crits: Balance Mender has none yet (its docs list crit as a later slice; sweet-spot heals only look like crits). Dodgethis already has deterministic basic crits (`critEvery`) and `hit.crit`. Heals get a roll on their own seeded stream (`critChance`; isolated from the sim's `rng` so no existing draw moves and replays agree) inside the heal door, logged on the `heal` fact.

## Facts

Facts already carry `tick`. Ids only: the `pull` start fact carries the roster with names, so the report needs no game constants and no lookups.

| fact                  | fields                                                                                                                                                                | emitted in                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `pull` (new)          | `state: 'start'`, `step` (seconds per tick), `party: [{ id, heroId, name, maxHp }]`, `boss: { id, name, maxHp }`, `abilities: { id: name }`                           | `mechanics/boss/boss-pull.js` on engage              |
| `pull` (new)          | `state: 'end'`, `result: 'killed' \| 'wiped'`, `bossHp`, `threat: { id: value }`                                                                                      | same, on boss death or wipe                          |
| `heal` (new)          | `source`, `target`, `ability`, `amount` (landed), `overheal`, `crit`, `periodic`, `hp`, `maxHp`                                                                       | `combat.js` `heal()`, the one door                   |
| `hit` (extend)        | add `absorbed` (eaten by shields), `periodic`, `status` (key when a tick caused it); existing `damage`, `crit`, `hp`, `maxHp`, `ability`                              | `combat.js` `hit`                                    |
| `absorb` (new)        | `source` (shield caster), `target`, `key`, `status` (instance id), `amount`                                                                                           | `statuses.js` `absorb`                               |
| `status` (new)        | `state: 'on' \| 'refresh' \| 'off'`, `target`, `source`, `key`, `label`, `status` (instance id), `amount`, `until`; on `off` also `reason` and `wasted` (absorb left) | `statuses.js` `apply`, `remove`                      |
| `cast` (extend)       | add `lock` (seconds committed: the cast point) and `targetId`                                                                                                         | `casting.js` cast start; boss swing and slam windups |
| `castCancelled` (new) | `hero`, `ability`, `slot`                                                                                                                                             | `control.js` stop/cancel during a cast point         |
| `threat` (new)        | `unit` (boss), `target` (new top), `previous`, `values: { id: value }` rounded                                                                                        | `boss-pull.js`, only when the boss changes target    |

`death` stays as is. Every new type joins `FACTS` in `index.js`.

## The fight report

Built by a pure reducer, `reduceFight(facts) → report` in `mechanics/boss/boss-report.js` (facts in, numbers out, no imports from the sim), drawn by `boss-view.js` as an `aside` reusing the death recap's classes in `hud.css`. Seconds are `tick × step` from the start fact.

1. Header: Killed or Wiped, duration, Warden health left.
2. Party table, one row per hero: damage done, healing done, overheal %, shield absorbed, shield wasted %, damage taken, deaths, hurt (share of the pull below 30% health), busy (sum of cast locks, a cancelled cast counting up to its cancel, over the duration).
3. Mender's spells: casts, total, average, crits, overheal % per ability.
4. Each death: the last five hits and heals on that hero before it died, with time, ability and source name.
5. Threat: who held the Warden for how long, and every switch ("Warden turned to Mender at 34.2 s").
6. Wasted casts: each Mend that overhealed by 80% or more, with its time ("Mend at 14.9 s (93%)").

Later, not now: a health timeline you can scrub, saved pulls to compare.

## Build plan

Builders: GPT 6.1 Sol. Each slice does not commit, runs `bunx oxlint` and `bunx oxfmt` on its files, `bun test tests/characterization.test.js tests/moba.test.js`, and adds its line to `docs/feature-map.md` (leave that file to the orchestrator if another slice already edited it). Order: S1, then S2 and S3 in parallel, then S4.

**S1. Log what happens.** Owns `combat.js` (`hit`, a new `heal(source, target, amount, ability, { critChance, critMultiplier, periodic })` that rolls the crit on the sim's seeded rng (`grep -n "rng" sim.js`) and returns what landed), `statuses.js` (`apply`, `remove`, `absorb`; take `present` through `createStatuses(ctx)`), `casting.js` (cast start), `control.js` (the stop/cancel branch), `sim.js` (`sim.heal` on the api, `present` into statuses), `index.js` (`FACTS`). Greps: `grep -n "type: 'hit'\|function hit" combat.js`, `grep -n "createStatuses(" sim.js`, `grep -n "type: 'cast'" casting.js`, `grep -n "'stop', 'cancel'" control.js`, `ast-grep run -p 'sim.hit($$$)' -l js src/plugins/moba`. Pass, Balloon and Sprinkler keep their own heals for now. Done means `bun run simulate --count heal,status,absorb,castCancelled --lineup wata,brew,coach --matches 1 --max-seconds 60` prints nonzero `status` and `absorb` counts and the characterization snapshots are unchanged. Evidence: that one printout.

**S2. The Mender.** Depends on S1 (`sim.heal`). Owns new folders `heroes/mender/` (`mender.js`, `mender-tune.js`, `mender-view.js`: copy `heroes/coach/`, drop the trait and cutout), `abilities/mend/`, `abilities/ward/` (copy `abilities/tagOut/` for `targetUnit`, `abilities/swig/` for the shield status). Mend's `onRelease` calls `sim.heal` with its `critChance` and `critMultiplier`; `bot: false` on both. Then `bun run collect-mods` (S2 and S3 both regenerate the `all-*.js` lists; whoever runs it last includes both, never hand-edit them). Greps: `grep -n "targetUnit" -A12 abilities/tagOut/tagOut.js`, `grep -n "shield" abilities/swig/swig.js`. Done means on `?mode=moba&play&hero=mender&debug` Mend heals the ally nearest your cursor after 1.5 s and Ward puts a shield bar on them. Evidence: one screenshot through `bun run review`.

**S3. Room, Warden and bots.** Depends on S1 (status and threat facts). Parallel with S2: no shared files. Owns new `maps/dungeon/` (`dungeon.js`: `kind: 'garden'`, `mechanics: ['boss', 'bots']`, `party: ['brew', 'mitts', 'fletcher']`, `splash: false`, `online: false`; `dungeon-layout.js`: copy `maps/lobby/lobby-layout.js`, round bounds of radius 14, spawns `A` at the entrance x −11, `B` far side, `boss` at the centre, no obstacles; `dungeon-view.js`: copy `maps/lobby/lobby-view.js`, a circle shape instead of the saucer; `dungeon-tune.js`), new `mechanics/boss/` (`boss.js` manifest `{ population: 'boss', create, botHabit }`; `boss-pull.js` state machine idle → engaged → ended → reset, threat table on the unit as `unit.threat`, swing, slam, facts; `boss-bots.js` goal `objective` attacks the Warden and `botThreats` returns the slam ring `{ key, centre, radius, delay }`), new `abilities/swing/` and `abilities/slam/` (declare `slam.bruise`; `bot: false`). Small hooks in shared files: `sim-mechanics.js` (`populations.boss`, push the boss unit into `dummies` so it is hittable, targetable and status-stepped), `sim.js` (`boss?.step(t, dt)` after `flag?.step(t)`), `control.js` `strafe` (skip `d.boss`), `combat.js` (add threat on hits to units with `unit.threat`; skip the dummy respawn for `unit.boss`), `bots.js` `practiceRoster` (a map's `party` fills team A, leaves B empty), `front/index.js` (hide maps with `splash: false`). While engaged, dead party heroes keep `respawnTick` at Infinity; reset revives them through the respawn path. Greps: `grep -n "dummies\|\.post\b" sim.js combat.js control.js targeting.js`, `grep -n "respawnTick" sim-heroes.js`, `grep -n "botThreats" dodge-bots.js`, `grep -n "playableMaps" front/index.js`. S1 and S3 both edit `combat.js` and `control.js`, so S3 starts after S1 lands. Done means `?mode=moba&play&map=dungeon&hero=mender` pulls, the Warden turns to the highest threat, Slam's ring shows and lands, a wipe and a kill each reset the room. Evidence: one short clip of a pull through `bun run review`.

**S4. The fight report.** Depends on S1 and S3. Owns new `mechanics/boss/boss-report.js` (the pure reducer) and `mechanics/boss/boss-view.js` (`view(scene)` returning `{ present(fact), update(sim), dispose() }`: collect facts from `pull start` to `pull end`, render, close on the next `pull start`). Greps: `grep -n "ballView" index.js` (how a mechanic view gets facts), `sed -n 1,40p recap.js` (the panel idiom). Done means after a wipe the panel shows all six sections with numbers that match the pull (a Mend on a full-health ally shows 100% overheal and appears under wasted casts). Evidence: one screenshot through `bun run review`.
