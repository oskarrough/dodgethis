# MOBA look

Art direction for `?mode=moba`. [moba-lane.md](moba-lane.md) lists what exists; this says how it should look. Where they differ, this doc wins. The medium is the comic-sticker pass in `core/stylepass.js`: stylised primitives built in code, DOM text outside WebGL. Imported images are limited to our own generated scenery: a background plate under a map's court and quiet seamless tiles for its ground, water and cover. Everything a player reads (units, telegraphs, structures, UI) stays code-built.

## Direction

Magic, not school. One world of old stone floating above cloud, seen in two lights: Overthrow by day (grassed isles over a sea of warm cloud, waterfalls spilling off the edges, a big pale moon in a peach sky), Flagfall by night (the same stone as a violet garden, glowing flowers, a moon). Charm sits on weight, in Oskar's words: "It can become a bit TOO cute, for my liking. Bit more warhammer/moebius vibes blended in here and there." Moebius gives the ink line and the big empty sky; Warhammer gives heft, wear and creatures with an edge. If a frame would pass as a plush-toy advert, it has gone too cute. Oskar again: "we're also grand theft auto, super smash 90s early 2000s vibe. playstation japan. kirby's dream land. n64 golden age." Read: cute with swagger. Bold flat colour, chunky confident type, logos that could sit on a cartridge, attitude in the poses; charm never apologises.

Super Smash Bros. Melee is the feel reference: responsive controls, fast animations, fluid movement. Polish never adds input latency or lengthens a windup. League of Legends and Heroes of the Storm inform readability (HP, combat information), not rendered style. The slowly animating ring around the Ball spawn is the reference for information carried by the world rather than by labels.

**At a glance.** Read the whole fight in half a second: the ground stays quiet, units are loud, and every telegraph is the exact shape of its hitbox. The court is _printed_: flat, low contrast, no shading, no line. Anything that can hurt or be hurt _stands up_: shaded, inked and team coloured. The camera reads roofs, hats and the floor under a unit, not faces.

- **Colour.** Team blue (`teamA`), team red (`teamB`) and Ball gold (`ammo`) are the only saturated colours, and only on things that fight. Scenery keeps clear of all three: waterfalls are white shaded lilac, never sky blue; flowers are apricot by day and orchid by night, never coral; glows are cream or pale teal, never gold. Test: in a crowded-fight screenshot, every saturated patch is a unit, a telegraph, a structure's team part or the Ball.
- **Value.** By day, cloud and sky are lightest, the court next, and the cliff under its rim at least 30% darker than the court, so the court reads as a lit plate over a dark band. By night, the surround is darkest, the court one clear step lighter, and units and glows lightest. Check both in grayscale.
- **Line.** One `ink` navy, never black, in three weights: thick (about 3 px at 1440p) on units, structures and UI; thin (about 1 px) on scenery silhouettes, cliff tops and leaf edges; none on the court, sky or cloud. Cracks and strata are a few ink strokes on vertical stone faces, never on the floor.
- **Mass.** Stone is chunky faceted prisms, wider at the bottom, with chipped bevels, horizontal strata and moss only on top. Things look old: worn edges, cracks, a lean. Plants are few, big, simple planes, at the rim only.
- **Never.** Schoolyard or seaside props (tarmac, chalk, chain-link, buckets, cones, cardboard, windbreaks); plush, felt or sackcloth; blush cheeks or big glossy eyes; rainbows; sparkle or foliage on the court; bloom larger than its source; a scenery glow in a team hue; gold anywhere but the Ball and ammo.

## References

Our own generations live in [pages/](pages/), committed so later agents start from what we based work on. Keep each one we build from or ship, with its prompt beside it; leave rejected sets in thread storage. Superseded sets move to [look/archive/](pages/archive/README.md): history only, never build from them.

