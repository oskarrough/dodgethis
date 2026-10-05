# MOBA lobby

Hero select becomes a place you play in, like the LittleBigPlanet pod: you run around the plaza as the hero you picked, try the kit on dummies, and walk to the start line when you're ready. It replaces the hero card, the kit panel and `front/preview.js` from [moba-front.md](moba-front.md). Mode select and loading stay.

**Moebius and Sackboy.** Moebius sets the line, the light and the empty sky: thin navy ink, pastels mixed toward cream, hatching in the shade. Pixar, Toy Story and Sackboy set what things are made of. Everything you can touch is a handmade object with weight: cardboard stands, stuffed sack dummies, a chalk start line, tape on the floor. The line is drawn; the props are built. Props squash when bumped, rock when hit and settle with a little overshoot. The match then prints the same toys loud.

## The space and the sim

- **The plaza of the real lane**, between the hedges (±12 m), on the front-end preset (`hatch: 1`, thin line, pastels, alpha over the SVG desert). The road runs out of frame both ways and the camera never follows it. It's the lane's 58° pitch, closer in and clamped to the plaza, with the planet and sky filling the top third.
- **The lobby sim is `createSim({ lane: false, lobby: true, spawns, bounds, respawn })`**: `spawns` is `{ participantId: { x, z } }`, one plaza mark per seat; `bounds` is `{ halfX, halfZ }`, clamping walking, orders and dashes one body radius inside the plaza; `respawn` is hero recovery in seconds (0.5 s on your mark, not 8 s). `tune.lobby` supplies bounds, recovery and six marks for the caller to assign. Omitted options keep match and training behaviour unchanged; dummies keep their own recovery timer. The real heroes, the two sparring dummies and the match's views and HUD; no towers, minions or Ball. Headless, `buildMap` takes about 20 ms and the sim about 10 ms; browser shader warm-up is measured in slice 4.
- **The map outlives the lobby.** The map and Rapier world now live in a MOBA-level scope, built on the first loading or direct-play entry. Ready disposes the lobby sim, and loading builds the lane sim on the same world. Cancel returns to the lobby with the map intact, and restart reuses it. Leaving MOBA disposes it. One sim is alive at a time: future lobby runs must also use `map.start(run, world => createSim(...))`, which rejects overlap and disposes the sim on run abort.
- **The roster carries picks.** `practiceRoster(local, difficulty, picks)` now takes `{ seatId: { heroId, team } }`; unpicked seats default to Fletcher. Picks stay in match setup across loading, cancel and restart. `parseMatchSetup` accepts any hero `heroes.js` marks `playable`, and loading, cancel, restart and the `hero=` deep link all pass it through.

## Picking and trying

- **Heroes are cardboard stands** along the far edge, one per `heroes.js` entry. Walk onto a playable stand and your body swaps there. A locked stand shows its silhouette and a "soon" tag, and nudges you off with the deny wobble.
- **The toy moment is the flip.** Run onto Mitts's stand and the body turns edge-on like a cutout spun on a pin, then comes round as Mitts in 0.25 s, mid-stride. Your shadow changes shape a beat first.
- **`swapHero(id, heroId)` keeps the hero object and id**, so views, HUD and bots holding it stay valid, and emits a `swap` fact for them to redress. It swaps definition, profile and costume. It ends any windup, cast, channel, catch window or dash as a stop, and clears Pocket, Bag and held aim. Shots and zones already out finish as they are, and cooldowns reset. Motion transfers explicitly: walk velocity is read before the swap, clamped to the new speed, and written through a new body velocity setter.
- **Trying the kit:** the real kit at real numbers, on the dummies. One already casts Loose back every 4 s behind a 0.4 s tell, so dodging is practice too. With `lobby: true`, all humans use combat `team: 'A'` and dummies `'B'`, so players can't hit each other. Each hero and its snapshot keep the picked team as separate `seatTeam` state.
- **Difficulty is a shooting gallery:** Easy, Normal and Hard standees behind the far pillars, out of the dummies' lanes. Standees are lobby props, not combatants. A cast picks one when its footprint touches it and its aim point was within 2 m of it: shot contact, a Rain zone, a Vault path or landing, a basic. That makes one `pick` per cast, and on a tie, nearest the footprint centre wins. The chosen standee stays up and the others clatter flat.

## Input context and Ready

- **The lobby owns its bindings.** A, LB/RB, QWER and the digits keep their kit meaning. Start is Ready, since there's nothing to pause. B or Esc cancels a held cast first and goes back to modes only when nothing is held. Shortcuts that act as if you walked there: H or d-pad up cycles heroes (with the flip), G or d-pad down cycles difficulty (a shot flies to the standee). Hold Alt or hold Y inspects, as in the match. N or View opens the numbers sheet, which suspends the lobby sim, scrolls with stick, arrows or wheel, and closes on B, Esc, N or View (that B is consumed). A press held across a screen change is ignored until it's released. Walking needs a mouse or pad, as in the match. Every choice also has a key.
- **Ready is the start line:** chalk across the road on your base's side, with six seat boxes. Stand in your box for 1 s and it fills; step out and it empties. Enter, Start or A on the Ready prompt walks your hero there. Bots stand in their boxes as cardboard standees. When every human box is full, loading starts. The only overlay UI is the HUD, tooltips, the Ready and Back glyphs, and the numbers sheet.
- **Online:** players find each other through the existing online plugin's rooms (`src/plugins/online`: public list, join by link, host authority); the plaza is what a room looks like once you're in. The host runs the lobby sim and replicates it like a match, with no lobby code knowing about the network. Other players walk about with name stickers. Walking to the other team's line claims a free seat on that team. The host owns seat claims and readiness, and the earlier claim tick wins, with join order breaking a tie.

## Build slices: contracts with headless proofs first, feel and browser proof last

No new unit tests (Oskar): each "Tests:" below is a throwaway headless script or browser trace whose output goes in the report.

1. **Map scope (built):** map and world above the run. Tests: loading reuses them, cancel and restart keep them, leaving MOBA disposes them, and two sims never overlap.
2. **Roster (built):** `picks` through `practiceRoster`, `playable` in `parseMatchSetup`, then loading, cancel, restart and `hero=`. Tests: a picked hero survives each path.
3. **Lobby sim options (built):** `spawns`, `bounds`, `respawn`, allegiance and seat team. Tests: spawn on marks, can't leave the plaza, 0.5 s recovery, no friendly hits.
4. **Lobby run:** front preset, plaza camera and the input context with its fresh-press guard. Start goes straight to loading. Measure warm-up at 1440.
5. **`swapHero`:** tests that a swap during walk, windup, channel, catch, dash and a shot in flight keeps the id and position, carries clamped velocity and leaves nothing armed.
6. **Stands:** walk-on, H and d-pad up, locked deny, a plain cut instead of the flip.
7. **Gallery:** props, `pick` facts, the aim rule and shortcuts. Tests: Vault and a basic pick; practice on the dummies never does; a Rain over two standees picks the nearer; one pick per cast.
8. **Ready line:** boxes, the 1 s fill, auto-walk, and every-human-ready starting loading.
9. **Inspection:** tooltip access, the numbers sheet and its suspend. Retire `preview.js` and the kit card.
10. **Feel:** the flip, squash and overshoot, sounds. Screenshots at 390, 1440 and 2560 × 1080 from a fresh `/`.
11. **Online seats** (after MOBA online, [M6](moba-plan.md#shared-play-m6)): the plaza replicated through the existing online rooms, name stickers, team by line, host-owned claims. No second network layer.
