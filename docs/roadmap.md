# Roadmap

The big picture, one line per idea. Details live in the docs each line links to. The orchestrator keeps this current: lines move from Later to Now to the changelog as they happen.

## Where it's going

A small, toy-like hero brawler that grew out of dodgeball, set in the world over the fence ([world.md](world.md)). It's played solo against bots for weeks, then with friends, and then put out in public.

## Now

- Oskar plays the lobby; then its feel pass (the flip, squash, sounds, a calmer layout).

### Todo (2026-10-09)

- [x] Play online button matches the back tile; no more crooked label.
- [x] Seat plates: no icon or cardboard. Bots float on theirs as holograms; humans just stand on it.
- [x] Your own hero has no name tag; other players get a small P2 tag.
- [x] Creating an online game over a LAN or tailnet address no longer crashes (`crypto.randomUUID`).
- [x] Minimap draws each map's layout, Flagfall and Overthrow.
- [x] Oskar: judge the holograms. Approved.
- [ ] Is Flagfall's dark water frame on the minimap too heavy?
- [ ] Decide the walk-on hero rings (Fletcher, Mitts) beside the seats: keep, or pick heroes on the seat itself.
- [ ] Oskar: walk Flagfall's shore lane; do the sandstone walls sit right beside the hedges?
- [ ] Check whether restarts stutter while the three big textures reload.
- [ ] Oskar: two-window online run; judge guest responsiveness to decide on guest-side prediction.
- [ ] Still unproven online: a hidden guest tab catching up, and play over a real network.

## Next

- Balance from the farm once bots play every kit properly; Mitts tuning.
- Online MOBA through the existing rooms, then the lobby's online seats.
- Carom and Skip, then Yo-yo and Mascot: six built heroes, ten designed at most.
- Juice and sound everywhere; the frozen briefs come back one by one.
- The world shows up in the art: the Yard in the sky, schoolyard tarmac, keeps.

## Later

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
