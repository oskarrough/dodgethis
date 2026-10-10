# MOBA look

Art direction for `?mode=moba`. [moba-lane.md](moba-lane.md) lists what exists; this says how it should look. Where they differ, this doc wins. The medium is the comic-sticker pass in `core/stylepass.js`: stylised primitives built in code, DOM text outside WebGL. Imported images are limited to our own generated scenery: a background plate under a map's court and quiet seamless tiles for its ground, water and cover (Flagfall's). Everything a player reads (units, telegraphs, structures, UI) stays code-built.

## Direction

The world is a rough sketch drawing or a playable prototype; the UI is crisp, with thick ink borders. Drawn lines may jitter; movement stays fluid. Super Smash Bros. Melee is the feel reference: responsive controls, fast animations, fluid movement. Polish never adds input latency or lengthens a windup.

League of Legends and Heroes of the Storm inform readability (HP, combat information), not rendered style. The slowly animating ring around the Ball spawn is the reference for information carried by the world rather than by labels.

**At a glance.** Read the whole fight in half a second: the ground stays quiet, units are loud, and every telegraph is the exact shape of its hitbox. The ground is _printed_: flat, low contrast, no shading, quiet chalk marks. Anything that can hurt or be hurt _stands up_: shaded, inked and team coloured. Saturation is a budget: team red and blue plus ammo gold are the only loud colours, and scenery never uses them. The camera reads roofs, hats and the floor under a unit, not faces.

## References

Our own generations live in [look/](look/), committed so later agents start from what we based work on. Keep each one we build from or ship, with its prompt beside it; leave rejected sets in thread storage.

