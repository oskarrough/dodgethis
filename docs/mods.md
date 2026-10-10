# Mods: the folder contract

Heroes, abilities, maps and pieces live in folders that the game finds by convention (issue #26). No hand-kept list: add a folder, run `bun run registry`, it loads. `mod.json`, load order, merge rules, `?mods=` and the URL loader come later, when a second author exists. Paths are under `src/plugins/moba/`. Nothing here touches core: these are moba plugin files, and the contract in `plugin-architecture.md` holds unchanged.

## Folders

```
abilities/<id>/  index.js  tune.js
heroes/<id>/     index.js  tune.js  costume.js  numbers.js
maps/<id>/       index.js  tune.js  layout.js   ground.js  scenery.js
pieces/<id>/     index.js
```

- The folder name is the id. `index.js` default-exports one plain object, the manifest. It is sim code (the headless sim and server load it), so it never imports Three.js, the DOM or a view file. `costume.js` and `numbers.js` are view files, listed in a view registry only `hero-view.js` and `front/` import; `tune.js` is listed in the tune registry. Other files are optional helpers `index.js` imports.
- `tune.js` is pure data and imports nothing. It exists because `tune.js` (the root) must assemble every folder's numbers without importing behaviour: ability hooks and card text import `tune`, so one entry file would make a cycle.
- Art stays in `public/` by name, because Vite serves `public/` untouched: `public/splash/<map>-<width>.webp` (already there), `public/heroes/<id>.webp` when hero art exists. Missing art falls back (chalk plan for maps, the silhouette for heroes).

## Abilities

Always top level; heroes name them by id. A manifest holds data and hooks into the shared path (`casting.js` release, `targeting.js` aim assist, `skillshot.js` and `projectiles.js` flight and zones). It never steps projectiles or zones itself.

- `kind`: `shot`, `zone`, `dash`, `stance`, `channel` or `melee`. Casting branches on it; a new kind is an engine change, not a mod.
- Flags casting and flight already read: `pierce`, `heal`, `catchable`, `aimAssist`, `returnsPocket`, `catchesShots`, `acceptBall`, `root`, `cancelOnMove`.
- `tell` and `held` (`line`, `circle`, `arrow`, `cone`) pick the telegraph; its size comes from the ability's tune (`range`, `radius`, `angle`). `effects { cast, projectile, hit, impact, effect, pose }` name cues from the shared vocabulary in `look.js` and `feedback.js`; a new cue is engine work, like a new sound.
- `card: { summary(), notes() }` replaces `tooltip.js` `SUMMARY` and `NOTES`. Default: the kind's line and no notes. `icon` is the slot's SVG markup (default: an empty slot). `look` holds an ability's own telegraph look (Catch's fan).
- Hooks, all optional, each called with `traitContext(hero, { ability, … })`: `onStart` (stance, channel), `onRelease`, `onTick`, `onEnd`, `onCancel`, `onDashEnd`. A hook reads `ability.stats`, never `tune.<id>`. Every call site passes the ability object. A cast that ends any way but its release (input, swap, death, Ball pickup) goes through `endCast` in `casting.js`: `onCancel` fires, then the cast clears. A stance cut short (swap, death, respawn) fires `onEnd` through `endStance`; a channel fires `onCancel` through `cancelChannel`. Hooks always run before the state is gone.
- `bounce` lives in the ability's tune, not the manifest: `bounce: { max, damagePerCushion }` on a `shot` reflects off any cover or map edge that would end it (towers and cores still take the hit), adds `damagePerCushion` per cushion and ends on the contact after `max`. Range counts along the whole path. Default `false`; the manifest-level `bounce: false` on Loose and Toss is ignored. The shot carries `cushions` (snapshot and lane replica too) and each cushion emits a `cushion` fact. A caught shot keeps its banked damage and comes back with `bounce: false`. Shared numbers sit in `tune.projectile` (`cushionGap`). A board to bounce off (Backboard) adds to the cover `stepShot` sweeps.
- `tune.js` default-exports the numbers; the registry adds a `stats` getter returning `tune[id]`.

