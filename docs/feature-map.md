# Feature map

Every player-facing feature, grouped by screen, one line each: the feature in plain words, then its files and entry symbols, its `tune.js` key and its doc. Use `bun run where <word>` (or a quoted phrase such as `"lane split"`) for matching entries and source locations, then read only the relevant code range. Output is bounded; `--all` prints every match.

Don't read big files whole. `ast-grep outline <file>` lists a file's symbols with line numbers; `ast-grep run -p '<pattern>' -l js src` finds structure (callers, `tune.x.y` uses). Whoever adds or moves a feature updates its line here. To prove a feature in the running game, use `docs/verify.md`.

Paths are under `src/modes/moba/` unless they start with `src/`. `tune.js` means `src/modes/moba/tune.js` (key in backticks); other tune files are named in full. `tune.js` keeps the match rules and assembles the rest, so every `tune.x.y` path is unchanged but the values live elsewhere: `map` and `overthrowTerrain` in `maps/overthrow/overthrow-tune.js`, `flagfall` in `maps/flagfall/flagfall-tune.js`, `lobby` in `front/lobby-tune.js`, every ability's numbers (`loose`, `rain`, `vault`, `toss`, `catch`, `dive`, `gloveSlap`, `bank`, `cushion`, `swap`) in `abilities/<id>/<id>-tune.js`, heroes' (`heroes.kappa`, `heroes.carambola`, `heroes.mandador`) in `heroes/<id>/<id>-tune.js`. Docs live in `docs/`.

## Shell and splash

- Splash with map tiles (Overthrow, Flagfall), their illustrations in `public/splash/`: `front/index.js` `mobaFront`; `front/backdrop.js` `createBackdrop`; `front/tune.js` `tile`, `title`, `dusk`; `moba.md`
- Card skin for the splash cards and the lobby hero strip (default `painted`; `wash`, `ink`, `stone` via `?skin=`): `front/skin.js` `applySkin`, `paintedCard`; `front/skin.css` (`.skin-card`, `.skin-sheet`, `.skin-title`); art in `public/splash/`; `front/tune.js` `skin`
- Dodgeball bonus tag under the tiles: `front/index.js` (`bonus` const, `.front-bonus`); `moba.md`, `roadmap.md`
- Splash keyboard and pad focus, deny shake, back button: `front/controls.js` `createControls`; `front/tune.js` `deny`, `back`, `move`, `enter`
- Stickers, mute button, corner row, online panel, shell CSS: `index.html`; `src/core/browser.js` `createBrowserApp`
- Boot error screen: `src/core/browser.js` `reportBootError`
- Mode registration, `window.game.moba`: `index.js` `moba` (default export); `src/core/app.js` `createApp`; `extending.md`
- Match setup from the URL (`?mode=moba&play&bots=&hero=&seed=&debug`): `setup.js` `parseMatchSetup`, `wantsDirectPlay`, `matchLink`; `verify.md`
- Address bar follows the screen (URL per screen, Back/Forward, reload lands there): `src/address.js` `followScreen`, `addressFor`; boot routing is `main.js` `route`
- Which screen is up (splash, lobby, descent, match, paused, result): `src/core/proof.js` `createProofApi` (`dt.screen()`); `verify.md`
- Portal, a glittering tear that shows another scene or another spot live through it (open, collapse, crossing, light spill), for transitions and recall: `src/core/portal.js` `createPortal`; playground `pages/2026-10-20-portal-test/`

## Lobby

