---
name: art
description: Make concept art, scenery plates, ground tiles or character sheets for dodgethis in the world's style. Use whenever a task asks for an image, a mood frame, a texture or a look to judge.
---

# Art

Every image starts from the world, not from a blank prompt. `docs/world.md` holds the setting, names, keywords, the avoid list and the Reference shelf (Oskar's pinned pictures, each with the lesson to take from it); `docs/look.md` holds the style block and the recipe. Read both before you write a word of prompt, and never paraphrase the style block. Pick the two or three shelf pictures that fit the job, attach them when you can reach `lore/refs/` in the project files, and quote their lines in the brief either way.

## Make the prompt

```sh
bun scripts/art-prompt.js --kind tile --brief "terracotta flagstones for Altamesa's courts" --out pages/art/flagstones
```

The script pastes the style block, the keywords and the avoid list for the kind, adds your brief and writes `prompt.md` into `--out`. Kinds:

- `frame`: a mood frame or concept shot. Add a real screenshot at the match camera as image 1 (`--ref`), as look.md's recipe asks.
- `plate`: a background plate for a map's surround (cloud sea, far mesas, haze). Wide, no court, no units.
- `tile`: a quiet seamless ground, water or cover tile, seen straight down, flat light, low contrast. The house style is drawn, never photographed: flat colour, thin dark joints, a soft wash inside each stone (Oskar's drawn flagstones, `public/tiles/flags-drawn.webp`, are the anchor). Painted scenery assets may ship too; gameplay silhouettes and telegraphs stay code-built. The floor shader keeps only its light and dark and maps them onto the map's palette (see the tile room, `src/modes/moba/maps/tileroom/`).
- `inlay`: one arena's floor mark, such as Gnomon's sundial, seen straight down, for a single landmark.
- `sheet`: a character or prop sheet: silhouette from above, one prop, material, the cast line from world.md.

Pass `--ref` once per reference image. Name what to take from each one in the brief (value, light, framing), never its ornament.

## Generate

- **In Codex**, use the built-in image generator with the prompt in `prompt.md` and the refs attached. It is the house generator (look.md, Concept art).
- **Anywhere with `OPENAI_API_KEY`**, add `--generate` and set `ART_MODEL` to the image model's id. The script calls the images API and saves `1.png`, `2.png` … beside the prompt.
- **Otherwise** hand `prompt.md` and the refs to Oskar or a Codex thread; never invent another provider.

## Two recipes that worked (2026-10-25)

**Target frame (a paintover).** Image 1 is a real screenshot from `bun run shot <map> --spots start`. Attach the map's references and an approved target from another map as the style anchor (`pages/art/*-targets/`). Keep exactly: camera, framing and layout (walls and pillars are colliders), every unit's place, size, silhouette, team colour and navy outline, the HUD, and telegraphs as the loudest marks. Change freely: floor material, walls, everything past the rim, and the light. Ask for two takes, one close and one bold, at 1600×900, plus `notes.md` with one line per take and a build order on our kit. Save in `pages/art/<map>-targets/` with `prompt.md`.

**Decal sheet.** The prompt script currently has no decal kind; use `--kind inlay` with an explicit 4×4 asset-sheet brief overriding its single-inlay framing. Do not use `sheet`, which appends character-sheet instructions. A 2048×2048 sheet, 4×4 cells of 512 px, one decal per cell, centred, seen straight down, flat light, on pure magenta `#ff00ff`, with no magenta anywhere else. Drawn, like `public/tiles/flags-drawn.webp`: flat colour, a sparing thin navy line, a soft wash, soft fading edges. Low contrast: nothing as dark as navy in large areas, nothing red or gold, no text, no rings of dots and no tracks or arrows, which read as telegraphs. List the sixteen cells in the brief. Ask for no drawn grid lines or cell borders, with a clear magenta gutter inside every cell. A broken rosette can still read as a ring: inspect and skip it even if the prompt forbade rings. Then run `bun run decal-sheet <in.png> public/art/<map>-decals.webp`. Inspect its printed check-image path on the dark background; if faint scuffs retain pink, increase `--fuzz` (Salinas used 40), inspect again, and mute them in the map. The tool resizes the shipping sheet to 1024 by default; use `--size` if another output size is needed.

Painting threads (Codex) make the images; code threads ask one by `bb thread tell` and wait. Never invent another provider.

**Heroes.** Before a hero is painted or modelled, its row in docs/heroes.md's silhouettes table names its shape from above, its one prop and its accent part, and no two rows share a shape or prop. The cast sheet once drew Salvia as a copy of Mandador's board because nothing said otherwise. Paint the whole cast on one sheet at match size, so twins show up side by side, and keep the family mark: a dark brow band with small cream eyes, chipped edges, one hard angle each.

## Check before you show it

- Every saturated patch is team red, team blue or Ball gold; scenery stays in its map's roles.
- No plush, no glossy eyes, no black outlines, no gold outside the Ball, no text in the world.
- A tile tiles: offset it by half in both directions and look for seams before you hand it on.
- Look at the image yourself, at the size it will be seen, before anyone else does.

Keep what was approved in `pages/art/<slug>/` with its `prompt.md`, and have the pinboard owner list it in the gallery; do not edit their index or items registry without ownership. Oskar's own references (other people's art) stay out of the public repo; they live in the project files under `lore/refs/`.
