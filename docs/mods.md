# How dodgethis extends

Add a folder under `src/plugins/moba/{heroes,abilities,maps,mechanics}/<id>/`, it loads. `bun run dev` and `bun run check` run `bun run collect-mods` first; run it yourself to refresh the lists without starting either. The folder name is the id and the tune key. Read a worked folder before writing one; the code is the truth, this doc is the why.

## Why

Longevity. A project lives as long as someone can add to it without understanding all of it, and the whole keeps working. The structure that has done that longest is emacs's, and dodgethis copies its three parts:

- `load-path`: drop a file in and it loads. Here, the four folders above and the generated registries.
- `add-hook`: attach behaviour without editing what's there. Here, the open item: a mechanic or ability subscribing to the fact stream so features stack without touching each other.
- `describe-function`: find where anything lives. Here, `feature-map.md`.

An ability is a data head and a code body in the shared casting path, not a tree of effect nodes: the authors write code, and the game's identity (catching a shot, shoving someone off a kerb) doesn't fit a closed vocabulary. A new kind, flag or cue is engine work on purpose, so every ability stays catchable, dodgeable and drawable the same way.

Four nouns. Abilities are top level and heroes name them by id, so there is one lookup path. A mechanic is a map feature the sim runs through one contract; a rule is a mechanic with no body. Catching is engine, because a catch window sits in the hottest loop and every shot would otherwise depend on Mitts.

Not built while there is one author: `mod.json`, load order and merge rules (tune overrides, mechanics and hooks accumulate, same id replaces), `?mods=`, loading from a URL. A loaded folder is arbitrary JS in the page, like a Minecraft jar. One flag stands in for the rest: `draft: true` hides a hero from lists, seeded bots and online rooms unless `?hero=` or `?debug` names it.

## Rules the shape enforces

- A manifest (`<id>.js`) is sim code: no Three.js, DOM or view imports. Drawing hooks (`dress`, `animate`, `cards`, `view`, `onboarding`, `ground`, `scenery`, as needed) come from one `<id>-view.js`, which may import id-named helpers. A test checks sim safety.
- `<id>-tune.js` is pure data and imports nothing, or the root tune cycles. These three names are conventions; other filenames are the author's, with the id in each.
- `scripts/collect-mods.js` writes `all-heroes.js`, `all-abilities.js`, `all-maps.js`, `all-mechanics.js`, `all-tunes.js` and `all-hero-views.js`, `all-map-views.js`, `all-mechanic-views.js` in their kind folders (tunes at the plugin root). Lists are generated, not globbed: Bun has no `import.meta.glob`, and a dual path needs a top-level await inside an import cycle. `tests/collect-mods.test.js` fails when a folder isn't listed.
- Anything two heroes could want (bounce, catch, slow) is an engine property declared in tune, never one hero's code.
- A value that differs per map lives in the map's folder. Nothing writes into the shared tune at match start.
