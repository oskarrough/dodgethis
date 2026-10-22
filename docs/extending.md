# Extending

## Modes

1. A plugin is `function (app) { … }`. Everything it registers through `app` is removed when `app.signal` (an `AbortController` signal) aborts; it may return a cleanup for anything else. Keyed registrations throw on duplicates.
2. The loop runs five fixed phases: `input` → `intents` → `simulate` (fixed 1/60 s, only when `session.authoritative` and not paused) → `replicate` → `present` (gets `alpha`). Plugins attach with `app.system(phase, fn)`.
3. Devices produce intents. There is one plain frame per participant per step: `{ move, order, aim, held, pressed: [{ action, at }], released }`. The actions are `primary dash jump stop cancel slot1–slot5`. The mode declares a scheme (`direct` or `pointClick`) that binds devices to this vocabulary. Modes read `app.intents.get(participantId)` and never touch devices. When one step sees an action both pressed and released, `held` says which came last. An `order` point is an edge too: it stays until a step has seen it, so a 144 Hz screen cannot drop one between steps.
4. Plugins define modes: `app.modes.define(id, { scheme, start(run, { roster, options }) })`. One runs at a time, and `run` is a scope that is disposed on stop.
5. `start` returns `{ epoch, snapshot(), apply(state, now), validFact(fact) }`. State is opaque plain JSON. `apply` validates everything before changing anything. A non-authoritative run builds no bodies and interpolates with the core's `createSnapshotBuffer`.
6. `app.session` is `{ local, authoritative, shared, actions }`, set by `app.modes.start(id, { roster, options, session })` and solo by default; `actions` lists the session verbs the local player may use (`pause restart cheat`). A mode may read those four and nothing else about the people around it; "online" never appears in a mode.
7. Events: `app.present(fact)` for gameplay facts (plain data; online replicates these), plus core `menu`, `blur` and `session`. There are no other events and no service registry.
8. Core services are fields on `app`: `scene world clock input intents smooth camera audio overlay debug session modes`. `camera.frame(fn)` takes mode framing, `clock.scale(fn)` takes hitstop (ignored when shared), and `debug.tune/cheat/expose` fill the GUI and `window.game`. The shell's scoped `debug.world(world)` selects the physics world for collider drawing, `window.game.world` and the gravity slider; the latest live registration wins, then falls back on scope abort (or the returned release), ultimately to the shell's default world. `clock.stepOnce()` advances one paused authoritative solo tick, bypassing holds and clearing frame debt; its caller must reject loading and terminal states. The shell also passes `RAPIER` (modes build their bodies with `core/body.js`), `renderer`, `renderStyled(target, camera)` (the styled scene from another camera into a target, for `core/portal.js`) and `setPalette`.
9. Online owns everything network: seats of remote intents (fed with `app.intents.feed`), the `{ matchId, epoch, seq, state, facts }` envelope at 20 Hz, dedupe and timeouts. It calls only the four members from line 5, and restarts whichever mode is running rather than naming one.
10. `src/core/` imports nothing from `src/plugins/`, and no plugin imports another. `tests/boundaries.test.js` enforces this.

## Settled

- `feedback.js`: core gets a juice kit of verbs (`burst`, `mark`, `flash`, `retire`). Each mode keeps its own fact-to-verb switch. It moves into dodgeball whole for now and is extracted at moba M1.
- Camera: core owns the rig, shake, FOV kick and the unshaken aim camera. The mode supplies `frame(dt) → { eye, target }`, applied to both cameras, with shake applied to the render camera only.
- Unit visual: it lives on the core body (root `mesh`, a cosmetic `visual` child, a default mannequin). Loadouts parent their parts to `visual`.
- Lobby: dodgeball owns its difficulty portals. A fresh visit opens the splash in `moba/front/`, where the MOBA maps are the default and Dodgeball is a bonus pick; there's no in-game mode switch. `?mode=dodgeball` opens the hub, `?mode=moba` opens MOBA difficulty, and adding `&play` starts the match directly.
- Oskar's calls: one input path for solo and online humans; `shared` as the single social flag; each mode owns its replica; movement feel is a per-mode tune value; no talents in the MVP; pad casts hold to aim and release to fire.

## Folders: How dodgethis can be modified

It's an ongoing goal of the game to be extremely malleable, inspired by emacs, neovim plugins, Claude Code mods and many others. Folders add features; synchronous aura hooks let them react to each other.

## Drop a folder in

A hero, ability, map or mechanic is a folder under `src/plugins/moba/{heroes,abilities,maps,mechanics}/<id>/`. Three files have fixed names, because the game has to find them without running your code:

