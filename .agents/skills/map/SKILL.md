---
name: map
description: Make a new map for dodgethis or improve how one looks: its target frame, light, stone, rim, sky, floor and decals, checked fast against the target. Use whenever a task says new map, polish a map, make it look like the references, or dress a court.
---

# Map

A map is a folder in `src/modes/moba/maps/<id>/` (docs/extending.md): `<id>.js` (the manifest), `<id>-layout.js` (walls, pillars, spawns: colliders, so they are gameplay), `<id>-tune.js` (every number and colour) and `<id>-view.js` (what is drawn). Run `bun run collect-mods` after you add the folder. Read docs/look.md (Direction, Ground and maps) and docs/world.md before you choose a colour.

## The loop

1. **Target.** One paintover of a real screenshot (`bun run shot <map> --spots start`) in the ink direction, through the art skill's target-frame recipe. Two takes; pick one and go. Oskar steers later; "go" means no pick is needed. Keep it in `pages/art/<map>-targets/`.
2. **Build, step by step:** light and haze, then stone (walls, pillars, plinths), then the rim, then the sky and far scenery, then the floor and decals. One fast check after each step.
3. **Fast check.** `bun run shot <map> --compare pages/art/<map>-targets/<take>.webp --gray`, about 10 seconds. Look once: does it read like the target, is the court the lightest plate in grey, do telegraphs stay loudest, triangles under 300k, no browser errors. Fix what is clearly wrong and move on; a later polish round is cheaper than perfect now. At most three tries per step.
4. **Push.** `bun run check` and `bun run test` green, commit your files with a user-facing message, push.

## The kit: reuse it before writing geometry

- `carve.js`: carved flower blocks and panels, chipped blocks, carved walls and pillars, broken columns, ruin stairs and arches, bones, dead trees, lichen. Plain functions returning geometry, seeded.
- `rim-dress.js`: dresses the outside of the rim from the tune's `rim` block (ruins, trees, bones, lichen, or grass-capped pillars).
- View hooks: `cover`, `kerbs` and `pillars` (map.js) and `corePlinth` (lane-view.js) swap in carved versions inside the same colliders. `scenery` (isle.js) gets the rim outline, the cliff rings and a seeded random.
- `glows(mesh, color)` (core/stylepass.js) for light sources: crystals, bell throats, lit windows, the moon. Never the court, never a team hue on scenery.
- `floor-print.js` prints the court from a drawn tile, `floor-decals.js` scatters a decal sheet over it, and `map-art.js` lays painted inlays, such as Gnomon's sundial.
- Live light: sun direction, tints, haze and shadows follow the Tuner (backtick in a match), so expose numbers as tune values bound through `restyle.js`, never baked constants.

## The tune blocks every map has

`palette` and `light` (dir, sun, shade, bandMix, shadow, shadowStrength, shadowLength), `haze`, `clouds`, `spires` or `sky`, `rim`, `floor`, `decals`, `look`, and the named exports `shots` (spots for the shot script: `{ name: [x, z] }`) and optionally `photos`. A map's own values never change another map's: shared defaults live in `tune.overthrowTerrain`, so override and don't edit them.

## Decals

The art skill paints a 4×4 sheet on magenta; `bun run decal-sheet <in.png> public/art/<map>-decals.webp` keys it. In the tune, `decals: { image, grid: 4, count, size, strength, mute, seed, clear, skip }`. Skip any cell that reads as a telegraph: rings of dots, arrows, footprint tracks.

## The judge's checklist: mistakes we made more than once

- Haze swallows the cliff. Keep a clear cliff band under the rim, at least 30% darker than the court; mist starts well below and past it.
- Far scenery too big, too near, too dark. Far things are small, many, hazed and lower than the rim.
- Waterfalls as thin white pinstripes. Broad soft curtains, a bright lip and a mist puff at the foot.
- Moss as grey cobble piles. Fewer, bigger, rounder lobes in a fresh green, hugging edges.
- Lichen stuck in the middle of slabs like stickers. Put it at edges and corners.
- Pale on pale: court, walls and plinth in one value. Walls a step darker, tops lit, court lightest.
- Repeating patterns: the same moss on every block. Randomize and skip most.
- Decals or inlays that read as telegraphs or outshine a red ring.
- A triangle blowout from hidden detail (Flagfall's kerb was 195k). Cut what the match camera can't see.

## Working with other agents

Own a map folder; ask before you touch a shared file (the kit, floor files, stylepass.js, lane-view.js). Reply to whoever briefed you after each step with the shot path, so they can steer early.
