# How dodgethis can be modified

It's an ongoing goal of the game to be extremely malleable, inspired by emacs, neovim plugins, Claude Code mods and many others. Today that is two mechanisms, with a third we want.

## Drop a folder in

A hero, ability, map or mechanic is a folder under `src/plugins/moba/{heroes,abilities,maps,mechanics}/<id>/`. Three files have fixed names, because the game has to find them without running your code:

- `<id>.js` is the logic. The headless simulation loads it, so it never imports drawing code.
- `<id>-view.js` is the drawing. Only the browser loads it.
- `<id>-tune.js` is the numbers. The root `tune.js` gathers every folder's numbers into one `tune` object, so sliders, replays and every reader see one tree.

Everything else in the folder is yours. `bun run collect-mods` writes the `all-*.js` lists the game imports and runs before `dev` and `check`, so adding a folder is enough. Ids are unique; a duplicate fails to load.

A mechanic is something a map switches on: structures, minions, the Ball, bots, camps, the flag, practice dummies. Casting, catching, bounce and damage are the engine every ability runs through; an ability is a data head and a code body in that path, never its own projectile loop.

## Find where anything lives

`docs/feature-map.md`: one line per player-facing feature, with the files and symbols behind it.

## Not yet: listen to game events

The simulation announces everything that happens as a fact: a hit, a death, a catch, a cushion. Today only feedback (sounds, popups, shake) and the network listen. A hook would let a hero, ability or mechanic listen too, so a feature can react to another without editing it. Load order and merging (what overwrites, what accumulates, what replaces) come with that, when there is more than one author.