- [Gallery](pages/vibes/index.html), [prompts](pages/vibes/prompts.json): the two picked directions. Sun Spell is Overthrow's day, Neon Dream is Flagfall's night; both names are working labels only. Take their construction, palette and value; correct their creatures, which are too round and soft (see Units).
- Oskar's [sheet](pages/vibes/oskar/three-directions.png): its left and centre panels are the source of both. His [floating pillars](pages/vibes/oskar/floating-pillars-ref.png): massing, cloud depth, tall stone with grass caps, a plain court readable from above.
- [Sonic & Knuckles ad, 1994](https://d2w9rnfcy7mm78.cloudfront.net/8001096/original_8f12c68bba999aec388740e69c7167f3.png): blue and red heads locked into one gold-ringed emblem; a candidate shape for the versus moment and the logo (2026-10-10).
- [Oskar's Are.na board, video games](https://www.are.na/don-leche/video-games-anhjn10fbwq): taste for the rebrand (2026-10-10).
- Superseded (schoolyard and seaside, archived 2026-10-10): the [Overthrow fight](pages/archive/overthrow-fight.webp) (concept K), [lobby](pages/archive/overthrow-lobby.webp) and [side view](pages/archive/overthrow-side.webp); [Flagfall water](pages/archive/flagfall-water.webp) and its [prompt](pages/archive/flagfall-water-prompt.md), still the plate shipped under Flagfall until a night plate replaces it.

Oskar's inspiration screenshots come from other games, so they stay out of this public repo: a court in reflective violet shallows, sand in clear water, a pale courtyard under darker roofs and one warm light, a castle at night whose surround carries the drama (smoke, embers, a long drop), ruins over a sea of cloud framed by soft foliage. The shared lesson: **a plain, readable floor; richness, depth and ambient motion only in the surround and at the frame's edges.** Pale on pale fails. Fog, blur or a drop separates the stage from its surround. Take value, light and framing from references, never their ornament, characters or colours outside our budget.

## Concept art

Generated frames (GPT Sol through a Codex thread; other providers can't make images) explore a look before a builder spends a pass on it. They are targets, never imported assets; only scenery may ship: a background plate under the court and quiet seamless ground, water and cover tiles. The recipe:

- Image 1 is a real screenshot at the match camera; ask for the same angle and an unchanged HUD.
- Name what to take from each reference, and use the nouns from [world.md](world.md) (stone isles, the sea of cloud, waterfalls, the night garden, keeps, the moon), or the model copies the references' ornament wholesale.
- Value first, per map: Overthrow a lit court over a dark cliff band and pale cloud; Flagfall a mid-violet court in a darker surround.
- State the colour budget: red and blue for teams, gold for the Ball and ammo, scenery in the map's roles from Ground and maps.
- Describe heroes by silhouette and material, then ask for edge: a horn, a beak, a blade, small eyes under a brow, worn surfaces. Check for plush and for pastel on pastel.
- Ask for three frames: establishing shot, crowded fight at the match camera, side-view intro. The fight is the readability test.
- Add the buildability clause: simple stylised geometry, a lineless court, thin-lined scenery, thick-inked units, no busy texture.
- Use an approved frame as the style anchor, and name what may change and what must stay fixed. Both maps share construction (stone, line, units, UI) and differ in light; a new map takes one of the two lights and changes layout and surround.

## Ground and maps

- **Rendering contract.** `makeStyleMaterial` writes opaque role IDs and ignores opacity. Anything translucent (tells, domes, tint fills) is a plain colour material in the forward layer with `depthWrite = false`, or opaque stippling.
- **Both maps.** The court is the flat top of one big stone isle: one printed colour with luminance-only grain (never past ±7%), lineless forward colour over matching opaque depth geometry. Lane edges, the centre circle and base lines are worn stone inlays at most 10% darker than the court, never paint. The rim is a broken moss lip with a thin ink line, then a sheer stratified cliff falling out of frame. Cover is low, flat-topped, chipped stone blocks on the existing collision boxes and heights; pillars are stacked stone drums under pale caps; base walls are coursed stone with paved tops, joints soft darkening, never ink. Presentation controls apply on restart and never change walking bounds or cover.
- **Overthrow, day.** A butter-green court on lavender-grey stone, mossed on top. Below the rim, a sea of peach and pink cloud; waterfalls drop as white ribbons from the outer edges; smaller isles and broken stone arches fade toward the sky colour with distance; a huge pale moon hangs in a warm peach sky. One warm light from the upper left; shadows are printed ellipses. Apricot flowers and grass tufts on the rim only.
- **Flagfall, night.** Same builders (`match-terrain.js`) with its two-lane layout from `tune.flagfall`. A mid-violet flagstone court under a soft cool pool of light that falls off toward the rim, on aubergine stone. The surround is a near-black violet garden: deep-teal leaf fans, giant orchid bell flowers hanging from the frame's top edge with small cream glowing stamens, a lilac moon, sparse star specks, still black pools at the edges. Hedges become dark-teal leaf banks on the hedge boxes. Glows are small, cream or pale teal, and stay off the court. Built today: shallow dusk water, striped seaside windbreaks and sandstone, all superseded. The plate (`public/scenery/flagfall-water.webp`) keeps its native aspect; tiles repeat uniformly in world metres from `tune.flagfall`. Textures are mipmapped and anisotropic; all scenery controls apply on restart. The effects are fixed pools; pause freezes them and reduced motion stills them.
- At the match camera, lane edges and cover gaps stay legible in grayscale. Waterfalls, drifting cloud, glows and reflections stay quieter than units and telegraphs, and never cover a playable route.
- Small team kerbs keep ownership along lanes; bases keep team hatching and structures printed team pads. The court is the brightest world surface by day and the brightest wide surface by night; friendly tells keep their ink keyline.

## Structures

Tell the tiers apart from above. Walls are weathered stone; team colour goes only on banners, the tower's crystal tip and the core.

- **Tower:** a stone drum, a tapered shaft, a team banner and a team crystal tip, 4 m; from above, a circle with a point. By night the tip glows in its team colour, the only glow allowed a team hue. **Core:** a faceted team crystal over a stepped stone plinth, 7 m, spinning slowly and bobbing; from above, a diamond.
- **Damage:** at 66% and 33% a new ink crack (a split in the geometry) and another 3° of lean on towers. Never darken a shared role.
- **Occlusion:** ground tells ignore depth; units behind a structure draw as an ink keyline silhouette (depth test `Greater`).
- **States:** invulnerable is a dashed cream dome; silenced is crossed cream bands over the crystal; dead is three chipped stone blocks with the banner lying beside them.

## Units

- A size ladder: minions at 0.6, heroes and brutes at 1.0. Every unit stands on a flat team foot disc with an ink rim; yours gets a cream outer ring.
- Creatures with an edge: every silhouette has at least one hard angle (horn, beak, blade, notched ear, hooked claw) and a planted, bottom-heavy stance. Eyes are small and set under a brow line; no blush, no glossy highlights. Materials read as hide, bark, stone, cloth, bone or enamel, worn at the edges. Proportion may be cute (big head, small feet); material and expression may not.
- Minion roles show in one prop visible from above (shield, staff, horned hood, stone helm). Minions are instanced; hit flash goes per instance in `instanceColor`.
- Hero silhouettes are judged at the 58° match camera at one shared scale: Fletcher a slim circle with three quiver arrows tilted back, Mitts a low rounded square with big glove fingers, Carom a forward triangle and open racket, Skip a 1.3 m bar and megaphone ([moba-heroes.md](moba-heroes.md)). Recasting them for the isles keeps these silhouettes.
- Screen-sized, camera-facing HP bars with thick ink borders, team fills, dark missing HP and countable ticks (`health-bars.js`). Check in grayscale: outline and foot disc alone separate hero, minion and structure.

## Ability VFX, hits and deaths

- **Telegraphs** are drawn on the ground at exactly the hitbox size: yours a cream fill with an ink keyline, an enemy's a red outline with a 30% fill. Every enemy tell lasts at least 0.3 s, and bots hold aim that long so the tell reports a real delay. A telegraph is the loudest thing on its patch of floor in both lights; no scenery glow or inlay matches it.
- **Spells** are flat shapes (rings, arcs, runes, shards) with an ink keyline, never particle clouds. Nothing outlives its hitbox or brightens the court beyond a telegraph.
- **Hits:** a 70 ms flat cream flash and an eight-point ink starburst sized by damage bucket. No hit-stop, no knockback. Pooled DOM numbers show only the damage you deal.
- **Deaths:** heroes and minions topple flat like felled statues (`death.js`, `tune.card`); takedowns leave a small inked ring with an X (`stamps.js`). Structures slump into chipped stone with a burst of team motes. Effects use pooled slots, cleared on restart.

## UI skin

- **Menus are Swiss, not centred** (Oskar, 2026-10-10: "those japanese 90s 2000s games were also, while wild and japanese, related to swiss geometric stuff. text wasn't always centered, it had grid systems and old school video game manuals"). A visible grid, flush-left type, numbered items, big index numerals, rules and small caps captions, asymmetric blocks; think a Japanese game manual or The Designers Republic's WipEout, not a centred dialog. Wild colour and swagger sit on that grid.
- **Painted cards** are the approved UI skin (Oskar, 2026-10-10: "now we're talking"): deckled paper ground, a hand-inked 9-slice frame and a watercolour wash behind the title, apricot by day and orchid by night; focus lifts the card and bleeds the wash out behind it. Materials in [look/splash/frames/](pages/splash/frames/), code in `front/skin.css` and `tune.skin`; every new screen reuses them, never hard bezels, double rules or flat ink bands. Icons use the world's ink line.
- **Frame means press** (Oskar, 2026-10-10). Anything you can click or select wears a frame and an offset shadow (corner buttons, ability tiles, menu actions, cards). Readouts never do: kills, timers, wave and Ball countdowns, levels, titles like PAUSED are ink printed on one soft painted ribbon or straight on the world, no border, no shadow. If it looks pressable and isn't, it's wrong. Texture is for cards and art: HUD chips and readouts are smooth and flat, never paper, deckle or torn edges (Oskar: "too torn paper pirates of the Caribbean"). The match top bar is one slim rounded cream pill with a thin ink line: team dots, clock, little else ([Sun Spell match](pages/vibes/sun-spell/03-match.webp)).
- **Unit frame** (portrait, HP, XP, trait chip) sits top-left at the same rect in lobby and match, like WoW's player frame. Q, W and E sit alone at the bottom centre.
- **Minimap** sits bottom-right with the inspect lens beside it, following the map's real footprint; heroes as team dots, tower/core icons, absent from the lobby.
- **Top bar:** your side left in your colour, the enemy's mirrored right; clock, level rosettes, takedowns, structure icons with HP slivers, wave and Ball countdown rings.
- **Inspection:** hover (or long-press, or pad Y hold) for a tooltip card built live from `tune` (`tooltip.js`); world units get a slim nameplate, Alt for the full card in a corner that never covers play. The planned Tab scoreboard lives in `.claude/queue/09-tooltips.md`.
- Pause and result are `core/overlay.js` cards: Resume and Leave game, VICTORY or DEFEAT relative to you.

**Budget.** 60 fps on a mid laptop: p95 of the whole frame in a crowded fight at 2560 × 1440. DPR is capped at 1.5; over 16.7 ms, drop DPR to 1.0, then unit halftone, then minion props, then ambient surround effects, clouds first. Merge static geometry, instance minions, no shadow maps; a shadow is a printed ink ellipse.
