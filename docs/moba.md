# MOBA design

## What the mode is

A small Heroes of the Storm-style mode: the smallest thing that already feels like HotS in your hands. One lane, shared team XP, no items, no last-hitting, short matches, dodgeable skillshots. Feel first; MOBA systems after the hero feels right on an empty floor. Destroy the enemy core.

Cut: talents (Oskar's call), mana, items, hearthstone, fountains, shift-queue, catch-up XP.

## What awesome means here

- **Readable at a glance.** From any screen you can tell whose ground you're on, what can shoot you and what's shielded. Range rings, target tethers, invulnerability domes and edge pips do that job, alongside the minimap and fog of war.
- **A heartbeat.** Waves meet every 30 s, the objective comes every 2.5 min, and the tempo rises after 10:00. Nobody should spend 40 s with nothing to decide.
- **Fights happen at cover.** Skillshots are the game, so the map is built around what stops them: pillars at mid and near the towers, and hedges between the lane and two flanks. The flanks are there for ganks, because a single strip plays like a treadmill.
- **One twist, on brand: the Ball.** A giant dodgeball appears at mid. Carry it, throw it, dodge it. It doesn't win sieges on its own; it opens them by silencing a structure, which is why every siege starts with a fight at mid. The game is called dodgethis, and the map should say so.

## Controls and feel

Moba sees one frame per participant, and one cast rule for both devices: hold to aim, release to cast.

Obedience from HotS, springs and juice from dodgethis. Stops dead. Facing is cosmetic. Nothing waits on it. No overshoot, no easing.

Movement during a cast point is kept, and the previous order resumes at release. Stop and cancel abort a cast point without firing and refund its cooldown, so a cast can be faked out as in HotS. Abilities have no backswing.

Buffering: Melee-style. The latest press wins, fires on the first legal tick, and clears on stop, cancel, stun or death.

Tune projectile speed before anything else.

The boundary can enter the view near a base: the lens never zooms in just to hide it.

## Screens

```
 screen   splash ──Enter──▶ lobby ──your box fills──▶ crane ▸ descent ──▶ match
 Enter    open tile          walk to your Ready box    swallowed            —
 Esc/B    tiles shake        back to splash            swallowed            pause
 shot     splash ──0.7 s──▶ lobby ──────0.6 s──────▶ apex ──0.8 s fade──▶ gone
            ▲                  │ ▲                                          │
            └──────Esc/B───────┘ └─────────── pause ▸ Hero select ──────────┤
            └─────────────────────── pause/result ▸ Modes ──────────────────┘
```

There are three screens: splash, [lobby](#lobby) and match. The crane and descent between lobby and match are one camera move, not a screen, and take no input. Each screen gives Enter one meaning. `?mode=moba&play&hero=kappa&bots=hard` skips the front end and cuts straight into the match. `modes/moba/front/` owns the splash, backdrop, descent and numbers sheet; `lobby.js` owns the lobby. The in-game look is [look.md](look.md).

Nearer layers travel further, so a move reads as a camera, not a slide.

The descent is where one becomes the other: the line thickens and the colours saturate as the camera lands.

## Lobby

A MOBA map tile from the splash opens a place you play in, like the LittleBigPlanet pod: you run around the lobby as your hero, swap heroes from the strip at the left, try the kit on dummies, shoot a difficulty card and walk into your Ready box. The map is already picked on the splash; the lobby contains only heroes, difficulty and Ready.

The lobby is its own world: the same lobby whichever map you picked, but it shows which map you're about to enter. Bots stand on their seats as holograms; keep them. Difficulty stays magnets you shoot, restyled into our world. Easy, Normal and Hard are floating horseshoe magnets at the near edge, out of the dummy lanes, so kids who can't read can still tell them apart.

Picked direction: Pocket weather ([concept](pages/lobby/04-pocket-weather-v2.webp)): a huge ceramic saucer in magnetic cradles; a small turning diorama in a ceramic weather bowl previews the next map, and only the bowl's miniature, sky cap and label change. No stock fantasy: generic D&D-Steam props (training dummies, banner plinths, rune stones) read as AI filler.

Moebius sets the line, the light and the empty sky. The isles set what things are made of: stone, bark and bone, weathered, per [look.md](look.md). The line is drawn; the props are built. They squash when bumped, rock when hit and settle with a little overshoot.

The toy moment is the flip: the body turns edge-on like a cutout spun on a pin, then comes round as the new hero, mid-stride, and the name slams on.

Ready is part of the saucer. Stand on your plate while gold glaze runs out from the middle of the well, and the crane starts. Step out and it empties.

## Maps

Overthrow: one flat lane along x, with the Ball as the neutral objective. The stronger early guns protect a weak human's team; late pressure stops mirror bots from defending forever. Early guns make a three-hero siege need its wave or the Ball. Hoarding it in your base buys nothing. Scoring always means standing in range, and the defenders' best answer is a dodge.

Flagfall: two lanes instead of one, the flag and the dunk. Two lanes make the 3v3 choose. The silence makes the defenders choose a lane, and three defenders should hold it. On a dunk, they sail out, splash, the ref calls it OUT. The same game in a different place, by night: Overthrow's stone isle with Flagfall's layout, moonlit and violet.

## The seam: maps are data plus one objective

Every number goes in the mode's `tune.js`; map files read those values. Structure positions and prerequisite `after` chains come from the layout; kind stats come from tune. Structures and minions share one lane population. The Ball receives a target hook rather than a lane stub, and publishes its own snapshot clock even without structures.
