# MOBA front end

```
 screen   splash ──Enter──▶ plaza ──your box fills──▶ crane ▸ descent ──▶ match
 Enter    open tile          walk to your Ready box    swallowed            —
 Esc/B    tiles shake        back to splash            swallowed            pause
 shot     splash ──0.7 s──▶ plaza ──────0.6 s──────▶ apex ──0.8 s fade──▶ gone
            ▲                  │ ▲                                          │
            └──────Esc/B───────┘ └─────────── pause ▸ Hero select ──────────┤
            └─────────────────────── pause/result ▸ Modes ──────────────────┘
```

There are three screens: splash, [plaza](moba-lobby.md) and match. The crane and descent between plaza and match are one camera move, not a screen, and take no input. Each screen gives Enter one meaning. `?mode=moba&play&hero=mitts&bots=hard` skips the front end and cuts straight into the match. `plugins/moba/front/` owns the splash, backdrop, descent and numbers sheet; `lobby.js` owns the plaza. The in-game look is [moba-look.md](moba-look.md).

**The two looks share an ink and differ in weight.** The front end is the world in ligne claire: one thin navy line, pastels mixed 60–85% toward cream, fine hatching, a lot of sky. The match is a toy printed from that world: thick ink, loud flat colour, a crowded ground. Same `ink`, `cream` and team colours. The descent is where one becomes the other: the line thickens and the colours saturate as the camera lands. The quiet in the front end is what makes the match loud.

**Feel comes before the line.** Menus answer like Smash (snappy, chunky, instant) and are made like Sackboy (tactile, handmade). Only what you can touch is thick and springy: cardboard stickers with a stitched seam and a hard printed shadow. The landscape stays quiet.

## One backdrop, one camera

- One backdrop lives from the splash to the end of the descent and is never rebuilt: a pastel desert under a sky that fills three quarters of the frame, peach to mint to lilac bands, a huge pale planet low left, inked cloud strata, hand-written SVG dunes, mesas and one broken arch. Fletcher stands on the ridge in ink.
- `backdrop.shot(name)` eases the whole backdrop between named shots, authored in its 1440 × 900 world: **splash** (today's frame), **plaza** (the world lifted 400 units and zoomed 1.15 on Fletcher's ridge point, so the planet sits in the top third and the tabletop stands where he stood) and **apex** (tilted up to the sky). Nearer layers travel further, so a move reads as a camera, not a slide. The sky bands move with the farthest layer. One easing and the shot durations live in `front/tune.js`; the plaza's 3D intro and the crane use the same ones.
- Splash → plaza flies into the ink Fletcher: the backdrop takes the plaza shot while the 3D camera eases in from far back along its own view ray and the canvas fades up over the last 40%. The ink Fletcher hides as the real one appears. Esc plays it backwards.
- Budget: layer transforms and opacity only, `will-change` only during a move, no `filter` or animated gradient. Hatching re-counter-scales once when a move settles, never per frame. At most six animated surfaces at once.
- Type: Darumadrop (`--ui-font`) for the big words only; Josefin Sans, self-hosted, for everything else, with tabular figures. Sound: one airy chord per confirm, a wind bed from `music.js`.

## Screens

- **Splash:** two sticker tiles, Dodgeball and MOBA. Enter, A or a click opens the focused tile; MOBA plays the plaza move and the tiles drop out under it; back from the plaza, the same backdrop plays the splash shot and the tiles pop back in on the MOBA tile. Esc or B shakes the tiles. Hover lifts and floods a tile; prompts follow the last device, and mouse gets no key badges. `?mode=moba`, `hero=` and `bots=` open the plaza with those picks.
- **Plaza:** see [moba-lobby.md](moba-lobby.md).
- **Crane and descent:** when your Ready box fills, the plaza camera rises and the backdrop takes the apex shot while the canvas fades out. At the apex the terrain swaps from plaza to lane, behind the sky. The map's name is lettered across the sky and holds only while the lane isn't built yet. Then the 0.8 s descent: the backdrop fades, the canvas fades in, and the camera follows a real arc onto your follow camera while the style preset tweens to the sticker values. Sim, clock and match input stay frozen until it lands, keys pressed during it are swallowed, and the follow spring is primed before control resumes. There is no skip and no cancel; stepping out of the box during its 1 s fill is the cancel.
- **Match cards (built):** Esc or Start opens Resume, Restart, Hero select and Modes; Resume is focused first and Space never confirms. The core's fall freezes the sim, the camera finds the core, then VICTORY or DEFEAT with Again and Back. Again and Restart start a fresh match on the same map.
- **Post-match (planned):** after the core shatter, a dusk sky in the team colour, a ligne-claire table per hero (takedowns, deaths, hero and siege damage, Ball hits, XP soaked) and a team XP graph, from sim facts only. Buttons: Again, Hero, Modes.

## Plumbing (built)

`setStylePreset({ line, hatch, alpha })` and `app.renderDemand(fn)` are run-scoped and restore on dispose; defaults are the match pass byte for byte. Front and backdrop tune lives above the runs, gameplay tune inside each run. Build work is queued in `.claude/queue/13-menu-redesign.md`; each slice proves keyboard-only, pad-only and mouse-only, with screenshots at 390, 1440 × 900 and 2560 × 1080.
