# Roadmap

The big picture, one line per idea. Details live in the docs each line links to. The orchestrator keeps this current: lines move from Later to Now and leave when done.

## Where it's going

Oskar, 2026-10-10: "the game is fast, snappy and fun and rewards mechanics ala super smash bro melee, heroes of the storm, wow etc. easy to start, hard to master. quick to play. fun vs bots, fun in multiplayer"

And: "the game feels alive, in sackboy the menu IS the game. i love that."

A small, toy-like hero brawler that grew out of dodgeball, set in the world over the fence ([world.md](world.md)). It's played solo against bots for weeks, then with friends, and then put out in public.

## Now

- Find the game's look and name: rebrand gallery, Oskar's own directions, floating arenas keep recurring.
- Flagfall: Dunk (knock heroes into the sea) and lanes that meet.
- Dungeon ([dungeon.md](dungeon.md)): fight the Warden with one to five heroes, solo or with friends and optional bots; read the fight report after each pull. Proved fun (Oskar, 2026-10-20: "visual impact made all the difference"); next, more impact on the Warden's hits.
- Make the agent harness faster: feature map, [verify.md](verify.md), ast-grep.

### Waiting on Oskar

Open questions live in Oskar's bb inbox (`bb tasks list --project INBOX`), one task per ask; AGENTS.md step 8 says how to file one.

### Agent todo

- [ ] Check whether restarts stutter while the three big textures reload.
- [ ] Still unproven online: a hidden guest tab catching up, and play over a real network.
- [ ] Keep a headless two-peer check (`bun run online:check`): host and guest sims, snapshots through JSON, rejected snapshots and dropped facts counted. The online-parity thread wrote a throwaway one on 2026-10-11.

## Next

- Balance from the farm once bots play every kit properly; Mitts tuning.
- Online MOBA through the existing rooms, then the lobby's online seats.
- Pong and Skip, then Yo-yo and Mascot: six built heroes, ten designed at most.
- Juice and sound everywhere; the frozen briefs come back one by one.
- The world shows up in the art: Overthrow's day isles over cloud, Flagfall's night garden, keeps ([look.md](look.md)).

## Later

- A league: make a team, climb, see who gets rank 1.
- Guest-side prediction, once guest latency actually bites.
- The camera tilts out to the horizon when a core dies.
- The heroic layer: mounts and R abilities (M5).
- Talents, once the kits settle and the farm can measure them.
- 5v5.

## Shelved

- Highlight clips from replays.