- `<id>.js` is the logic. The headless simulation loads it, so it never imports drawing code.
- `<id>-view.js` is the drawing. Only the browser loads it.
- `<id>-tune.js` is the numbers. The root `tune.js` gathers every folder's numbers into one `tune` object, so sliders, replays and every reader see one tree.

Everything else in the folder is yours. `bun run collect-mods` writes the `all-*.js` lists the game imports and runs before `dev` and `check`, so adding a folder is enough. Ids are unique; a duplicate fails to load.

## Make a hero

Copy `heroes/wata/` and `abilities/balloon/`; Wata was built this way and touched one shared engine file.

1. **Hero:** `heroes/<id>/<id>.js` names it and lists its kit: `{ name, basic, kit: { slot1, slot2, slot3 }, silhouette, icon }`. HP, speed and costume sizes go in `<id>-tune.js`; the costume in `<id>-view.js`.
2. **Ability:** `abilities/<id>/<id>.js` declares a `kind` (`shot`, `zone`, `dash`, `melee`, `stance`, `channel`, `instant`), its `tell` and `card`, and code in hooks: `onStart`, `onTick`, `onRelease`, `onRecast`, `onHit`, `onEnd`, `onCancel`, `onDashEnd`. Numbers, `sound` and `juice` live in `<id>-tune.js`.
3. **Effects:** declare `statuses` (slow, stun, freeze, shield, damage over time; tags, stacks, cleanse) and apply them with `sim.apply(unit, '<ability>.<status>', …)`. The strongest slow wins; a stun always lands in full.
4. **Bots:** `bot` names a built-in tactic (`shoot`, `zone`, `dash`, `blink`, `cover`, `catch`, `cone`, `radial`), opts out with `false`, or brings `{ priority, act(ctx, slot) }`. Leave it out and the bot infers one from the kind.
5. **Summons:** declare `summon: { hp, radius, lifetime, think }` and call `sim.summon(owner, '<ability>', at)`: an owned, replicated unit that outlives its owner's death and clears on hero swap, removal or match end.
6. **Check:** `bun run collect-mods` (runs before `dev` and `check`), then `bun run simulate --report --lineup <id>,fletcher,mitts` to see every ability cast and land.

Every new MOBA tune number needs a unit in `src/plugins/moba/units.js` (exact dotted suffixes override bare fields; blocks can declare defaults); `bun scripts/check-moba-units.js` enforces coverage.

A mechanic is something a map switches on: structures, minions, the Ball, bots, camps, the flag, practice dummies. Casting, catching, bounce and damage are the engine every ability runs through; an ability is a data head and a code body in that path, never its own projectile loop.

## Find where anything lives

`docs/feature-map.md`: one line per player-facing feature, with the files and symbols behind it.

## React with auras

A status declares `on: { damage, tick, death, … }`; an ability can declare the same `on` map as an innate listener without adding replicated status records. `statuses.js` owns dispatch. Hooks run synchronously in the host sim; `app.present` remains output-only.

Damage visits attacker and victim through `amplify` (multiply `event.factor`), `damage` (change `event.damage`, or redirect part with `sim.hit`) and `absorb` (shields). `shot.unmodified` skips amplification, not banking or shields. Each phase orders statuses by application id, then unit id; innate listeners precede statuses, in unit-id then kit-slot order. A phase snapshots its listeners: new auras wait for the next dispatch, removed auras never fire again in that dispatch.

`hit` notifies the attacker and `damaged` the victim after HP changes, with effective damage. `cast` announces windup starts to all living units; `death` reaches all living units and the victim before its statuses clear. Inspect `event.source` and `event.target` to distinguish your own actions from others'. Hooks receive their own `unit`, `hero`, `status` (if applied), `ability`, `stats`, `sim`, `tick`, `ticks` and the shared mutable `event`. Cast events have `{ source, ability, slot, point, dir, target }`: `point` is the aim point, and `target` is the targeted unit or `null` for ground aim and caught returns. Damage and death targets are units.

`tick` follows the sim's existing per-unit step order. Status `interval` sets an absolute-tick cadence; omit it to run every step. Innate ticks also run while dead so owned cover can expire. Status `apply`, `remove` and `expire` are local lifecycle hooks; removal supplies `reason` directly, and refresh retains the existing aura's order and cadence. Stagger and Cushion show the two listener forms; Ward and Swig share `aura-damage.js` `absorbAura`. Declaring `on.absorb` also opts a status into shield spent cleanup and waste accounting; no separate flag is needed.
