# Extending

## Glossary

- **core** (`src/core/`): the engine. Physics, loop, intents, camera, sound, screens. Imports nothing above it.
- **mode** (`src/modes/<id>/`): a game you can play. `dodgeball` and `moba`. A mode owns a loop, a ground and a win condition, and imports only core.
- **mod** (`src/modes/moba/<kind>/<id>/`): a piece dropped into a mode. A hero, ability, map or mechanic: three fixed files, found by folder. Today only moba has mods.
- **online** (`src/online/`): networking. Not a mode and not core; it imports core and restarts whichever mode is running.
- **plugin**: the mechanism, `function (app) { … }`. Modes and online are plugins; the word names how they attach, never a folder.

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
10. Core imports only core; a mode and online import core and themselves; nothing imports sideways. `tests/boundaries.test.js` enforces this.

## Settled

- `feedback.js`: core gets a juice kit of verbs (`burst`, `mark`, `flash`, `retire`). Each mode keeps its own fact-to-verb switch. It moves into dodgeball whole for now and is extracted at moba M1.
- Camera: core owns the rig, shake, FOV kick and the unshaken aim camera. The mode supplies `frame(dt) → { eye, target }`, applied to both cameras, with shake applied to the render camera only.
- Unit visual: it lives on the core body (root `mesh`, a cosmetic `visual` child, a default mannequin). Loadouts parent their parts to `visual`.
- Lobby: dodgeball owns its difficulty portals. A fresh visit opens the splash in `moba/front/`, where the MOBA maps are the default and Dodgeball is a bonus pick; there's no in-game mode switch. `?mode=dodgeball` opens the hub, `?mode=moba` opens MOBA difficulty, and adding `&play` starts the match directly.
- Oskar's calls: one input path for solo and online humans; `shared` as the single social flag; each mode owns its replica; movement feel is a per-mode tune value; no talents in the MVP; pad casts hold to aim and release to fire.

## Folders: How dodgethis can be modified

It's an ongoing goal of the game to be extremely malleable, inspired by emacs, neovim plugins, Claude Code mods and many others. Folders add features; synchronous aura hooks let them react to each other.

## Drop a folder in

A hero, ability, map or mechanic is a folder under `src/modes/moba/{heroes,abilities,maps,mechanics}/<id>/`. Three files have fixed names, because the game has to find them without running your code:

- `<id>.js` is the logic. The headless simulation loads it, so it never imports drawing code.
- `<id>-view.js` is the drawing. Only the browser loads it.
- `<id>-tune.js` is the numbers. The root `tune.js` gathers every folder's numbers into one `tune` object, so sliders, replays and every reader see one tree.

Everything else in the folder is yours. `bun run collect-mods` writes the `all-*.js` lists the game imports and runs before `dev` and `check`, so adding a folder is enough. Ids are unique; a duplicate fails to load.

## Make a hero

Copy `heroes/wata/` and `abilities/balloon/`; Wata was built this way and touched one shared engine file.

1. **Hero:** `heroes/<id>/<id>.js` declares `{ unit: { hp: 'hp', radius: 'radius', speed: 'speed', attack, kit: { slot1, slot2, slot3 }, traits, brain }, name, silhouette, icon }`. `attack` names a basic ability; omit it for the default ranged attack. `brain` is an optional hero bot function. Selection and presentation stay outside `unit`. HP, speed and costume sizes go in `<id>-tune.js`; the costume in `<id>-view.js`.
2. **Ability:** `abilities/<id>/<id>.js` declares a `kind` (`shot`, `zone`, `dash`, `melee`, `stance`, `channel`, `instant`), its `tell` and `card`, and code in hooks: `onStart`, `onTick`, `onRelease`, `onRecast`, `onHit`, `onEnd`, `onCancel`, `onDashEnd`. Numbers, `sound` and `juice` live in `<id>-tune.js`.
3. **Effects:** declare `statuses` (slow, stun, freeze, shield, damage over time; tags, stacks, cleanse) and apply them with `sim.apply(unit, '<ability>.<status>', …)`. The strongest slow wins; a stun always lands in full.
4. **Bots:** `bot` names a built-in tactic (`shoot`, `zone`, `dash`, `blink`, `cover`, `catch`, `cone`, `radial`), opts out with `false`, or brings `{ priority, act(ctx, slot) }`. Leave it out and the bot infers one from the kind.
5. **Summons:** declare `summon: { hp: 'hp', radius: 'bodyRadius', lifetime: 'duration', brain }` and call `sim.summon(owner, '<ability>', at)`: an owned, replicated unit that outlives its owner's death and clears on hero swap, removal or match end. Computed values may remain functions of stats (Balloon's lifetime is flight plus puddle); `state` and `validData` keep custom state local.
6. **Check:** `bun run collect-mods` (runs before `dev` and `check`), then `bun run simulate --report --lineup <id>,fletcher,mitts` to see every ability cast and land.

`unit-definition.js` resolves this MOBA-local shape for heroes, the Warden (`heroes.js` `WARDEN_UNIT`), minions (`lane-waves.js`) and structures (`lane-structures.js`). Numeric fields name local tune keys; `attack` may instead map damage/rate/range/tell to tune keys. `brain: 'lane'` and `'boss'` identify the existing controllers, not a new dispatcher. Spawn order, live getters and each controller's evaluation points stay unchanged. `bun scripts/check-moba-effects.js` checks unit references and rejects unknown fields; computed fields stay code. Dodgeball keeps its own definitions.

Every new MOBA tune number needs a unit in `src/modes/moba/units.js` (exact dotted suffixes override bare fields; blocks can declare defaults); `bun scripts/check-moba-units.js` enforces coverage.