- [Oskar's Are.na board, video games](https://www.are.na/don-leche/video-games-anhjn10fbwq): taste for the rebrand (2026-10-10).

- [Overthrow fight](look/overthrow-fight.webp) (concept K), [lobby](look/overthrow-lobby.webp) and [side view](look/overthrow-side.webp): the approved Overthrow target. A pale, warm court on a torn mesa over a colder dusk surround; chain-link, sandcastles.
- [Flagfall water](look/flagfall-water.webp), [prompt](look/flagfall-water-prompt.md): the plate shipped under Flagfall's court. Lost schoolyard things at the edges, open water in the middle, darker than the court.

Oskar's inspiration screenshots come from other games, so they stay out of this public repo. What they taught:

- **A court in the shallows.** A plain tiled stage in shallow, reflective violet water, overgrowth and half-sunk things thickening toward the edges (Flagfall's water).
- **Sand in clear water.** Turquoise shallows with seaweed and pebbles visible below, long foam lines breaking, soft cloud wisps at the frame's edges.
- **A lit courtyard.** A pale lit floor framed by darker roofs; all the detail lives at the edges, and one warm light falls on the play space.
- **A castle at night.** The surround carries the drama (smoke, embers, drifting lights, a long drop) while the floor stays plain and readable.
- **Ruins in the clouds.** A stage over a sea of cloud, with soft out-of-focus foliage framing the screen corners.

The shared lesson: **a plain, pale, readable floor; richness, depth and ambient motion only in the surround and at the frame's edges.** Pale on pale fails. Fog, blur or a drop separates the stage from its surround. Take value, light and framing from references, never their ornament, characters or colours outside our budget.

## Concept art

Generated frames (GPT Sol through a Codex thread; other providers can't make images) explore a look before a builder spends a pass on it. They are targets, never imported assets; only scenery may ship: a background plate under the court and quiet seamless ground, water and cover tiles. The recipe:

- Image 1 is a real screenshot at the match camera; ask for the same angle and an unchanged HUD.
- Name what to take from each reference, and use the nouns from [world.md](world.md) (the Slab, chalk lines, chain-link, sandcastles, the Yard), or the model copies the references' ornament wholesale.
- Value first: a pale, lit stage over a darker, colder surround.
- State the colour budget: red and blue for teams, gold for the Ball and ammo, scenery in violet, teal and sand.
- Describe heroes as the objects they are (quiver, mitt, racket, cardboard cutout), then check for brown on beige.
- Ask for three frames: establishing shot, crowded fight at the match camera, side-view intro. The fight is the readability test.
- Add the buildability clause: simple stylised geometry, lineless world, inked units, no busy texture.
- Use an approved frame as the style anchor, and name what may change and what must stay fixed.
- A new map reuses Overthrow's look wholesale and changes layout and surround. Flagfall's first concepts invented a new style and were rejected.

## Ground and maps

- **Rendering contract.** `makeStyleMaterial` writes opaque role IDs and ignores opacity. Anything translucent (tells, domes, tint fills) is a plain colour material in the forward layer with `depthWrite = false`, or opaque stippling.
- **Overthrow** is pale tarmac with quiet chalk sidelines, service lines and a centre circle, on a finite torn rock edge above a colder violet/teal surround. Terrain is lineless forward colour over matching opaque depth geometry. Presentation controls apply on restart and never change walking bounds or cover.
- **Flagfall** calls the same terrain, chalk, edge, fence and cover builders (`match-terrain.js`) with its two-lane layout from `tune.flagfall`. The court sits in shallow dusk water: a generated plate (slide, goalpost, sandcastle moulds and lily pads at the edges, open water in the middle), under slow seamless caustics. A pale ground tile adds luminance-only grit (never past ±7%) over the patch shader; a soft warm pool cools toward the edges, with printed darkening at cover, pillars, fences and the rim. Flagfall's hedges are striped canvas windbreaks (`windbreak.js`): panels zig-zagging between driftwood poles on a sand berm, merged into one mesh per colour in the seaside palette roles (`sand`, `driftwood`, `seaTeal`, `terracotta`); the collision box and height are the old hedge's. The base blocks are walls, not cover: coursed sandstone with paved tops; pillars are stacked, fluted sandstone drums under cream caps; joints are soft darkening, never ink. The rock is wet sandstone with a darker waterline. A crisp, broken foam line traces the waterline, with a faint court reflection beyond it, with notched, veined pads, tiny flowers, reed clumps, distance-darkened water and a few drifting lights outside the court. The plate (`public/scenery/flagfall-water.webp`) keeps its native aspect; tiles repeat uniformly in world metres from `tune.flagfall`. Textures are mipmapped and anisotropic; all scenery controls apply on restart. The effects are fixed pools; pause freezes them and reduced motion stills them. Overthrow's presentation is unchanged.
- At the match camera, lane edges and cover gaps stay legible in grayscale. Foam, reflections and drifting clouds stay quieter than units and telegraphs, and never cover a playable route.
- Small team kerbs keep ownership along lanes; bases keep team hatching and structures printed team pads. The court is the brightest world surface; friendly tells keep their ink keyline. Hedges are scalloped cover in `courtShade`; pillars are `scenery` with cream caps.

## Structures

Tell the tiers apart from above. Walls are `scenery`; team colour goes only on roofs, flags and the crystal.

- **Tower:** a round drum, a tapered shaft and a team cone flag, 4 m; from above, a circle with a point. **Core:** a faceted team crystal over a stepped pedestal, 7 m, spinning slowly and bobbing; from above, a diamond. [world.md](world.md) turns both into sandcastles.
- **Damage:** at 66% and 33% a new ink crack (a split in the geometry) and another 3° of lean on towers. Never darken a shared role.
- **Occlusion:** ground tells ignore depth; units behind a structure draw as an ink keyline silhouette (depth test `Greater`).
- **States:** invulnerable is a dashed cream dome; silenced is crossed cream tape over the gun; dead is three inked rubble chunks with the flag lying beside them.

## Units

- A size ladder: minions at 0.6, heroes and brutes at 1.0. Every unit stands on a flat team foot disc with an ink rim; yours gets a cream outer ring.
- Minion roles show in one prop visible from above (shield, stick, cone hat, block helmet). Minions are instanced; hit flash goes per instance in `instanceColor`.
- Hero silhouettes are judged at the 58° match camera at one shared scale: Fletcher a slim circle with three quiver arrows tilted back, Mitts a low rounded square with big glove fingers, Carom a forward triangle and open racket, Skip a 1.3 m bar and megaphone ([moba-heroes.md](moba-heroes.md)).
- Screen-sized, camera-facing HP bars with thick ink borders, team fills, dark missing HP and countable ticks (`health-bars.js`). Check in grayscale: outline and foot disc alone separate hero, minion and structure.

## Ability VFX, hits and deaths

- **Telegraphs** are drawn on the ground at exactly the hitbox size: yours a cream fill with an ink keyline, an enemy's a red outline with a 30% fill. Every enemy tell lasts at least 0.3 s, and bots hold aim that long so the tell reports a real delay.
- **Hits:** a 70 ms flat cream flash and an eight-point ink starburst sized by damage bucket. No hit-stop, no knockback. Pooled DOM numbers show only the damage you deal.
- **Deaths:** heroes and minions fall like cardboard standees (`death.js`, `tune.card`); takedowns leave a small inked ring with an X (`stamps.js`). Structures slump into rubble with team confetti. Effects use pooled slots, cleared on restart.

## UI skin

- Cream stickers with 3 px ink borders and hard offset shadows, tilted a degree or two, chunky like toys you could pick up.
- **Unit frame** (portrait, HP, XP, trait chip) sits top-left at the same rect in lobby and match, like WoW's player frame. Q, W and E sit alone at the bottom centre.
- **Minimap** floats top-right with the inspect lens beside it, following the map's real footprint; heroes as team dots, tower/core icons, absent from the lobby.
- **Top bar:** your side left in your colour, the enemy's mirrored right; clock, level rosettes, takedowns, structure icons with HP slivers, wave and Ball countdown rings.
- **Inspection:** hover (or long-press, or pad Y hold) for a tooltip card built live from `tune` (`tooltip.js`); world units get a slim nameplate, Alt for the full card in a corner that never covers play. The planned Tab scoreboard lives in `.claude/queue/09-tooltips.md`.
- Pause and result are `core/overlay.js` cards: Resume and Leave game, VICTORY or DEFEAT relative to you.

**Budget.** 60 fps on a mid laptop: p95 of the whole frame in a crowded fight at 2560 × 1440. DPR is capped at 1.5; over 16.7 ms, drop DPR to 1.0, then unit halftone, then minion props, then ambient surround effects, clouds first. Merge static geometry, instance minions, no shadow maps; a shadow is a printed ink ellipse.
