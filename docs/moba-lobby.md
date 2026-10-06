# MOBA lobby

MOBA from the splash opens a place you play in, like the LittleBigPlanet pod: you run around the plaza as your hero, swap heroes from the strip at the bottom, try the kit on dummies, shoot a difficulty card and walk into your Ready box. The 3D plaza fills the frame above the HUD, and nothing is drawn over it except stickers on the props they name. Esc goes back to the [splash](moba-front.md).

**Moebius and Sackboy.** Moebius sets the line, the light and the empty sky. Sackboy and Toy Story set what things are made of: cardboard bots, stuffed sack dummies, a chalk start line. The line is drawn; the props are built. They squash when bumped, rock when hit and settle with a little overshoot.

## The space and the sim (built)

- **The plaza is its own small map:** `createMapScope().start(run, create, 'plaza')` builds a cream tabletop with an ink rim and a hedge lip on three sides, sitting on the backdrop's ridge. The camera is fixed at the lane's 58° pitch and fits all walkable ground above the HUD; portrait widens the lens instead of shrinking the hero.
- **The map outlives the lobby:** map and Rapier world live in a MOBA-level scope. The crane rebuilds the terrain as the lane on the same world; restart reuses it; leaving MOBA disposes it. One sim is alive at a time, through `map.start(run, world => createSim(...))`.
- **The lobby sim is `createSim({ lane: false, lobby: true, readyRoster, spawns, bounds, respawn })`:** one plaza mark per seat, walking clamped to `tune.lobby.bounds`, 0.5 s recovery on your mark. Real heroes, two sparring dummies, the match's views and HUD; no towers, minions or Ball. Humans fight as team A and dummies as B, so players can't hit each other; each hero keeps its picked team as `seatTeam`.
- **The roster carries picks:** `practiceRoster(local, difficulty, picks)` takes `{ seatId: { heroId, team } }`. Picks survive the crane, restart and the `hero=` link. `parseMatchSetup` accepts any hero `heroes.js` marks `playable`.

## Picking and trying

- **Heroes sit in a strip at the bottom left,** docked beside the HUD's hero card at its height, in the band the camera already reserves, so it never covers the plaza. Phones have no room beside the card, so there the strip stands on it, in the slack below the tabletop that the portrait lens leaves. One tile per `heroes.js` entry; yours is the big one, framed gold. Click another tile, press H or d-pad up to swap; locked tiles say "soon", wobble and deny. Click your own tile, press N or View to open its numbers sheet. The keyboard badge (H or ✛↑) sits on the strip and nowhere else.
- **The toy moment is the flip:** the body turns edge-on like a cutout spun on a pin, then comes round as the new hero in 0.25 s, mid-stride, and the name slams on.
- **`swapHero(id, heroId)` keeps the hero object and id** and swaps body and costume in place, emitting a `swap` fact. It cancels everything armed (queued presses, orders, casts, channels, catches, dashes, held aim), resets cooldowns, keeps level and HP fraction, and carries walk velocity clamped to the new speed. Shots already out finish. Locked, unknown or dead picks deny. Lobby only.
- **Difficulty is a shooting gallery:** Easy, Normal and Hard cardboard cards at the near edge, out of the dummy lanes. Any cast or basic whose footprint touches a card within 2 m of its aim picks it, once per cast; a nearer live dummy vetoes, and ties go by footprint centre, then id. The picked card stands, the others clatter flat. G or d-pad down is the autopilot: your hero walks to the firing mark and fires a harmless chalk shot at the next card. Moving or Esc cancels it. The picked card carries the only G badge.
- **Inspection:** hover for a nameplate, hold Alt or Y for the card, as in the match. The numbers sheet (`front/numbers.js`) suspends sim and presentation, scrolls with stick, arrows or wheel, and closes on B, Esc, N or View without leaving. No prompt advertises Alt.

## Input and Ready

- **One meaning per key:** RMB, A, QWER and the digits keep their kit meaning. Enter or Start means Ready. Esc or B peels one layer: the open sheet, then the Ready walk or fill, then the autopilot shot, then a held or active cast, then back to the splash. Presses held across a screen change are ignored until released. The HUD strip lists only move and the kit.
- **Ready is a chalk start line (built):** six boxes, three per team; five practice bots stand in theirs as cardboard cutouts. Enter, Start or clicking the sticker on your box walks you there; stand in it for 1 s while its gold fills and the crane starts. Step out or press Esc and it empties. Your box carries the only Ready sticker; bot boxes carry no labels. The sim owns `readySeats`: claims go through `readySeats.claim(seatId, occupant, tick)`, an earlier tick wins, then join order, then id; a human displaces a bot to a free box.
- **Online (future):** until MOBA online lands, the plaza refuses shared sessions and returns to the splash with a notice. Later the plaza is what an online room looks like: the host runs the lobby sim, and walking to the other team's line claims a seat there.
