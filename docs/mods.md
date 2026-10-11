# Mods: heroes, abilities, maps and pieces as folders

Add a folder under `src/plugins/moba/{heroes,abilities,maps,pieces}/<id>/`, run `bun run registry`, it loads. The folder name is the id and the tune key. Read a worked folder before writing one; the code is the truth, this doc is the why.

## Why

A small core, everything else in user-land, one fixed contract per kind of extension, and a map of where things live (`feature-map.md`). An idea goes in a folder and is playable; a bad one is deleted as a folder. Built-in content goes through the same door a stranger would.

An ability is a data head and a code body in the shared casting path, not a tree of effect nodes: the authors write code, and the game's identity (catching a shot, shoving someone off a kerb) doesn't fit a closed vocabulary. A new kind, flag or cue is engine work on purpose, so every ability stays catchable, dodgeable and drawable the same way.

Four nouns. Abilities are top level and heroes name them by id, so there is one lookup path. A piece is a map mechanic the sim runs through one contract; a rule is a piece with no body. Catching is engine, because a catch window sits in the hottest loop and every shot would otherwise depend on Mitts.

Not built while there is one author: `mod.json`, load order and merge rules (tune overrides, pieces and hooks accumulate, same id replaces), `?mods=`, loading from a URL. One flag stands in for all of it: `draft: true` hides a hero from lists, seeded bots and online rooms unless `?hero=` or `?debug` names it.

## Rules the shape enforces

- A manifest (`index.js`) is sim code: no Three.js, DOM or view imports. Views live in sibling files the view registry lists. A test checks both.
- `tune.js` is pure data and imports nothing, or the root tune cycles.
- Registries are generated, not globbed: Bun has no `import.meta.glob`, and a dual path needs a top-level await inside an import cycle. A test fails when a folder isn't listed.
- Anything two heroes could want (bounce, catch, slow) is an engine property declared in tune, never one hero's code.
- A value that differs per map lives in the map's folder. Nothing writes into the shared tune at match start.

## Hazards

- Online picks travel as a strip position, not a hero id; drafts stay out of shared lobbies for that reason.
- A Ball pickup or hit during a Toss windup drops the held pocket silently.
- A hero's death trait runs after its state is reset.
