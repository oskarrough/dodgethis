---
name: art
description: Make concept art, scenery plates, ground tiles or character sheets for dodgethis in the world's style. Use whenever a task asks for an image, a mood frame, a texture or a look to judge.
---

# Art

Every image starts from the world, not from a blank prompt. `docs/world.md` holds the setting, names, keywords and the avoid list; `docs/look.md` holds the style block and the recipe. Read both before you write a word of prompt, and never paraphrase the style block.

## Make the prompt

```sh
bun scripts/art-prompt.js --kind tile --brief "terracotta flagstones for Altamesa's courts" --out pages/art/flagstones
```

The script pastes the style block, the keywords and the avoid list for the kind, adds your brief and writes `prompt.md` into `--out`. Kinds:

- `frame`: a mood frame or concept shot. Add a real screenshot at the match camera as image 1 (`--ref`), as look.md's recipe asks.
- `plate`: a background plate for a map's surround (cloud sea, far mesas, haze). Wide, no court, no units.
- `tile`: a quiet seamless ground, water or cover tile, seen straight down, flat light, low contrast. It is the only kind that may ship as an asset; the floor shader keeps only its light and dark and maps them onto the map's palette (see the tile room, `src/modes/moba/maps/tileroom/`).
- `inlay`: one arena's floor mark, such as Gnomon's sundial, seen straight down, for a single landmark.
- `sheet`: a character or prop sheet: silhouette from above, one prop, material, the cast line from world.md.

Pass `--ref` once per reference image. Name what to take from each one in the brief (value, light, framing), never its ornament.

## Generate

- **In Codex**, use the built-in image generator with the prompt in `prompt.md` and the refs attached. It is the house generator (look.md, Concept art).
- **Anywhere with `OPENAI_API_KEY`**, add `--generate` and set `ART_MODEL` to the image model's id. The script calls the images API and saves `1.png`, `2.png` … beside the prompt.
- **Otherwise** hand `prompt.md` and the refs to Oskar or a Codex thread; never invent another provider.

## Check before you show it

- Every saturated patch is team red, team blue or Ball gold; scenery stays in its map's roles.
- No plush, no glossy eyes, no black outlines, no gold outside the Ball, no text in the world.
- A tile tiles: offset it by half in both directions and look for seams before you hand it on.
- Look at the image yourself, at the size it will be seen, before anyone else does.

Keep what was approved in `pages/art/<slug>/` with its `prompt.md`, and list it in `pages/index.html`. Oskar's own references (other people's art) stay out of the public repo; they live in the project files under `lore/refs/`.
