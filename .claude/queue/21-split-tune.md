After: the Flagfall camps, gates and flag builders have landed (they all edit tune.js).

Goal: split `src/plugins/moba/tune.js` (~1100 lines) by domain so parallel threads stop tangling in it. Today `lobby` (321 lines), `flagfall` (187) and `overthrowTerrain` (108) are over half the file. Move each map's block next to its map (`maps/`), the lobby's into `front/`, each hero's ability blocks next to that hero; `tune.js` keeps only match rules (waves, structures, levels, bots, fog, camps, …) and assembles the rest, so `tune.x.y` paths, the debug sliders and `?set=` keep working unchanged. Same treatment for `look.js` if it falls out naturally.

Finish: `tune.js` is roughly 300 lines; no `tune.x.y` path changes for callers; characterization and the full suite green; a match on each map and the lobby boot without errors.

Evidence: line counts before/after per file, `bun run check` green, one headless boot of each map.

Constraints: pure move, no value changes. Update docs/feature-map.md and the AGENTS.md "tune.js is huge" line. Under ~40 calls. Commit with jj; don't push.
