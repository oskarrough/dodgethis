# Core split

dodgethis becomes a small core plus plugins. Dodgeball is the first plugin, a MOBA mode (Heroes of the Storm-ish) the second, online play the third. Same core, different games.

This doc says where the line runs through today's code. It's the brief for whoever designs the plugin architecture. The refactor that follows must not change the game: every existing test stays green, and solo and online dodgeball play exactly as before.

## Design against exactly three plugins

- **dodgeball**: a mode. Brings its own court, units, weapons, AI, rounds.
- **moba**: a mode. One lane, heroes with QWE skillshots, minions, towers. Click-to-move with a mouse, sticks on a gamepad.
- **online**: cross-cutting. Must run any mode without that mode knowing it's online.

Online is the test. Modes are easy: each brings its own world. If dodgeball has to know it is online, the architecture is wrong. Anything these three don't need is a cost, not a feature. We are not building an engine.

## Requirements

1. **Fixed phases.** Input → fixed-step simulate → present. Plugins attach systems to phases. Online hooks after input (send local intents, receive remote ones) and after simulate (snapshot/apply).
2. **Input is intents, not keys.** `moveDir`, `moveTo(point)`, `aim(point)`, `cast(slot)`, `dash`. Devices produce intents; modes consume them. Mouse click-to-move and gamepad sticks are two adapters over one controller.
3. **Mode state is data.** A mode can snapshot and apply its state so online can replicate a mode it has never heard of. Today `replica.js` imports `player`, `arrow` and `arena` directly; that coupling is what has to go.
4. **Plugins don't import each other.** They talk through events and services the core provides. Each plugin registers its stuff and returns a disposer.

Reference points: Bevy plugins (a function that takes the app and adds systems, resources, events), Vite/Obsidian plugins (hooks + dispose).

## Core

Knows nothing about arrows, courts or rounds.

- `physics.js`, `move.js` (Quake accel, already pure), `spatial.js`
- `input.js` device layer: keyboard, pointer, gamepad, rumble, active device
- `render.js`, `style.js`, `stylepass.js`, `shadows.js`
- `audio.js`, `music.js` as an engine; cues belong to plugins
- `performance.js`, `debug.js` (the GUI shell; mode-specific cheats register into it)
- the frame loop, fixed timestep, pause and tab-return handling from `main.js`
- `portal.js` hub, which becomes the mode picker
- the body half of `player.js`: rigid body, collider, character controller, velocity, jump with coyote time, dash, lean springs

## dodgeball plugin

- `arrow.js`, `weapons.js` (charge meter), `weaponhud.js`, `aimline.js`, `nearmiss.js`
- `round.js`, `matchflow.js`, `roster.js`, `scenario.js`
- `ai.js`, `court.js`, `obstacles.js`, `arena.js`
- `death.js`, `godmodefx.js`, `impact.js`, dodgeball's use of `feedback.js`
- the loadout half of `player.js`: bow, hand, `heldArrow`, hp, badge, armed poses
- from `main.js`: scoreboard, weapons and aim sections, the `present(event)` router, cheats

## online plugin

- `net.js` (PeerJS transport, handshake), `lobby-directory.js`, `online-session.js`, `online-ui.js`
- the host-snapshot/guest-replica model from `online-match.js` and `replica.js`, rewritten against requirement 3 instead of dodgeball internals

## The knots

The file lists are the easy part. The real work sits in four places:

1. **`player.js`** is one ~450-line `createPlayer` closure mixing the controller with the bow, the hand, ammo and hp. It needs to become a core body plus a mode-provided loadout.
2. **`main.js`** is a single ~930-line `main()`. The `ctx` object at line ~129 ("Services a Round borrows") is already a plugin interface in all but name. Start there. Its `present(event)` is dodgeball-specific routing (hitmarks, weapon HUD, rumble per event type) and moves to the plugin.
3. **`tune.js`** is one global read everywhere. `physics`, `player`, `camera`, `debug` are core; `arrow`, `weapons`, `ai`, `fx`, `cheats` are dodgeball. Plugins should register their own tune sections so the debug GUI still shows them all.
4. **`input.js`** is generic apart from baked-in dodgeball verbs (`consumeWeaponSwitch`, press/release for the bow). Those become intents.

Also: online currently swaps out the whole match flow (`flow = onlineMatch` in `main.js`) and `main.js` branches on `onlineMatch` for input sending. Under the new architecture that branching should disappear.

## Open questions for the architect

- Does `feedback.js` (pooled particles and floor marks) belong in the core as a juice kit, with modes supplying the events? Probably.
- Who owns the camera: core with mode-supplied framing, or the mode?
- Where does a unit's visual live when the loadout decorates the core body?
- Hub and portals: core, or a tiny "hub" plugin of its own?

## Handoff

1. **Architect** reads this and the code and writes `docs/plugin-architecture.md`: the plugin shape, phases, intents, the snapshot contract, events/services, and how each of the three plugins would register. No code. Sketch the moba and online registrations too, even though only dodgeball gets built now.
2. **Implementer** does the refactor against that doc, in steps that each keep `bun run check` green. Online dodgeball must still work at the end. MOBA mode is not part of this.
