# MOBA front end

```
 screen   splash ──Enter──▶ lobby ──your box fills──▶ crane ▸ descent ──▶ match
 Enter    open tile          walk to your Ready box    swallowed            —
 Esc/B    tiles shake        back to splash            swallowed            pause
 shot     splash ──0.7 s──▶ lobby ──────0.6 s──────▶ apex ──0.8 s fade──▶ gone
            ▲                  │ ▲                                          │
            └──────Esc/B───────┘ └─────────── pause ▸ Hero select ──────────┤
            └─────────────────────── pause/result ▸ Modes ──────────────────┘
```

There are three screens: splash, [lobby](moba-lobby.md) and match. The crane and descent between lobby and match are one camera move, not a screen, and take no input. Each screen gives Enter one meaning. `?mode=moba&play&hero=mitts&bots=hard` skips the front end and cuts straight into the match. `plugins/moba/front/` owns the splash, backdrop, descent and numbers sheet; `lobby.js` owns the lobby. The in-game look is [moba-look.md](moba-look.md).

**The two looks share an ink and differ in weight.** The front end is the world in ligne claire: one thin navy line, pastels mixed 60–85% toward cream, fine hatching, a lot of sky. The match is that world printed loud: thick ink, loud flat colour, a crowded ground. Same `ink`, `cream` and team colours. The descent is where one becomes the other: the line thickens and the colours saturate as the camera lands. The quiet in the front end is what makes the match loud.

**Feel comes before the line.** Menus answer like Smash (snappy, chunky, instant) and are made like Sackboy (tactile, handmade). Only what you can touch is thick and springy: cards on deckled paper with a hand-drawn pen line and a watercolour wash behind the title (`front/skin.js`, `tune.skin.style`); the one you're on lifts and its wash bleeds out behind it. The landscape stays quiet.

## One backdrop, one camera

- One backdrop lives from the splash to the end of the descent and is never rebuilt: the day-into-night plate from [pages/splash/](pages/splash/index.html), day isles left, night garden right, with its sky and cloud run on past its edges so a shot never shows a border. Two lineless mist bands drift across the cloud sea; reduced motion stills them. The lobby's dusk is a violet wash over the plate, opacity only.
- `backdrop.shot(name)` eases the whole backdrop between named shots, authored in its 1440 × 900 world: **splash** (today's frame), **lobby** (the world lifted 400 units and zoomed 1.15 on Fletcher's ridge point, so the planet sits in the top third and the tabletop stands where he stood) and **apex** (tilted up to the sky). Nearer layers travel further, so a move reads as a camera, not a slide. The sky bands move with the farthest layer. One easing and the shot durations live in `front/tune.js`; the lobby's 3D intro and the crane use the same ones.
- Splash → lobby: the backdrop takes the lobby shot while the 3D camera eases in from far back along its own view ray and the canvas fades up over the last 40%. Esc plays it backwards.
- Budget: layer transforms and opacity only, `will-change` only during a move, no `filter` or animated gradient. Hatching re-counter-scales once when a move settles, never per frame. At most six animated surfaces at once.
- Type: Darumadrop (`--ui-font`) for the big words only; Josefin Sans, self-hosted, for everything else, with tabular figures. Sound: one airy chord per confirm, a wind bed from `music.js`.

## Screens

- **Splash:** the MOBA is the front door: two painted cards, Overthrow and Flagfall, with Overthrow focused on a fresh visit, so Enter, Start or a click goes straight to its lobby. Dodgeball is a bonus: a small paper tag under the cards, labelled Bonus, last in the cursor order. Each map card shows its illustration (`tune.tile.art`) over its name from the map data; a map without art shows its chalk plan. Enter, A, click or tap opens the focused tile; a map pick sets `setup.map` and plays the lobby move while the tiles drop out under it. Back from the lobby, the same backdrop plays the splash shot and the tiles pop back in on the chosen map tile. Keyboard and pad navigation wraps across the two maps and the bonus tag. Esc or B shakes the tiles. Hover lifts and floods a tile; there are no key prompts. `?mode=moba`, `map=`, `hero=` and `bots=` open the lobby with those picks; `map=` stays in the URL through lobby and match.
- **Lobby:** see [moba-lobby.md](moba-lobby.md).
- **Crane and descent:** when your Ready box fills, the lobby camera rises and soft cloud rolls in from the rim, bottom first, until it fills the screen. At the apex the terrain swaps from lobby to lane, behind the cloud. The map's name is lettered across it. Once the lane is built, a hole opens in the cloud around your hero and spreads outward until the isle is clear, fog-of-war style; reduced motion cuts straight in. For 4 s you look at the whole map while the camera already creeps, very slowly, into the descent. Then the 2.4 s dive: the backdrop fades, and the camera follows a real arc onto your follow camera while the style preset tweens to the sticker values. Sim, clock and match input stay frozen until it lands, keys pressed during it are swallowed, and the follow spring is primed before control resumes. There is no skip; stepping out of the box during its 1 s fill cancels, and in local play Esc or B quits from the crane or dive straight to the splash.
- **Match cards (built):** Esc or Start opens Resume, Restart, Hero select and Modes; Resume is focused first and Space never confirms. The core's fall freezes the sim, the camera finds the core, then VICTORY or DEFEAT with Again and Back. Again and Restart start a fresh match on the same map.
- **Post-match (planned):** after the core shatter, a dusk sky in the team colour, a ligne-claire table per hero (takedowns, deaths, hero and siege damage, Ball hits, XP soaked) and a team XP graph, from sim facts only. Buttons: Again, Hero, Modes.

## Plumbing (built)

`setStylePreset({ line, hatch, alpha })` and `app.renderDemand(fn)` are run-scoped and restore on dispose; defaults are the match pass byte for byte. Front and backdrop tune lives above the runs, gameplay tune inside each run. Build work is queued in `.claude/queue/13-menu-redesign.md`; each slice proves keyboard-only, pad-only and mouse-only, with screenshots at 390, 1440 × 900 and 2560 × 1080.