Rain on paper: `{ kind: 'zone', heal: false, tell: 'circle', held: 'circle', effects: { impact: 'rain', effect: 'rain', pose: 'rain' } }`, tune `{ damage, castPoint, range, radius, delay, slow, duration, cooldown }`, no hooks. Release pushes a zone with `ability: 'rain'`; the zone step reads `abilityOf(zone.ability).stats` instead of `tune[zone.ability ?? 'rain']`; the circle tell sizes from `stats.radius`. Nothing copied.

Toss on paper: `{ kind: 'shot', catchable: true, returnsPocket: true, aimAssist: true, tell: 'line', held: 'line', effects }`, tune `{ damage, castPoint, range, speed, radius, cooldown }`, card notes reading `tune.catching.pocketLife`, no hooks. With a pocket, casting sees `returnsPocket` and calls `throwCaught`; without one, release calls `launchShot`. Both are engine code it only flags. Nothing copied.

## Catching stays core

Any hero may catch: an ability opens a window with `sim.openCatch(hero, window)`, as Catch and Dive already do. A catch window intercepts every shot and the Ball inside the flight step and changes damage in `combat.js`; as an ability hook it would sit in the hottest loop and every other shot would depend on Mitts. `openCatch`, the pocket, the bag, the `return` pseudo-ability and `tune.catching` stay engine. Mitts only tunes it through his abilities. `combat.js` stops testing `ability === 'catch'` and reads `abilityOf(window.ability).stats.damageReduction ?? 0` (Dive's window has none); the stance check stays.

Per-hero state: `abilityState` stays the slot, plain JSON. Engine keys sit at the top, a manifest's own state under its id: `freshAbilityState(definition)` returns `{ pocket: null, bag: [] }` plus `[id]: state()` for the hero and each kit ability that has `state`. The registry rejects `pocket` and `bag` as ids. Snapshots already `structuredClone` it and `lobby-replica.js` copies it whole. `lane-replica.js` sends `null` whenever pocket and bag are empty (`:140`) and rebuilds with a bare `freshAbilityState()` (`:446`), which would wipe hero state on clients: both ends deep-compare against `freshAbilityState(heroDefinition(heroId))`.

## Heroes

```js
export default {
	kit: { slot1: 'loose', slot2: 'rain', slot3: 'vault' }, // ability ids, slot1–slot4; missing slots are null
	basic: 'gloveSlap', // ability id → { ...ability, ...tune[id] }; default { ...tune.attack, range: tune.orders.attackRange }
	name: 'Fletcher', // default: the id, title-cased
	order: 1, // strip, stands and default hero sort by order, then id; default 100
	draft: true, // hidden from lists unless ?hero= or ?debug names it; default false
}
```

Also optional: `silhouette` (`look.silhouettes` shape, default `circle`), `color` (a `--ui-*` token name such as `blue` or `red`, not a hex value; the lobby stamp's `--hero-color`, default cream), `icon` (SVG markup for the HUD and strip; default is the generic face for its silhouette: `circle`, `square`, `triangle` or `bar`, keyed in `hud.js` `ICONS`), `returnPose`, `state()`, `traits { onHit, onCatch, onDeath, onTick }`, `trait()` (the portrait chip and card, was `tooltip.js` `TRAITS`). `costume.js` exports `dress({ costume, torso, footDisc, discY, part, own, rounded, roots, t, look, materials })` (the team colour is `materials.team`; there is no `team` argument) and optional `animate(unit, rig, …)` (Mitts's glove poses). `dress` returns the rig the poses read: `{ glove, pocketRing, bow, hand, bowString, drawArm, border, releases }`, all optional; `hero-view.js` reads `dress(…) ?? {}`. Without a costume the generic body dresses the hero. Proportions still live in the shared `look.silhouettes` (`caromRadius`, the `mitts*` and `quiver*` keys), so a hero folder does not own them yet. The lobby strip prints the hero's `id` by design (lettering), not its `name`. `numbers.js` exports extra numbers-panel cards (Fletcher's Flight & dodging, Planned Volley). `tune.js` lands at `tune.heroes[id]`; stats are `{ ...tune.hero, ...tune.heroes[id] }`, read live: a hero without a tune shares `tune.hero` itself, one with a tune reads through a view that falls back to `tune.hero` key by key, so the Hero sliders reach existing bodies.

The registry builds today's definition shape from the manifest: `kit` becomes `abilities: { slot1…slot4 }` of ability objects, `basic` a getter, `base` a getter (`heroes.js:85-139`); every reader of `definition.abilities[slot]` stays as is.