- Lobby screen, the portal lobby (walk the terracotta floor, pick a hero from the seat strips, ready by walking into the portal, back): `portal-lobby.js` `createPortalLobby`; `lobby-handoff.js` `validLobbyHandoff`; `portal-lobby.css`, `lobby.css`; `tune.js` `lobby.portal`; `moba.md`
- The portal and its far view of the next map, captioned with the map name and the waiting or countdown status: `src/core/portal.js` `createPortal`; `portal-far.js` `createPortalFar`; `portal-lobby.js` `placeCaption`
- Lobby floor, terracotta flagstones ringed by oxide-red terrero stands (`?ground=saucer` shows the old saucer), with a solid rim for bodies, shots and held Ricochet previews: `lobby-floor.js` `createLobbyFloor`, `saucerExtent`; `maps/lobby/lobby-layout.js` `lobbyLayout`, `lobbyRimCover`; `obstacles.js` `buildColliders`, `sweepObstacles`; `front/lobby-tune.js` `floor.style`, `grounds`
- Seats, roster, ready state (1 s fill; stepping out cancels): `lobby-state.js` `createReadySeats`; `tune.js` `lobby.ready`
- Back and Play online, the top-left row in both modes' lobbies: `src/core/corner-nav.js` `createCornerNav`; `index.html` `.corner-nav`; used by `portal-lobby.js` and `src/modes/dodgeball/index.js`
- Difficulty gallery, three standees you shoot to pick: `lobby-props.js` `createDifficultyGallery`; `tune.js` `lobby.gallery`
- Lobby practice dummies (players can't hit each other): `dummy-view.js` `dressDummy`; mechanic `mechanics/dummies/` (dressed through `mechanics/dummies/dummies-view.js`); `tune.js` `dummies`, `lobby.practice`; `look.js` `dummyView`
- Lobby sounds: seat enter, ready, cancel, pick, bot add and remove, hero popover open and close, back, difficulty pick (`lobby.*`, `ui.menuOpen`, `ui.menuClose`): `sound-table.js`; `portal-lobby.js`
- Every button clicks: a click whose handler played nothing gets `ui.confirm`; `data-quiet` opts a button out: `audio.js` `clickSounds`
- Lobby sim replica for online: `lobby-replica.js` `createLobbyReplica`, `createUnitReplica`; `network.md`
- Online "someone joined" notice: `tune.js` `lobby.onlineNotice`

## Descent

- Crane descent from lobby to match (no skip): `front/descent.js` `startLoading`; `front/descent-state.js` `createDescentState`, `descentFrame`; `front/tune.js` `loading`; `moba.md`
- Cloud reveal (cloud rolls in on the crane, parts around your hero): `front/clouds.js` `createClouds`; `front/descent.js` `veilFrame`; `front/tune.js` `loading.clouds`
- Descent camera projection and pointer easing: `front/backdrop.js` `projectFrame`, `easePointer`
- Splash plate (day into night), mist drift, parallax, dusk wash on the splash and descent: `front/backdrop.js` `createBackdrop`, `easeShot`; `public/splash/plate-*.webp`; `front/tune.js` `plate`, `mist`, `parallax`, `shot`, `dusk`
- Volley on the splash (balls flying behind the title): `front/backdrop.js`; `front/tune.js` `volley`

## Match: camera, controls, cursor

- Follow camera, one fixed lens on every map, and edge reserve: `follow.js` `createFollow`, `stepCamera`, `clampView`, `viewFootprint`; `tune.js` `follow` (`fov`, `rimShow` clamps how far it pans past the rims). Non-finite follow/focus/kick inputs keep the last good view and warn once; core `render.js` also rejects non-finite frames/kicks and zero-sized resizes.
- Camera controls (lock, pan, zoom): `camera-controls.js` `createCameraControls`; `tune.js` `follow`
- Right-click move and attack-move orders: `orders.js` `issue`, `steer`, `move`, `attackAhead`; `src/core/intents.js` `pointClick`, `createIntents`; `tune.js` `orders`
- Control presets (MOBA, WASD, keyboard only; the top-right controls tile and the pause menu cycle them, WASD under MOBA in the lobby offers the switch once, the pad ignores them) and their hotkey labels: `src/core/intents.js` `PRESETS`, `presetKeys`, `pointClick`; `src/core/controls.js` `cyclePreset`, `setPreset`, `onPreset`; `src/core/browser.js` `renderPreset`; `menu.js` `nextPreset`; `lobby-controls.js` `createLobbyControls`
- Pad stick aim: `targeting.js` `stickAim`; `src/core/intents.js` `stickVector`; `tune.js` `stickAim`
- Keyboard and gamepad reading (held presses across a screen change are ignored until released): `src/core/input.js` `moveVector`, `pollGamepad`, `consumeKeys`, `rumble`; `src/core/intents.js` `readIntent`
- Cursor (move and attack icons): `cursor.js` `createCursor`; `cursors/move.svg`, `cursors/attack.svg`
- Pathfinding around walls: `path.js` `createPathPlanner`, `pursue`; `orders.js` `plan`, `offPath`; `tune.js` `orders`

## Match: HUD

### Frame and bars

- HUD (portrait, ability slots, cooldown rings, level, health): `hud.js` `createHud`, `matchFrame`; `hud.css`; `tune.js` `hud`; `moba.md`
- Top bar (one cream pill: a hero face per player on each side, greyed with respawn seconds when down, health bars under your own side only, takedowns, clock, the Ball countdown; fixed width; the win condition stays visible beneath it): `hud.js` `createHud` (`moba-top`, `moba-objective`); `hud.css` Top bar
- Ability slot keys (Q, W, E and pad RB, RT, LB): `hud.js` `KEYS`, `SLOTS`
- Health bars over units: `health-bars.js` `createHealthBars`; `health-bars.css`; `look.js` `healthBars`

### Tooltips and inspect

- Inspect mode (hold I or pad button, hover to read cards): `hud.js` `KEY_INSPECT`, `PAD_INSPECT`, `pickUnit`
- Tooltips and unit cards (hero, tower, minion, Ball, level, kills, clock): `tooltip.js` `createTooltip`, `heroCard`, `abilityCard`, `structureCard`, `minionCard`, `ballCard`, `levelCard`, `killsCard`, `clockCard`; `hud.js` `cardFor`, `updateTip`. Ability `card.summary`/`card.notes` and hero trait text are checked templates: `tooltip.js` `renderCardTemplate`, `formatCardValue` resolves local `{radius}` or root `{catching.pocketLife}` tune references through declared units; hp prose may use `{damage:damage}` or `{hp:HP}`. `scripts/check-moba-effects.js` rejects unresolved tokens. `bun run kit` (`scripts/kit.js`) prints all registered heroes' basic attacks, slots and traits with live units
- Match clock (its card carries the next wave and the Ball): `tooltip.js` `clock`, `clockCard`; `hud.js`

### Over the world

- Damage numbers: `damage-numbers.js` `createDamageNumbers`; `look.js` `damageNumbers`
- Edge pips for off-screen allies, enemies, Ball: `pips.js` `edgePip`, `createPips`; `look.js` `pips`
- Minimap, its camera-view outline and click/drag to move the camera: `minimap.js` `createMinimap` (`drawView`, `onFocus` → `follow.focus`); `maps/all-maps.js` `matchRecipe`; `hud.js`; `hud.css` `.moba-minimap`
- Fog of war (on by default, `?fog=0` turns it off; sight, hidden enemies, haze over unseen ground in the map's shade and sky colours, drifting soft rim, sight growing in and shrinking out): `fog.js` `createFog` (mask canvas plus its haze shader); match rules and look `tune.js` `fog`; hooked in `index.js` present (passes the map palette); minimap filtering in `minimap.js`; CPU proof: `docs/verify.md` Browser proofs (the dodgeball `benchmark()` cannot time MOBA)
- Onboarding cues (floor arrow, hero ring, You sticker, Ball and goal pointer): `onboarding.js` `createOnboarding`; `look.js` `onboarding`
- Dead-world grey-out and respawn timer: `recap.js` `createRecap` (`moba-dead-world`); `combat.js` `respawn`; `tune.js` `respawn`

### Panels and logs

- Game log and feed (fact → sentence for the local player; the feed drum mid-right shows kills, wipes, structures, goals and Ball calls): `game-log.js` `createGameLog`, `FEED`; `feedback.js` `log.record`; `hud.js` `feed`; `hud.css` `.moba-feed`; `tune.js` `hud.feedLife`, `feedLines`
- Scoreboard (Tab or pad Select, live table mid-match): `recap.js` `createRecap` (the `board` aside, class `moba-scoreboard`); `match-stats.js` `createMatchStats`
- Pause menu (Esc, pad Start, or the top-left menu tile): `menu.js` `createMatchMenu`, `openMenu`, the manual page `pausePage` (Quick cast as a checkbox under the actions), Leave game to the splash `quit`; tile from `src/core/corner-nav.js`; `menu.css`; `tune.js` `hud`
- Combat log: `src/core/debug.js` `createCombatLog`
- Damage meter (bottom-left card, M toggles; damage done, healing done, damage taken and deaths per hero; segments for each fight, each dungeon encounter and the whole match; click a row for its abilities or sources): folder `meter/` (`meter.js` `createMeter`, the fact ledger; `meter-view.js` `createMeterView`; `meter.css`); `encounter` start/end facts from `mechanics/dungeon/dungeon-run.js` `announce`; hooked in `index.js`

### Flagfall

- Flagfall mercenary camps (neutral guards at the camp marks fight back and leash; clearing one sends mercs down the nearest lane; respawn; bots clear them when their lane is quiet): `mechanics/camps/camps-objective.js` `createCamps`, bots `mechanics/camps/camps-bots.js` `campBots` (`escort` phase); mechanic `mechanics/camps/`, on in `maps/flagfall/flagfall.js` `mechanics`; `layout.camps` in `maps/flagfall/flagfall-layout.js`; `tune.js` `camps`; lane hooks `passive`, team `'N'`, `route` in `lane.js`
- Flagfall jungle (rooms, spine walls, brush, camp/flag/gatehouse marks): `maps/flagfall/flagfall-layout.js` `flagfallLayout`; `tune.js` `flagfall.jungle`; marks and brush mats in `maps/flagfall/flagfall-view.js` `ground`
- Flagfall gates, two kinds on one mechanic (own team passes, enemies are held out and siege it, shots hit it): the gatehouse, a no-gun stone tower at the fort's chalk bar that the fort waits for (rubble when it falls), and the laser gate, two posts and a hologram beam between fort and core that waits for the fort and that the core waits for (stubs when it falls): `gates.js` `addGates`, `holdGates`, `GATES`; `tune.js` `gatehouse`, `laser`, `flagfall.jungle.gatehouseX`/`laserX`; laser look in `lane-view.js` `makeBody` (`look.laneView.laser`), beam shader shared with the lobby holograms in `hologram.js`; hooked in `maps/flagfall/flagfall-layout.js`, `sim.js` step, `mechanics/structures/structures.js` obstacles (`obstacle: false`), `lane.js` (no gun, `tune[kind].xp`)
- Flagfall centre flag (hoist clock, hold the ring, team XP and per-lane silence; HUD line, minimap dot; bots' nearest two go): `mechanics/flag/flag-objective.js` `createFlag`; `mechanics/flag/flag-view.js` `view`; `mechanics/flag/flag-bots.js` `flagBots`; mechanic `mechanics/flag/`; `minimap.js` objectives; `tune.js` `flagfall.flag`, `bots.flagGo`

## Match: heroes and kits

### Kit engine

- Hero, ability, map and mechanic folders (how to add one): `extending.md`
- Hero table and kit definitions: `heroes.js` `heroDefinition`, `HEROES`, `freshAbilityState`; `ability.js` `abilityOf`, `castAbility`; `tune.js` `heroes`, `hero`; `heroes.md`
- Casting, cast points, release, skill press buffer (latest press wins; stop/cancel abort and refund; abilities have no backswing): `casting.js` `casts`, `castWait`, `release`, `cancelChannel`, `stepHeroState`; `tune.js` `cast`
- Basic attack: `combat.js` `basicAttack`; `casting.js` `aimBasic`; `tune.js` `attack`
- Replicated unit statuses (shields, Stagger bank/repayment, strongest-wins slows, stun, freeze, prone, motion and Tag out guard): `statuses.js` `createStatuses`, `statusDefinition`, `statusBar`, `moveSpeed`, `blocked`, `stateUntil`; `ability.js` `effectStatuses` generates Pass/Rain/Tangle slows, Ward shield and Red light freeze from folder `statusEffects` records with tune-key parameters (`scripts/check-moba-effects.js` checks references and units); `statuses.js` resolves tune-key duration/amount/interval fields at application; custom folder `statuses` declarations with `label`, `tags`, `states`, `stack` (default refresh by key/source, opt-in `maxStacks`), `bar`, `on` aura hooks and tick-based `interval`; `sim.apply`, `sim.remove`, `sim.cleanse`. One state gate table owns `move`, `cast`, `shield`, `catch`, `ballPickup` and `still`; frozen blocks Ball pickup like stun, prone still permits catching, Tag out cleanses stun/freeze/slow/motion but not prone. Minions honour the Ball's stun in `lane.js` `units`. Engine declarations `core.stun` and `core.motion` resolve before abilities; `displacement.js` carries motion's host-only path through its endpoint tick, then `on.expire` replans. `reactAuras` dispatches ordered `amplify`, `damage`, `absorb`, `hit`, `damaged`, `cast`, `death` and `tick` hooks; local `on.apply`, `on.remove`, `on.expire` own lifecycle. Amplification precedes damage interception, then shields drain oldest first; `aura-damage.js` `absorbAura` is the shared shield hook. Ability-level `on` maps are innate listeners without replicated records. `sim-snapshot.js`, `lane-replica.js`, `lobby-replica.js` carry the ordered records and stable ids; `packStatuses` omits motion paths. HUD, health bars, hit logs, `scripts/bench/report.js` and Oolong's bot read declaration labels. Pocket/Bag returns still keep damage only, as before; retaining statuses on caught returns belongs to a separate behaviour change.
- Damage and hit resolution: `combat.js` `hit`; `skillshot.js` `stepShot`, `interceptShot`
- Combat facts for fight reports: `combat.js` `heal` (`sim.heal`, an isolated seeded crit stream, overheal; Mend, Pass, Balloon and Sprinkler), `hit` (absorbed damage and periodic status); `statuses.js` `createStatuses` (status on/refresh/off, shield absorption and overwrite/expiry waste); `casting.js` `endCast`, `sim-kit.js` `cancelAttack` (reasoned interruptions); each cast emitter owns its lock and target id; `index.js` `FACTS`. Status and absorb facts stay in match logs and ride `online/link.js` fact envelopes so guests reduce the same fight report. Swig grows one shield instead of per-tick slivers.
- Effects kit (rings, columns, shells, impact recipes): `effects.js` `createEffects`, `createImpacts`; an ability's `impact` recipe in its tune file (Slam, Swing)
- Skillshot shapes and sweeps: `skillshot.js` `stepShot`, `closest`; `obstacles.js` `sweepHit`, `sweepObstacles`; `skills-view.js` `lineReach`, `bouncedLinePath` (held Ricochet preview traces the sim's `stepShot`); `view.js` thin dotted Ricochet path (`look.js` `abilityView.bouncedAimRadius`, `bouncedAimSpacing`)
- Ability telegraphs for enemies (ground line tell): `skills-view.js` `createSkillsView`; `look.js` `abilityView`; `heroes.md`
- Catching and the Pocket (caught shots held and thrown back): `projectiles.js` `openCatch`, `throwCaught`, `resolveInterception` (the pocket takes the caught shot's team); `casting.js` `traitContext`; `tune.js` `catching`, `momentum`
- Hero costumes and silhouettes: `hero-view.js` `dressHero`, costumes in `heroes/<id>/<id>-view.js` (`dress`, optional `animate`); `look.js` `silhouettes`; `look.md`
- Level, XP and stat growth: `tooltip.js` `levelProgress`; `combat.js` `hit`; `tune.js` `levels`
- Globes (health pickups): `lane-rewards.js` `createRewards` (`reward` drops them, `stepGlobes`); `lane-view.js` `createLaneView`; `tune.js` `globes`
- Scripted test hero: `scripted.js` `createScriptedHero`; `tune.js` `scripted`

### Heroes

- Salvia hero, a healer: `heroes/salvia/`; Mend (targeted cast heal through `sim.heal`): `abilities/mend/`; Ward (shield): `abilities/ward/`; `docs/dungeon.md`
- Salvia's aim preview, Mend beam and landing, Ward bubble: `heroes/salvia/salvia-view.js` `extras`; green heal numbers: `damage-numbers.js` `heal`
- Ibis, ranged poke. Q Loose (arrow shot), W Rain (zone), E Vault (dash): `abilities/{loose,vault,rain}/`, `heroes/ibis/`; `heroes.md`
- Kappa, keeper. Q Toss (throw caught shots), W Catch (stance), E Dive (dash): `heroes/kappa/kappa.js`, `abilities/{toss,catch,dive}/`; glove and pocket poses in `heroes/kappa/kappa-view.js` `animate`; Toss/return punch in `feedback.js` (ability `effects.punch`, `toss-tune.js` `feedback`), puffs and sound recipes in `look.js` (uses `toss.shot`, `toss.hit`, `return.shot`, `return.hit` in `sound-table.js`); the catch window's fan in `abilities/catch/catch.js` `look`
- Kappa glove slap (basic): `abilities/gloveSlap/`
- Carambola (id `carambola`, was Carom): `heroes/carambola/` (stone-beaked costume with paddle and back net in `costume.js`, tune, `index.js`), Q Ricochet `abilities/bank/` (bounces, data in its tune; drawn as a cream celluloid ball in `view.js`), W Cushion `abilities/cushion/` (a short wall of posts at the cursor via `sim.addCover`, drawn as one net on two end posts per cast in `skills-view.js`), E Pinball `abilities/pinball/` (targeted enemy serve within `range`; the ball pings from each hit to the nearest unhit enemy within `jumpRange`, `falloff` softer each hop; drawn in `pinball-view.js`). Bots: Pinball's own `bot` (via `ability-bots.js` `abilityTactics`) serves the nearest enemy in range, and `fight-bots.js` walls a target with no cover to bank off. Trick Shot, Kiss's bounce and Backboard are not built; design in `heroes.md`.
- Mandador, captain (id `mandador`, was Skip): `heroes/mandador/` (flat bar and megaphone placeholder); basic `abilities/tennisBall/`, Q `abilities/pass/` (first hero, ally heal or enemy slow), W `abilities/tagOut/` (ally swap and cleanse, temporary damage reduction), E `abilities/redLight/` (freeze moving enemy heroes). Out, not gone: `mandador-cutout.js` reads dead-player intents, walks the touchline and launches `abilities/outThrow/` from inside the wall; hero hits shorten death by two seconds. Costume, cutout and dashed tether: `mandador-view.js`; live bot tactics and thresholds: `abilities/{tagOut,redLight,pass}/` `bot.act`, in save/freeze/heal priority order via `ability-bots.js` `abilityTactics`; dead-player bot: `mandador-bots.js` `mandadorBotDead`, via `botDead` in `bots.js`. Kit numbers and sound recipes live in the folder tune files. R Back in! waits for M5.
- Undine, water support (id `undine`): `heroes/undine/` (squat round jug/spout placeholder); basic `abilities/waterFlick/` (homing), Q `abilities/balloon/` (lob, early pop, splash heal/damage, four-second soaking puddle), W `abilities/sprinkler/` (breakable sweeping heal/soak summon), E `abilities/slide/` (belly slide extended through connected puddles). Soak is a folder status resolved by `statuses.js`; each ability owns its `bot`, sounds and juice; `heroes/undine/undine-bot.js` owns Slide-to-Sprinkler ally saves. `casting.js` dispatches `onRecast` before cooldown gates without resetting cooldown. `summons.js` owns `sim.summon(owner, key, at)`, HP/lifetime/statuses/tick and cleanup on swap, removal and match end (summons outlive owner death); no physics blockers, XP rewards or displacement. `sim-snapshot.js` and `lobby-replica.js` replicate and interpolate the list for both maps. `skills-view.js` discovers ability-folder `extras` through the generated `abilities/all-ability-views.js`, so Balloon and Sprinkler draw in their own folders.
- Oolong, bruiser (id `oolong`): `heroes/oolong/`, palm strike `abilities/palmStrike/`, Q Flying kick `abilities/flyingKick/` (first-unit dash), W Stagger `abilities/stagger/` (deferred pool and even repayment), E Swig `abilities/swig/` (interruptible rooted shield channel). Shield absorption: `aura-damage.js` `absorbAura`, dispatched by `statuses.js` `reactAuras` through `combat.js` `hit`; shield and pool bars: `health-bars.js`; replication: `sim-snapshot.js`, `lane-replica.js`, `lobby-replica.js`. Hero-specific bot decisions and shared burst memory: `heroes/oolong/oolong-bot.js`, dispatched in `bots.js`; Flying kick's `bot: false` opts out of generic dashes.
- Lasso, initiator (id `lasso`): `heroes/lasso/` (crescent and yo-yo placeholder); basic `abilities/yoYoFlick/`, Q `abilities/throw/` (first body, damage and drag; caught returns keep damage only), W `abilities/tangle/` (cone and slow), E `abilities/aroundTheWorld/` (radial hero knockback). Reusable `displacement.js` `createDisplacement`, `stepUnitDisplacement`, `sim.displace` moves heroes/minions over a duration, clips at cover/bounds and cancels cast/channel/dash; `core.motion` statuses carry its host-only path; `sim-snapshot.js` and `lane-replica.js` replicate the status without that path. Bots: clear-line Throw, nearby cone payoff, radial peel against a crowd in `fight-bots.js`; `abilities/tangle/` selects `bot: 'cone'`, `abilities/aroundTheWorld/` selects `bot: 'radial'`.

### Dungeon

- The Warden (the stand-in fight for an encounter without one of its own: threat, Swing, Slam and its bruise, pulls, reset and party bots): `mechanics/dungeon/dungeon-warden.js`, `dungeon-warden-bots.js`, `dungeon-dress.js`; tune at `tune.warden` and `tune.threat`; `abilities/swing/`, `abilities/slam/`; `docs/dungeon.md`. The old round Warden room (`?map=dungeon`) and its after-pull fight report were retired on 2026-10-24; both live in git history
- Altamesa (`?mode=moba&map=altamesa`, old id `hollowMesa` redirected in `setup.js`; a co-op dungeon with mostly placeholder fights): one open plateau with walls, hedges and pillars; layout, packs, waystones and encounters from `maps/altamesa/` (`altamesa-layout.js`, `altamesa-tune.js`); `docs/dungeon.md`
- Enemy packs (hand-placed, team `N`, riding the lane's minion list; they wake together, leash home, heal when calm, stay dead; optional patrol loops): `mechanics/packs/` `packs.js`, `packs-guard.js`; `docs/dungeon.md`
- The dungeon run (several encounters at once through `sim.dungeon` with `encounters`, `run`, `units`, `current`, `engaged`, `bossUnit`; each is its folder's `create` or a Warden stand-in; a won encounter stays won, a wipe resets only its own boss, Gnomon wakes after every other encounter and one whole wing, and its death sets the winner): `mechanics/dungeon/dungeon-run.js`, `dungeon-tune.js`; `docs/dungeon.md`
- Encounters (a mod kind, one folder per Warden: `<id>.js` name, `<id>-tune.js` numbers at `tune.encounters[id]`; passed to `dungeon-warden.js` as `encounter`): `encounters/<id>/`, collected into `encounters/all-encounters.js` by `scripts/collect-mods.js`; `extending.md`
- Waystones (walking within reach attunes one, and the fallen rise at the last you passed; standing there out of a boss fight mends): `mechanics/dungeon/dungeon-run.js` `attune`; `tune.waystone`; drawn by `maps/altamesa/altamesa-view.js`
- Boons (a wing encounter's manifest declares `boon: { id, name, line }`; won, it lands in `sim.dungeon.run.boons` and the last encounter's `bless(boons)` applies them; Gnomon scales `damageTaken` and its blows from `tune.encounters.gnomon.boons`; the goal card lists them): `mechanics/dungeon/dungeon-run.js`, `encounters/gnomon/gnomon-fight.js`, `mechanics/dungeon/dungeon-view.js` `goal`
- Tinaja and Botijo (twin Wardens: kinship halves damage while close via `unit.damageTaken`, the survivor revives its kin at the wheel, pulled and reset together; `encounter.damage` scales a Warden's blows): `encounters/tinajaBotijo/`; `combat.js` incoming damage; `docs/dungeon.md`
- Hourglass (the Glass, Clay and Stone marks in the top bar): `mechanics/dungeon/dungeon-view.js` `timer`; `tune.hourglass`
- Top-bar goal (a line and a card read from any mechanic view's `goal`): `mechanics/dungeon/dungeon-view.js` `goal`; `hud.js`
- Dungeon bots (fight woken packs nearby, else go for the next boss): `mechanics/dungeon/dungeon-bots.js`
- Cast bars (player above the skill bar, boss at the top): `cast-bar.js` `createCastBar`, `cast-bar.css`; `hud.js`
- Dungeon on the splash, using the portal lobby for its party: `front/index.js`; `lobby-state.js`, `lobby-handoff.js`; `bots.js`; `menu.js`

## Match: lane, minions, towers

- Lane: minion waves, towers, fort, core: `lane.js` `createLane` (the step order and the minion and gun brain: targeting, help, leash, attacks, march), `lane-waves.js` (spawns, routes), `lane-structures.js` (`after` vulnerability, deaths, reinforcements), `lane-rewards.js` (XP, levels, kill credit, globes); `mechanics/lane.js` `lane` (drawn by `lane-view.js`, projected by `lane-replica.js`, both wired in `sim.js`), mechanics `mechanics/structures/`, `mechanics/minions/`; `tune.js` `waves`, `minions`, `tower`, `fort`, `core`; `moba.md`
- Wave timing and spawns: `lane-waves.js` `waveInterval`, `createWaves`, `route`; `mechanics/minions/`; `tune.js` `waves`
- Lane bots (the minions' walk and fights under guns): `lane-bots.js` `laneBots`; `maps/paths.js` `laneRoute`
- Lane drawing (minions, towers, fort, core): `lane-view.js` `createLaneView`; `look.js` `laneView`
- Team stamps on the ground: `stamps.js` `createStamps`
- Match end rules (objective, late-game gun damage, winner): `lane.js` `createLane` (phase, gun damage), `lane-structures.js` `structureDown` (winner); `tune.js` `match`; late time in `maps/<id>/<id>-tune.js` (`map.late` for Overthrow, `flagfall.late` for Flagfall), read through the current layout
- Base zone (your own end of the map: untouchable, heal to full in `fullHealSeconds`) and its ground print: `base.js` `inOwnBase`, `healInBase` (from `lane.js` `createLane` `step`); hits shielded in `combat.js` `hit`, enemy statuses refused in `statuses.js` `apply`; `base-view.js` `createBaseView`; `tune.js` `base`
- Recall (B, pad d-pad down): a tear rips open in front of you, stays open a few seconds, and takes you home only if you walk in (sim crossing test, spit out at spawn): `recall.js` `createRecall` (`stepRecall`, `cancelRecall`, `crossing`); entry and spawn tears `recall-view.js` `createRecallView` over `src/core/portal.js`, drawn with `app.renderStyled`; HUD chip `hud.js` `.moba-recall`; `tune.js` `recall`
- Lane replica for online: `lane-replica.js` `createLaneReplica`, `projectLaneSnapshot`; `network.md`

## Match: the Ball

- Ball (neutral objective, carried to score on structures): everything in `mechanics/ball/`: `ball-objective.js` `createBall`, `ball-tune.js` `ball`, top-bar timer and card in `ball-hud.js`, Silence keyword in `ball.js` `terms`; `moba.md`
- Ball throw (Q W E R Z, pad A, or left click while carrying): `mechanics/ball/ball-objective.js` `control`; `src/core/intents.js` `pointClick`; `src/core/controls.js` `throwClick`; `onboarding.js`; `mechanics/ball/ball-hud.js` `timer.card`
- Ball drawing and trail: `mechanics/ball/ball-view.js` `createBallView`; `ball-tune.js` `ballView`
- Ball confetti on pop: `feedback.js` `createFeedback`; `look.js` `ballConfetti`
- Ball bot behaviour (who fetches, who carries): `mechanics/ball/ball-bots.js`; `tune.js` `bots`

## Match: maps and props

- How a map's features plug in: a map's manifest names its `mechanics` by id (`mechanics/<id>/<id>.js`: structures, minions, ball, bots, camps, flag, dummies; generated `mechanics/all-mechanics.js`), `maps/recipes.js` `matchRecipe` resolves them; `sim-mechanics.js` wires them in two passes: `layMechanicGround` (a mechanic's `lane` view, `obstacles`, tower colliders, cover) before any body, `plugMechanics` (the `lane`, camps, each mechanic's `create`) after the heroes; `sim.js` reads `botHabit` and `controllers`. A mechanic's view hooks (`view`, `dress`, `onboarding`) sit in its `<id>-view.js`, listed in generated `mechanics/all-mechanic-views.js`; `index.js` and `sim-mechanics.js` look them up by mechanic id. A map declares `kind` (`lane`, `garden`, `lobby`) and `order`; its `ground` and `scenery` hooks come from `<id>-view.js`, listed in generated `maps/all-map-views.js` and called by `map.js` and `isle.js`. `maps/all-maps.js` is generated too (`bun run collect-mods`). Structures become team-blind obstacles via `obstacles` and Rapier colliders via `sim-mechanics.js` `layMechanicGround`. Bot goal names live in each habit's `botGoals` and must be unique within a map: lane `retreat commitSiege defend siege advance`, ball `urgent objective escort` (Overthrow), camps `escort` and flag `objective` (Flagfall).
- Overthrow (the first map): `maps/overthrow/overthrow-layout.js` `overthrowLayout`; `maps/overthrow/overthrow-view.js` `ground`; `match-terrain.js` `createMatchTerrain`; `tune.js` `overthrowTerrain`, `map`; `moba.md`
- Overthrow by day (cliff, moss lip, rim ink, cloud sea, cloud banks, far spires and arches, waterfalls, haze): `isle.js` `createIsle` (shared cliff, moss lip, rim ink, cloud sea and banks, far spires and arches, haze); waterfalls: `maps/overthrow/overthrow-scenery.js` `scenery`; lane chalk and kerbs: `maps/overthrow/overthrow-view.js` `ground`; shared court moss and printed cast shadows (both maps): `match-terrain.js` `castShadows`; stone cover and pillars: `map.js` `buildMap` (`stoneCover`); stone towers and core: `lane-view.js` (`structureStyle: 'stone'`); the sun: `tune.js` `overthrowTerrain.light`, `core/stylepass.js` `setPalette`
- Flagfall (the second map): `maps/flagfall/flagfall.js` (manifest, `kind: 'garden'`), `maps/flagfall/flagfall-layout.js` `flagfallLayout`, `flagfallLayoutTune`; `maps/flagfall/flagfall-tune.js` (`tune.flagfall`); `moba.md`
- Flagfall by night (the shared isle with night `colors`, `light`, `pool`, `haze`, `clouds`; moon, rim garden of leaf fans and glowing orchid bells, specks): `isle.js` `createIsle`, `maps/flagfall/flagfall-scenery.js` `scenery`; `tune.js` `flagfall`
- Flagfall cover (rim kerb cut at the Dunk gaps, dark-teal leaf-bank hedges, stone walls and drums, lantern posts): `maps/flagfall/flagfall-view.js` `ground`, `map.js` `buildMap`; `tune.js` `flagfall.kerb`, `flagfall.glow`, `flagfall.hedge`
- Flagfall dunk (fence gaps, slick, shove into the sea): `combat.js` `shove`, `dunk`; `maps/flagfall/flagfall-view.js` `ground` (kerb cut, slick print); `feedback.js` `'dunk'`; `core/death.js` `overboard`; bots `fight-bots.js` `slick`, `inland`; `tune.js` `flagfall.gaps`, `flagfall.dunk`, `bots.slick*`
- Flagfall bot rotation across the yard: `lane-bots.js` `advance`; `tune.js` `bots.rotateRange`, `bots.rotateQuiet`
- Flagfall lane split (a human claims the lane they stand in, bots take the others): `bots.js` `createBot` `pickLane`; `tune.js` `bots.laneClaim`
- Map registry and layout recipe: `maps/all-maps.js` `mapLayout`, `matchRecipe`; `tune.js` `map`
- Ground and walls build: `map.js` `buildMap`, `createMapScope`; `match-terrain.js` `createMatchTerrain`
- Colliders and walkable test: `obstacles.js` `buildColliders`, `walkable`, `clampWalkable`, `segmentClear`, `clampMap`
- Look references: `pages/vibes/` (the picked directions), `pages/archive/` (superseded, history only); `look.md`
- Docs pages on the live site (`/pages/…`, same paths as in dev): every `pages/**/*.html` in `vite.config.js` `build.rollupOptions.input`; sibling files and `pages/page.css` copied by the `pages` plugin

## Match: view, feedback, sound

- Match scene root: `view.js` `createView`; `index.js`
- Feedback (facts turn into sound, popups, shake, hit flash): `feedback.js` `createFeedback`; `index.js` `validFact`; folder `<id>-tune.js` `juice.{cast,shot,hit,impact}` overrides legacy `look.js` `juice`; `out`, `squeak` stay shared. Support `contact` facts carry `part` and optional `projectile`/`from`; `juice.contact[part]` overrides `juice[part]` when support and damage need different particles (Pass's healing puff). Only declared folder juice bursts (Tag out has none). Hook's particles and Mandador's support particles live in their ability tune files.
- Sounds: `sound-table.js` `uses`, `facts` (ability uses discovered from manifest `effects` parts); folder `<id>-tune.js` `sound.{cast,shot,hit,impact}` (Hook, Oolong, Mandador); `sounds.js` `createSounds`, `playUse`, `play` (same gain and bus for folder recipes and legacy voices); `look.js` `sounds` (older heroes and shared cues); `src/core/audio.js`, `src/core/music.js`
- Sound board, swaps and kept sounds (audition, swap files into a running game, keep them): `pages/sound/board.js`; `src/core/sound-swap.js` `setSwap`, `swapOf`; `src/core/audio.js` `swapped`, `ui`; `vite.config.js` `soundKeep`; `src/core/sfx/kept.json`
- Mix bus (bus levels, caps, music duck): `src/core/audio.js` `onBus`; `src/core/tune.js` `mix`; `sound-table.js` `BUS`; `sounds.js` `playOwn`
- Sound library and shortlists (`bun run sound:sync` mirrors Dropbox, measures and rebuilds every shortlist): `scripts/sound-library.js` `libraryNumbers`, `writeShortlists`, `decode`; `scripts/sound-check.js` (`--files`, `--shortlist`); `src/core/sound-swap.js` `libraryUrl`, `swapUrl`
- Sound numbers and rule check: `pages/sound/numbers.js` `measure`, `check`; `src/core/audio.js` `render`; `scripts/sound-check.js`
- Screen shake, hit flash, impact: `src/core/juice.js` `createJuice`; `look.js` `juice`
- Hero and dummy death animation: `src/core/death.js` `startDeath`
- Style pass (inked outlines, palette): `src/core/stylepass.js`, `src/core/style.js` `PALETTE`; `look.md`

## Match: bots and agents

- Bots: difficulty, roster, intercept maths: `bots.js` `createBots`, `createBot`, `practiceRoster`, `botRandom`, `interceptTime`; `tune.js` `bots`
- Ability bot tools and folder tactics: `ability-bots.js` `botTactics` (default tool set, named tactic or opt-out), `abilityTactics` (guarded, descending-priority `act(ctx, slot)`), `botClearLine` (Pass and Mandador's dead-player throw); `fight-bots.js` `perceive` keeps the first slot matching each tool; custom acts supplement default tools and receive their kit slot, not a fixed slot name.
- Lane walking bot: `lane-bots.js`; fight bot (who to hit): `fight-bots.js` `createFightBot`; dodge bot: `dodge-bots.js` `createDodgeBot`; Ball bot: `mechanics/ball/ball-bots.js`
- Headless match for simulations: `agent-match.js` `createAgentMatch`, `replayHash`, `readReplay`; `bun run simulate`; `verify.md`
- Agent protocol (observations and actions for LLM or scripted players): `agents.js` `agentRoster`, `observation`, `agentAction`, `createAgentDecisions`; `tune.js` `agents`, `proof`; `verify.md`
- Match replay (record, load, play back): `replay.js` `mobaReplay`, `loadReplay`; `replay.css`; tapes record no map, so replays play on Overthrow only

## Result

- Recap screen (end table, stats, replay shot): `recap.js` `createRecap`; `match-stats.js` `createMatchStats`
- Winner freezes the match and opens the recap: `index.js` `moba` (`sim.lane.match.winner`); `menu.js` `createMatchMenu`

## Debug, Try Mode, proof

- Debug panel and Try Mode folder (lobby and match; match-only actions hidden in lobby): `debug.js` `createMatchDebug`; `setup.js` `parseTrySetup`; `src/core/debug.js` `createDebugPanel`
- Tuner, "Tune" on screen (press `/ Backquote while playing; not only a debug panel): browse or find what this screen can tune, pin values as instruments, click a readout to type, run actions, copy changes as JSON or **share** them as a GitHub tuning issue,`?knobs=a,b`: every number, switch, colour and array number of each `app.debug.tune`section is found by`src/core/registry.js` `createRegistry`(labels from keys, instruments from units,`options.notes`/`units`/`onChange`; `options.featured`names what a Tuner with no pins shows, in players' words: moba`sliders.js` `FEATURED`, Try Mode's game speed, dodgeball `addDebugFolders`); a section builder adds hand-made controls through `src/core/tune-folder.js` `createTuneFolder` (`add`, `addColor`, `addFolder`, choices, buttons); `renderIndex`, `src/core/tuner.js` `createTuner`, `instrument`, `src/core/tuner-share.js` `shareIssue`; controller units select instruments and readout suffixes from `src/core/units.js`; `src/modes/moba/units.js` `resolveUnit`, `unitResolver`declares tune fields and contextual/block defaults;`scripts/check-moba-units.js`enforces numeric coverage in`bun run check`; missing declarations show a `?`knob; a`color`unit is a swatch (click picks, drag shifts hue and lightness). The`style` folder (`?knobs=style`) holds each map's colours, palette, light and haze and repaints a running match: `src/modes/moba/restyle.js` `styleKnobs`, `paint`, `bind`, `restyle`, registered in `index.js`
- Tuning sliders: `sliders.js` `sliderSections` (named by tune key), `debugPath` (groups), `addSliders`; the panel's filter box is in `src/core/debug.js`; Match's late slider targets the current map's `debugTune.late` (shared `match` fallback); each map manifest's `debugTune.name` is its tune key
- `window.dt` (keys, pad, screen, device, game): `src/core/proof.js` `createProofApi`; `verify.md`
- Simulation tables and bot experiments: `agent-match.js`; `scripts/farm.js`; report tables `scripts/bench/report.js`; `verify.md` Check and headless tools (read that section before writing a probe)
- Feature lookup for builders: `scripts/where.js`; `bun run where <word>` prints feature-map entries and source hits, `--all` removes output limits

## Online rooms

- Online plugin and room panel: `src/online/index.js` `online`; `src/online/online-ui.js` `createOnlineUi`; `network.md`
- Room session (host, join, lobby, match): `src/online/online-session.js` `createOnlineSession`; `src/online/tune.js` `link`, `input`
- Room list and join codes: `src/online/lobby-directory.js` `createLobbyDirectory`
- Join by link (`/ABCDE`), Copy link: `src/main.js`; `net.js` `roomCode`; online `index.js` `joinByLink`; `online-ui.js`; `worker/index.js`
- Late joiner takes a bot's seat, leaver hands it back: moba `index.js` `seatLate`, `openSeats`, `removeParticipant`; `sim-heroes.js` `releaseBot`, `adoptBot`; `online-session.js` `onPeerJoin`; `link.js` `SEAT_TIMEOUT`
- Sticker names over heroes and in the room panel: `online/names.js` `playerName`; online `index.js` `showNames`; moba `index.js` `names`; `health-bars.js`
- Refresh mid-match gets the same seat back: `names.js` `seatKey`; `online-session.js` `onPeerJoin` (`left`, `prefer`); moba `seatLate`; online `tune.js` `room.rejoinFor`
- Stale build gets "New version, reload": `net.js` `BUILD`, `staleBuild`; `vite.config.js` `define`; `online-ui.js` `stale`; dev fake `/CODE?build=old`
- Link previews (og tags, key art `public/og.jpg`) and the room's own preview title: `index.html`; `worker/index.js` `roomPage`
- Result card Copy link (a line of the match plus the address bar's link, the room's when shared): moba `menu.js` `share`
- Transport (peer link, envelopes): `src/online/net.js` `Net`, `plainJoinData`; `src/online/link.js` `createLink`
- Online parity, snapshot and replica wiring (Cushion cover, gates, camps, flag, guest fog): `sim-snapshot.js` `snapshot` writes host state; `lane-replica.js` `projectLaneSnapshot`, `createLaneReplica` packs/applies lane state; moba `index.js` `FACTS` whitelists feedback and registers guest fog; `lobby-replica.js` handles the lobby; `src/modes/dodgeball/replica.js` handles dodgeball; `network.md`

## Dodgeball (bonus mode)

Plugin in `src/modes/dodgeball/`; its snapshots are locked by `tests/characterization.test.js`. Tune keys are in `src/modes/dodgeball/tune.js`.

- Dodgeball mode entry: `index.js` `dodgeball` (default export)
- Round and match flow: `matchflow.js` `createMatchFlow`; `round.js`
- Court and arena: `court.js` `buildCourt`; `arena.js` `bounds`, `spawnPoint`, `ammoPoint`
- Arrows (the balls: flight, landing, throw): `arrow.js` `createArrow`, `projectArrowFlight`, `solveLaunch`, `launchVelocity`; tune `arrow`
- Weapons and charge meter: `weapons.js` `createChargeMeter`; `weaponhud.js` `createWeaponHud`; tune `weapons`
- Loadout and hand point: `loadout.js` `createLoadout`, `handPoint`
- Aim line: `aimline.js` `createAimLine`; `aim.js`
- Near-miss tracker: `nearmiss.js` `createNearMissTracker`
- Opponent brain: `ai.js` `createBrain`; tune `ai`
- Scoreboard (dodgeball): `scoreboard.js` `createScoreboard`
- Portal pads (pick the number of enemies): `portal.js` `createPortal`, `buildPortalPad`
- Sandbox mode and scenarios: `sandbox.js` `createSandbox`; `scenario.js` `scenario`, `scenarioFromURL`
- God mode effects and cheats: `godmodefx.js` `createGodmodeFx`; tune `cheats`, `fx`
- Feedback and impact: `feedback.js`; `impact.js`
- Lobby handoff: `index.js` (`lobbyExit`)

## Landmarks in the big files

`tune.js` assembles domain tunes; presentation numbers are in `look.js`. Use these owners rather than reading the assembled file or searching every caller.

- Tune ownership: match rules (`bots`, `fog`, `camps`, waves, structures) in `tune.js`; Flagfall in `maps/flagfall/flagfall-tune.js`; Overthrow in `maps/overthrow/overthrow-tune.js`; lobby in `front/lobby-tune.js`; each ability/hero in its own `abilities/<id>/<id>-tune.js` or `heroes/<id>/<id>-tune.js`. `rg -n "^\s*<key>:" <owner>` jumps to the block; `ast-grep outline` misses object keys. Sliders: `sliders.js` `debugSections`.
- `sim.js`: `createSim` builds the world, heroes and mechanics, wires the systems through one shared `ctx`, and runs `step` (the tick). Heroes are `sim.heroes[i]`; bodies come from `src/core/body.js` (`body.position`, `body.place(x, y, z)`). Each system is a `create…(ctx)` in its own file:
  - `sim.js`: the wiring, `step` (the step order), `dispose`, the public `api`
  - `sim-heroes.js`: `createHeroMaker` (`bodyAt`, `makeHero`); `createRoster`: `swapHero`, `removeHero`, `releaseBot`, `adoptBot`, `setLevel`, `spawnHero`, `respawnNow`
  - `sim-mechanics.js`: `layMechanicGround`, `plugMechanics`: where map mechanics plug in
  - `targeting.js`: `enemiesOf`, `find`, `pick`, `nearestToClick`, `stickAim`: what a click or the stick lands on
  - `control.js`: `control` (a hero's tick: intents to orders, casts and movement), `strafe` (a dummy's)
  - `orders.js`: `plan`, `offPath`, `issue`, `attackAhead`, `steer`, `move`, `face`
  - `casting.js`: `casts`, `release`, `aimBasic`, `traitContext`, `cancelChannel`, `stepHeroState`
  - `combat.js`: `basicAttack`, `hit`, `bench`, `shove`, `dunk`, `respawn`, `dropIn`
  - `projectiles.js`: `stepShots`, `stepZones`, `expireBoards`, `launchShot`, `openCatch`, `throwCaught`, `resolveInterception`
  - `sim-snapshot.js`: `snapshot`; `sim-kit.js`: `SLOTS`, `ticks`, `yawOf`, `dirOf`
- Core engine: `src/core/` (`input.js`/`intents.js` controls, `proof.js` is `window.dt`, `body.js` bodies, `app.js` the clock and modes).