A mechanic is something a map switches on: structures, minions, the Ball, bots, camps, the flag, practice dummies. Casting, catching, bounce and damage are the engine every ability runs through; an ability is a data head and a code body in that path, never its own projectile loop.

## Find where anything lives

`docs/feature-map.md`: one line per player-facing feature, with the files and symbols behind it.

## Declare an area ability

Use `stages: { release: [{ deliver: 'area', from: 'self', shape: 'cone', targets: 'enemies', blockedBy: 'cover', hit: ['damage', 'slow'] }] }` (Tangle). Circles read `radius`; cones read `range` and `angle`. Damage reads `damage` with level growth at each target's release-time evaluation; `slow` and `freeze` use the matching `statusEffects` record. Knockback reads `knockback` and `time` (Around the world). Explicit damage/knockback records can bind other local tune keys; damage's `scale: null` disables growth. Area statuses pass only their source to `apply`, so their record owns live magnitude/duration resolution and slow clamping. A zero slow creates no status.

Every area uses targeting population order and coordinate snapshots; `targets: 'enemyHero'` includes practice dummies, including for Red light now. Red light's `where: ({ target, stats }) => Math.hypot(target.body.velocity.x, target.body.velocity.z) > stats.movingSpeed` is a code escape hatch, not schema; it receives only the bare target and stats. `from: 'at'` centres an area on the event point (the zone's `{ x, z }` on `land`). Statuses resolve before damage; further effects on a lethal target are dropped. Damage areas emit the collective impact; freeze emits contact feedback.

## Declare a target ability

Use `stages: { release: [{ deliver: 'target', pick: 'nearestAim', targets: 'ally', range: 'range', hit: ['shield'] }] }` (Ward). `ability.js` supplies cast-start picking: living teammates other than the caster, nearest the aim point, ties by id. `statuses.js` rechecks the locked ally's life, team and range at release; a lost target emits `targetLost`, never retargets. Target actions can keep code in `before` and `after` around their effects; Tag out uses these for its position swap and guard.

Payloads are heal, shield and cleanse records. Heal accepts tune references for amount and optional crit chance/multiplier; `scale: null` disables level growth, as Mend and Pass require. Shield uses its matching `statusEffects` record. Cleanse lists status tags in order; `'cleanse'` expands to stun, freeze, slow. Target effects emit contact feedback; a custom `after` owns that feedback instead.

Pass declares `stages.hit.before` as an action array: `pick: 'event'` uses the touched unit, and `consume: true` stops the hit only when the ally target matches. This runs at the old `onHit` evaluation point, before damage and slows. Its heal reads the projectile's launch-time amount, falling back to live tune; Mend and Ward read their numbers at release.

## React with auras

A status declares `on: { damage, tick, death, … }`; an ability can declare the same `on` map as an innate listener without adding replicated status records. `statuses.js` owns dispatch. Hooks run synchronously in the host sim; `app.present` remains output-only.

Damage visits attacker and victim through `amplify` (multiply `event.factor`), `damage` (change `event.damage`, or redirect part with `sim.hit`) and `absorb` (shields). `shot.unmodified` skips amplification, not banking or shields. Each phase orders statuses by application id, then unit id; innate listeners precede statuses, in unit-id then kit-slot order. A phase snapshots its listeners: new auras wait for the next dispatch, removed auras never fire again in that dispatch.

`hit` notifies the attacker and `damaged` the victim after HP changes, with effective damage. `cast` announces windup starts to all living units; `death` reaches all living units and the victim before its statuses clear. Inspect `event.source` and `event.target` to distinguish your own actions from others'. Hooks receive their own `unit`, `hero`, `status` (if applied), `ability`, `stats`, `sim`, `tick`, `ticks` and the shared mutable `event`. Cast events have `{ source, ability, slot, point, dir, target }`: `point` is the aim point, and `target` is the targeted unit or `null` for ground aim and caught returns. Damage and death targets are units.

An event accepts an action array, a replacement function, or `{ before, do: [actions], replace, after }`. Only `amplify`, `damage`, `absorb`, `release`, `land` and `hit` accept `before`; other events reject it at load. Returning `true` consumes the event (no actions or `after`); `replace` overrides `do`, and `after` runs once after resolution. Legacy lifecycle hooks remain replacement fallbacks; combat's legacy `onHit` remains a consuming before-hook. Damage-phase consumption stops the hit and emits `blocked` with reason `hook`, impact point and direction. Existing aura functions retain their order and mutable event; consuming an aura event also stops its remaining listeners.

Ability-local `stages: { release, land, dashEnd, end, hit }` are separate from the aura-only `on` map. Their event has the cast shape above: `event.target` stays a bare unit or null; `event.point` is the aim point except on `land`, where it is the zone position. Damage actions expose `event.lethal` to `after`. Legacy hooks retain their old top-level arguments. Each dash keeps its own event (including custom instant dashes), cleared on completion or cancellation; lifecycle context is sim-local, not replicated state.

Declared actions in a status hook resolve their actor from `status.src`, not the carrier: position, team, level and credit belong to that source. A removed source skips its actions; core statuses without an owning ability reject action arrays. Area delivery uses `applyEffects(source, unit, effects, stats)`; `source` is `{ unit, ability, slot, dir, point, target? }` attribution/geometry, so a future ground field can share the same status-before-damage and lethal-hit rules.

`tick` follows the sim's existing per-unit step order. Status `interval` sets an absolute-tick cadence; omit it to run every step. Innate ticks also run while dead so owned cover can expire. Status `apply`, `remove` and `expire` are local lifecycle hooks; removal supplies `reason` directly, and refresh retains the existing aura's order and cadence. Stagger and Cushion show the two listener forms; Ward and Swig share `aura-damage.js` `absorbAura`. Declaring `on.absorb` also opts a status into shield spent cleanup and waste accounting; no separate flag is needed.