A folder with only `kit` loads and plays. `playable` (at least one ability resolves) keeps meaning "may play", drafts included: every validator reads it (`setup.js`, `lobby-state.js`, `sim.js:418,676`, `index.js:746,838`, `lobby.js:744`, `lobby-replica.js`, `lane-replica.js`, `agent-match.js`, `scripts/farm.js:411`). `listed` is playable and not a draft, and never depends on the URL. Random seats (`bots.js:40`, `scripts/farm.js:75`) and `DEFAULT_HERO` (the first listed: Fletcher, by `order`) use `listed` in registry order, so a draft never enters a seeded roster. `listedHeroes(setup)` feeds the UI lists (strip, stands, H-cycle, debug dropdowns): listed heroes plus a draft when `?hero=` names it or `?debug` is on.

## Discovery and tune paths

Generated registries, not globs: `import.meta.glob` is Vite-only, and a Bun branch would put a top-level `await` in `tune.js` (imported by 66 files) and in both `heroes.js` and `ability.js`, which import each other once kits resolve ids. A top-level await in a cycle deadlocks or hands out uninitialised bindings. Instead `scripts/registry.js` (`bun run registry`) writes one plain file per kind with static imports sorted by id: `abilities/index.js`, `heroes/index.js`, `maps/index.js`, `pieces/index.js`; `tunes.js` (every folder `tune.js`, for root `tune.js`); `heroes/views.js` (`costume.js`, `numbers.js`). A test fails when a folder is missing from its file. No await, one path, greppable. Generated import names carry a kind prefix (`abilities_catch`), so an id may be a reserved word (`catch`).

