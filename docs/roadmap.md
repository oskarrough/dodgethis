# Roadmap

The big picture, one line per idea. Details live in the docs each line links to. The orchestrator keeps this current: lines move from Later to Now to the changelog as they happen.

## Where it's going

Oskar, 2026-10-10: "the game is fast, snappy and fun and rewards mechanics ala super smash bro melee, heroes of the storm, wow etc. easy to start, hard to master. quick to play. fun vs bots, fun in multiplayer"

And: "the game feels alive, in sackboy the menu IS the game. i love that."

A small, toy-like hero brawler that grew out of dodgeball, set in the world over the fence ([world.md](world.md)). It's played solo against bots for weeks, then with friends, and then put out in public.

## Now

- Find the game's look and name: rebrand gallery, Oskar's own directions, floating arenas keep recurring.
- Flagfall: Dunk (knock heroes into the sea) and lanes that meet.
- Make the agent harness faster: feature map, verify skill, ast-grep.

### Waiting on Oskar

Agents add a line when they need a call; the orchestrator removes it once answered.

- [ ] Rebrand gallery, six directions plus your three: http://office-linux.heron-mermaid.ts.net:5173/docs/look/vibes/
- [ ] Hero pitches as a numbered deck (coming): /docs/pitches/heroes/
- [ ] Is Flagfall's dark water frame on the minimap too heavy?

### Agent todo

- [ ] Check whether restarts stutter while the three big textures reload.
- [ ] Still unproven online: a hidden guest tab catching up, and play over a real network.

## Next

- Balance from the farm once bots play every kit properly; Mitts tuning.
- Online MOBA through the existing rooms, then the lobby's online seats.
- Carom and Skip, then Yo-yo and Mascot: six built heroes, ten designed at most.
- Juice and sound everywhere; the frozen briefs come back one by one.
- The world shows up in the art: the Yard in the sky, schoolyard tarmac, keeps.

## Later

- A league: make a team, climb, see who gets rank 1.
- Guest-side prediction, once guest latency actually bites.
- The camera tilts out to the horizon when a core dies.
- The heroic layer: mounts and R abilities (M5).
- Talents, once the kits settle and the farm can measure them.
- A second map ([moba-map-2.md](moba-map-2.md)), 5v5.

## Shelved

- Highlight clips from replays.

## Changelog

- 2026-10-05 (later): the lobby replaces difficulty and hero select. Walk onto a stand to swap heroes, shoot a cutout to pick difficulty, stand in your chalk box to start. Online peers that flood get dropped. MOBA online is planned in eight slices.
- 2026-10-05: shipped to main. Overnight: the first minute of a match (goal callout, lane arrow, "You" ring), death recap and end screen, OUT! stamps with a ref's whistle and cardboard deaths, quiet tooltips with Alt for detail, edge pan, Try Mode, a hero-select toybox, Mitts reviewed and fixed, and a cleanup 2,600 lines lighter.
- 2026-10-04: playtest round. Console-style splash and difficulty, hero roster, a new HUD with tooltips, Mitts playable, a test link and debug panel, combat logs and the balance farm, world and lobby designs. Parallel agents on the WSL box.
- 2026-09 (late): the MOBA: core split into plugins, lane, bots and 3v3, hero definitions, front-end slices, agents that play and replay whole matches.
- 2026-09 (early): online dodgeball with lobbies, court themes, adaptive music, obstacle layouts.
- 2026-08: the portal hub, Quake-style movement, charge bow, gym scoreboard HUD.
- 2026-05/06: dodgeball: the first sessions, Rapier physics, gamepad, bots that sharpen each round.