- `heroes.js` keeps its exports (`HEROES`, `heroDefinition`, `freshAbilityState`) and adds `DEFAULT_HERO`, `listed` and `listedHeroes(setup)`; it reads `heroes/index.js` and resolves kit ids against `ABILITIES`. `HEROES` keeps Fletcher before Mitts (seeded random seats index into it).
- `ability.js` reads `abilities/index.js` into `ABILITIES` and stops importing `heroes.js`; `abilityOf(id, unit)` checks the unit, then one map lookup. Until Mitts moves, `heroes.js` registers its inline abilities into `ABILITIES` (`registerAbility`).
- Root `tune.js` imports `tunes.js`: abilities spread to `tune[id]`, heroes to `tune.heroes[id]`, maps spread their keys at the top level (`map`, `overthrowTerrain`, `flagfall`). Every `tune.loose`, `tune.rain`, `tune.flagfall.dunk` path keeps working.
- An ability or hero id that collides with another top-level tune key (`tower`, `laser`, `catching`) throws, like a keyed registration; `scripts/farm.js:106` resolves `--set x.y` in `tune` before `tune.heroes`.
- Shared projectile numbers leave Loose: `tune.projectile = { height, nearMiss }`. Readers of `tune.loose.height` (`projectiles.js`, `combat.js`, `view.js`) and `tune.loose.nearMiss` (`feedback.js`) switch. `combat.js:196` drops its `tune.loose.damage` fallback for the ability's own `stats.damage`. Callers that really mean Loose keep `tune.loose`: dummies' practice shot (`control.js`), `scripted.js`.
- `sliders.js` derives `Abilities` from `ABILITIES` (Mitts's tunes gain sliders) and `Terrain` from each map's `debugTune.name`.

## Maps and pieces

`pieces/<id>/index.js` is today's `match.js` object (`lane`, `create`, `view`, `botHabit`, `obstacles`, `controllers`, `stats`, `structures`, `waves`, `camps`, `minimap`, `population`). Shared engines stay put (`lane.js`, `ball.js`, `bots.js`); Flagfall-only files move in (`flag*.js` to `pieces/flag/`, `camp*.js` to `pieces/camps/`).

A map manifest: `{ name, kind, late, layout, pieces: ['structures', 'minions', 'ball', 'bots'], palette, debugTune, online, ground, scenery }`. `kind` is `lane`, `garden` or `lobby` and is declared, not inferred from `settings.lane`. `ground(scope)` (Flagfall's `buildFlagfall`, out of `map.js`) and `scenery(isle)` (Flagfall's moon, garden and specks, out of `isle.js`) are optional. After: `map.js` calls `recipe.ground?.(scope) ?? buildLane(scope)`, lobby still by kind; `isle.js` keeps the shared cliff, sea and haze and calls `recipe.scenery?.(isle)`. `front/tune.js`, `front/lobby-tune.js` and `front/clouds.js` already key by map id with an Overthrow fallback, so they stay. The lobby becomes `maps/lobby/` with `kind: 'lobby'`, and `playableMaps` filters on kind instead of the id.

Flagfall code that stays outside `maps/`: the dunk in `combat.js` and `fight-bots.js` slick (rules for any layout with fence gaps, gated by the layout, not the map id); gate kinds in `gates.js` and `lane-bots.js` (structure kinds, any map may place them); `match-terrain.js`'s cache key (a shader variant).

## Ids

Bare ids (`loose`, `fletcher`, `flagfall`), one author. The folder name, the manifest id and the tune key are the same string. When mods arrive: ids become `<mod>/<id>`, ability tune moves to `tune.abilities[id]` with the `tune.<id>` aliases removed, and the mod list joins the replay hash.

## Consumers, before and after

- `heroes.js`: hand-written table and Carom/Skip generator → generated registry; Carom's half-built costume and both tunes move to `heroes/{carom,skip}/` without `index.js`, so they are not heroes yet (their tunes still reach `tune.heroes` through `tunes.js`).
- `ability.js`: scan of `HEROES` → `ABILITIES[id]`; `return` stays.
- `sim.js`, `casting.js`, `control.js`, `orders.js`, `combat.js` reset, `setup.js`, `lobby-state.js`, `lobby-replica.js`, `lane-replica.js`, `index.js`, `feedback.js`, `skills-view.js`, `hud.js` unit frame, `tests/moba-setup.test.js`: same exports, unchanged; defaults use `DEFAULT_HERO`.
- `lobby.js`, `lobby-heroes.js`, `lobby-props.js`, `debug.js`: playable filter → `listedHeroes(setup)`.
- `bots.js:40`, `scripts/farm.js:75`: random pool → `listed`. The lineup literal `['mitts', 'fletcher', random]` (`bots.js:54`) stays; sorting by `order` would swap the seats.
- `agent-match.js`: `Object.hasOwn(HEROES)` unchanged. `agents.js:305-316`: the `'loose'` aim check → any `shot` or `zone` checks its own `stats`.
- `dodge-bots.js:55`, `projectiles.js:47`, `skills-view.js:104,132,235`: `tune[… ?? 'rain']`, `tune.vault` → `abilityOf(id).stats`.
- `hero-view.js`: `heroId ===` branches → a costume lookup, `heroes/views.js` first, then the inline table until the heroes move; the box body otherwise. Glove and bow poses still key on the rig the costume returns; `animate` comes with step 3.
- `tooltip.js` `SUMMARY`, `NOTES`, `TRAITS` → `ability.card`, `definition.trait`; `abilityName` → `ability.name ?? title(id)`.
- `hud.js` `ICONS[heroId]` → `definition.icon`; trait icons such as `pocket`, `momentum` stay in `ICONS`.
- `front/numbers.js`, `front/stats.js`: Fletcher branches → generic `heroStats` plus a numbers lookup (`heroes/views.js` `numbers.cards()`, then the inline table).
- `lobby.css:29,33` per-hero stamp selectors → `--hero-color` set from `definition.color`. `.front-distant-fletcher` stays: it names a splash drawing, not a hero lookup.
- `look.js`: only the catch fan went to `abilities/catch` `look`; the pocket ring and glove-pose numbers went to `heroes/mitts/costume.js`; body sizes stay in `look.silhouettes`; `abilityView` stays shared.
- `maps/index.js`: hand-written `maps` → generated registry, same exports; `obstacles.js` and `maps/lobby/` import `maps/overthrow/layout.js`.
- `map.js:353,410`, `isle.js:456-582`: inferred Flagfall → `kind`, `ground`, `scenery`.

## Hazards left alone

- Online lobby picks travel as a stand index, not a hero id (`lobby-heroes.js`, `lobby-replica.js`). A draft shown on one peer's strip shifts that peer's stands and the two games disagree about the pick. Step 5 must send the hero id, or hide drafts in online lobbies.
  `tune` is one mutable module object, and `sim.js:53` and `index.js:101` write `tune.match.late` per match. Harmless while maps only differ in `late`; per-match mod merging would leak between matches and peers, so `tune` becomes a per-match value before mods load.

## Order of work

Each step is one brief, run in sequence; the files listed are the step's own. Proof for every behaviour-preserving step: `bun run simulate --heroes mixed --matches 2 --seed 7` (add `--map flagfall` where maps move) before and after; each `<match>.tape.json` `result.hash` (`replayHash` of the final snapshot, `agent-match.js:180`) must match. `--summary` writes no tape, so it can't prove this. `tune_hash` (`replayHash(tune)`) changes whenever a tune key moves; replay never checks it, so that is harmless. Plus `bun test` green.

1. Registries and lookups, nothing moves (a1). Owns `scripts/registry.js`, the generated files (empty kinds allowed; `maps/index.js` stays hand-written until step 6), `heroes.js` (`listed`, `listedHeroes`, `DEFAULT_HERO`, manifest-to-definition builder, `freshAbilityState(definition)`), `ability.js`, `tune.js` (`tunes.js`, `tune.projectile`), the `DEFAULT_HERO` files, the `tune.projectile` and zone readers, `combat.js` catch read, hook call sites in `sim.js`, `casting.js`, `control.js`, `lane-replica.js`, the list consumers (`lobby.js`, `lobby-heroes.js`, `lobby-props.js`, `debug.js`, `bots.js`, `scripts/farm.js`), and the lookup changes in `hero-view.js`, `tooltip.js`, `hud.js`, `front/numbers.js`, `front/stats.js`, `lobby.css`, `sliders.js`, `agents.js`. Same tape hash.
2. Fletcher into folders (a2). Owns `abilities/{loose,rain,vault}/`, `heroes/fletcher/`, `heroes/{carom,skip}/` (costume and tune only), `fletcher-tune.js` (deleted), Fletcher's lines in `heroes.js`, `tune.js` and the files step 1 taught to read definitions. Mitts stays inline. Same tape hash.
3. Mitts into folders. Owns `heroes/mitts/`, `abilities/{toss,catch,dive,gloveSlap}/`, `mitts-tune.js` (deleted), and Mitts's lines in `heroes.js`, `ability.js` (the inline fallback goes), `hero-view.js`, `tooltip.js`, `hud.js`, `lobby.css`, `look.js`, `combat.js`. Same tape hash.
4. Bounce in the shared skillshot path (b1). Owns `projectiles.js`, `skillshot.js`, the `bounce` copy in `casting.js`, and its tune under `tune.projectile`. An engine brief: Loose and Toss keep `bounce: false`, so same tape hash. Done 2026-10-11: `skillshot.js` `cushion` reflects off `obstacles.js` `contactNormal`. Left open: guests lerp a projectile between snapshots, so across a cushion they cut the corner (`lobby-replica.js`; when `cushions` differs, turn at the crossing of the two rays).
5. Carom by folders alone (b2): `heroes/carom/index.js`, `draft: true`, `abilities/bank/` using `bounce` as data, `abilities/kickOff/` as a plain dash. Proof, headless: `?hero=carom` puts Carom on the lobby strip (`dt.screen()` is `lobby`, the roster lists Carom), a bots match with Carom in it ends (`bun run simulate --summary --lineup carom,fletcher,mitts --matches 1`), and `--heroes mixed` tape hashes are unchanged (drafts stay out of random seats).
6. Flagfall and pieces. Owns `pieces/`, `match.js` (deleted), `flag*.js`, `camp*.js`, `maps/flagfall/`, `maps/index.js` (generated; Overthrow and the lobby stay hand-imported there until step 7), `map.js`, `isle.js`. Same tape hash with `--map flagfall`.
7. Overthrow and the lobby. Owns `maps/overthrow/`, `maps/lobby/`, the loose `maps/*.js` files, `obstacles.js`, `sliders.js` terrain list. Same tape hash on both maps.

## Decided after review (2026-10-11)

- The pocket's team colour is engine catch code, not Mitts's `onCatch` trait: the pocket wears the caught shot's team, whoever caught it. Landed with step 3.
- Costumes and numbers go through a generated view registry so a hero folder ships its look; the sim never imports it.
- The bot lineup stays the literal `['mitts', 'fletcher']` until a third listed hero exists, then becomes `tune.bots.lineup`.
