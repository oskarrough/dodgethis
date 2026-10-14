# Feature map

Every player-facing feature, grouped by screen, one line each: the feature in plain words, then its files and entry symbols, its `tune.js` key and its doc. Use `bun run where <word>` (or a quoted phrase such as `"lane split"`) for matching entries and source locations, then read only the relevant code range. Output is bounded; `--all` prints every match.

Don't read big files whole. `ast-grep outline <file>` lists a file's symbols with line numbers; `ast-grep run -p '<pattern>' -l js src` finds structure (callers, `tune.x.y` uses). Whoever adds or moves a feature updates its line here. To prove a feature in the running game, use `docs/verify.md`.

Paths are under `src/plugins/moba/` unless they start with `src/`. `tune.js` means `src/plugins/moba/tune.js` (key in backticks); other tune files are named in full. `tune.js` keeps the match rules and assembles the rest, so every `tune.x.y` path is unchanged but the values live elsewhere: `map` and `overthrowTerrain` in `maps/overthrow/overthrow-tune.js`, `flagfall` in `maps/flagfall/flagfall-tune.js`, `lobby` in `front/lobby-tune.js`, every ability's numbers (`loose`, `rain`, `vault`, `toss`, `catch`, `dive`, `gloveSlap`, `bank`, `cushion`, `swap`) in `abilities/<id>/<id>-tune.js`, heroes' (`heroes.mitts`, `heroes.pong`, `heroes.coach`) in `heroes/<id>/<id>-tune.js`. Docs live in `docs/`.

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

## Lobby

- Lobby screen (walk around, pick, ready, back): `lobby.js` `createLobby`; `tune.js` `lobby`; `moba.md`
- Back and Play online, the top-left row in both modes' lobbies: `src/core/corner-nav.js` `createCornerNav`; `index.html` `.corner-nav`; used by `lobby.js` `createLobby` and `src/plugins/dodgeball/index.js`
- Seats, roster, ready state (1 s fill; stepping out cancels): `lobby-state.js` `createReadySeats`; `lobby-heroes.js` `createLobbyHeroes`; `tune.js` `lobby.ready`
- Ready plates inlaid in the saucer's glaze, the Ready label beside yours, the glaze fill: `lobby-props.js` `createLobbyProps`, `plate`; `tune.js` `lobby.ready`; `lobby.js` `createLobby`
- Lobby floor, the glazed saucer in its magnetic cradles, with a solid round cushion rim for bodies, shots and held Ricochet previews: `lobby-floor.js` `createLobbyFloor`, `saucerShape`; `maps/lobby/lobby-layout.js` `lobbyLayout`, `lobbyRimCover` (overlapping circular cover); `obstacles.js` `buildColliders` (`island.round` floor and cover), `sweepObstacles`; `maps/lobby/lobby-view.js` glaze; `tune.js` `lobby.floor`
- Plates flow to the map: bots walk onto their plates on arrival, your plate ripples until you stand in it, grooves inlaid in the glaze run from each plate into a trunk under the weather bowl and fill as plates glaze, team glazes marbling where they join, then round inside the bowl, the last plate to glaze closing the ring: `lobby-flow.js` `createLobbyFlow`, `groovePath`, `ringPath`; hooked in `lobby-props.js` `createLobbyProps`; `tune.js` `lobby.flow`
- Weather bowl, the next map turning in miniature under a sky cap, with its label and round shot/body collider: `lobby-bowl.js` `createWeatherBowl`; `maps/lobby/lobby-layout.js` `lobbyLayout` (`lobby-bowl` cover); `tune.js` `lobby.bowl`
- Hero stands and the hero strip (pick a hero; shots already out finish after a swap), leaning on the saucer's left lip, with spice motes drifting off the cards to the plates: `lobby-heroes.js` `heroStands`, `createHeroStrip` (`seat`); `lobby-floor.js` `saucerRim`; `lobby-dust.js` `createLobbyDust`; `tune.js` `lobby.pick`, `lobby.strip`, `lobby.dust`
- The swap flip (your old hero turns edge-on to the camera, the new one comes round with an overshoot, its foot disc down first) and props that squash when bumped and rock when shot (weather bowl, bot holograms): `lobby-feel.js` `createFlips`, `createJolts`; foot disc names in `hero-view.js`; `tune.js` `lobby.pick` (`flip*`), `lobby.jolt`
- Lobby sounds: swap (`lobby.pick`, `lobby.flip`), difficulty pick (`lobby.galleryPick`), your groove starting to fill (`lobby.grooveFill`, played in `lobby-props.js`), ready (`lobby.readyWalk`, `lobby.seatEnter`, `lobby.seatReady`, `lobby.readyCancel`): `sound-table.js`; `tune.js` `lobby.ready.grooveSound`
- Hero numbers panel (stats, level slider): `front/numbers.js` `createNumbers`; `front/stats.js` `heroStats`, `numberLines`; `tune.js` `lobby.inspect`
- Difficulty gallery, three standees you shoot to pick: `lobby-props.js` `createDifficultyGallery`; `tune.js` `lobby.gallery`
- Horseshoe magnets with sleepy, calm and angry faces: `lobby-magnets.js` `createMagnets`, `createFaceKit`
- Lobby props in the scene (stands, magnets, ready marks): `lobby-props.js` `createLobbyProps`; `tune.js` `lobby.marks`
- Lobby practice dummies (players can't hit each other): `dummy-view.js` `dressDummy`; mechanic `mechanics/dummies/` (dressed through `mechanics/dummies/dummies-view.js`); `tune.js` `dummies`, `lobby.practice`; `look.js` `dummyView`
- Lobby camera (fits the whole saucer) and intro swoop: `lobby.js` `createLobby` (`fitSaucer`); `lobby-floor.js` `saucerExtent`; `lobby-bowl.js` `bowlExtent`; `tune.js` `lobby.camera`, `lobby.intro`
- Lobby HUD (tooltips on heroes): `lobby.js`; `hud.js` `createHud({ lobby: true })`; `tune.js` `lobby.hud`
- Lobby fall recovery (the solid rim prevents ordinary walk-offs): `lobby.js`; `tune.js` `lobby.fall`, `lobby.respawn`
- Lobby sim replica for online: `lobby-replica.js` `createLobbyReplica`, `createUnitReplica`; `network.md`
- Online "someone joined" notice: `tune.js` `lobby.onlineNotice`; `lobby.js`

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
- Control presets (MOBA, WASD, keyboard only; the pause menu and the lobby's bottom-right label cycle them, WASD under MOBA offers the switch once, the pad ignores them) and their hotkey labels: `src/core/intents.js` `PRESETS`, `presetKeys`, `pointClick`; `src/core/controls.js` `cyclePreset`, `setPreset`; `menu.js` `nextPreset`; `lobby-controls.js` `createLobbyControls`
- Pad stick aim: `targeting.js` `stickAim`; `src/core/intents.js` `stickVector`; `tune.js` `stickAim`
- Keyboard and gamepad reading (held presses across a screen change are ignored until released): `src/core/input.js` `moveVector`, `pollGamepad`, `consumeKeys`, `rumble`; `src/core/intents.js` `readIntent`
- Cursor (move and attack icons): `cursor.js` `createCursor`; `cursors/move.svg`, `cursors/attack.svg`
- Pathfinding around walls: `path.js` `createPathPlanner`, `pursue`; `orders.js` `plan`, `offPath`; `tune.js` `orders`

## Match: HUD

- HUD (portrait, ability slots, cooldown rings, level, health): `hud.js` `createHud`, `matchFrame`; `hud.css`; `tune.js` `hud`; `moba.md`
- Top bar (one cream pill: team dots for heroes alive, takedowns, clock, the Ball countdown; fixed width; the win condition stays visible beneath it): `hud.js` `createHud` (`moba-top`, `moba-objective`); `hud.css` Top bar
- Game log and feed (fact → sentence for the local player; the feed drum mid-right shows kills, wipes, structures, goals and Ball calls): `game-log.js` `createGameLog`, `FEED`; `feedback.js` `log.record`; `hud.js` `feed`; `hud.css` `.moba-feed`; `tune.js` `hud.feedLife`, `feedLines`
- Ability slot keys (Q, W, E and pad RB, RT, LB): `hud.js` `KEYS`, `SLOTS`
- Inspect mode (hold I or pad button, hover to read cards): `hud.js` `KEY_INSPECT`, `PAD_INSPECT`, `pickUnit`
- Tooltips and unit cards (hero, tower, minion, Ball, level, kills, clock): `tooltip.js` `createTooltip`, `heroCard`, `abilityCard`, `structureCard`, `minionCard`, `ballCard`, `levelCard`, `killsCard`, `clockCard`; `hud.js` `cardFor`, `updateTip`
- Match clock (its card carries the next wave and the Ball): `tooltip.js` `clock`, `clockCard`; `hud.js`
- Health bars over units: `health-bars.js` `createHealthBars`; `health-bars.css`; `look.js` `healthBars`
- Damage numbers: `damage-numbers.js` `createDamageNumbers`; `look.js` `damageNumbers`
- Edge pips for off-screen allies, enemies, Ball: `pips.js` `edgePip`, `createPips`; `look.js` `pips`
- Minimap, its camera-view outline and click/drag to move the camera: `minimap.js` `createMinimap` (`drawView`, `onFocus` → `follow.focus`); `maps/all-maps.js` `matchRecipe`; `hud.js`; `hud.css` `.moba-minimap`
- Fog of war (on by default, `?fog=0` turns it off; sight, hidden enemies, dimmed ground): `fog.js` `createFog`; match rules `tune.js` `fog`; hooked in `index.js` present; minimap filtering in `minimap.js`; CPU proof: `docs/verify.md` Browser proofs (the dodgeball `benchmark()` cannot time MOBA)
- Flagfall mercenary camps (neutral guards at the camp marks fight back and leash; clearing one sends mercs down the nearest lane; respawn; bots clear them when their lane is quiet): `mechanics/camps/camps-objective.js` `createCamps`, bots `mechanics/camps/camps-bots.js` `campBots` (`escort` phase); mechanic `mechanics/camps/`, on in `maps/flagfall/flagfall.js` `mechanics`; `layout.camps` in `maps/flagfall/flagfall-layout.js`; `tune.js` `camps`; lane hooks `passive`, team `'N'`, `route` in `lane.js`
- Flagfall jungle (rooms, spine walls, brush, camp/flag/gatehouse marks): `maps/flagfall/flagfall-layout.js` `flagfallLayout`; `tune.js` `flagfall.jungle`; marks and brush mats in `maps/flagfall/flagfall-view.js` `ground`
- Flagfall gates, two kinds on one mechanic (own team passes, enemies are held out and siege it, shots hit it): the gatehouse, a no-gun stone tower at the fort's chalk bar that the fort waits for (rubble when it falls), and the laser gate, two posts and a hologram beam between fort and core that waits for the fort and that the core waits for (stubs when it falls): `gates.js` `addGates`, `holdGates`, `GATES`; `tune.js` `gatehouse`, `laser`, `flagfall.jungle.gatehouseX`/`laserX`; laser look in `lane-view.js` `makeBody` (`look.laneView.laser`), beam shader shared with the lobby holograms in `hologram.js`; hooked in `maps/flagfall/flagfall-layout.js`, `sim.js` step, `mechanics/structures/structures.js` obstacles (`obstacle: false`), `lane.js` (no gun, `tune[kind].xp`)
- Flagfall centre flag (hoist clock, hold the ring, team XP and per-lane silence; HUD line, minimap dot; bots' nearest two go): `mechanics/flag/flag-objective.js` `createFlag`; `mechanics/flag/flag-view.js` `view`; `mechanics/flag/flag-bots.js` `flagBots`; mechanic `mechanics/flag/`; `minimap.js` objectives; `tune.js` `flagfall.flag`, `bots.flagGo`
- Scoreboard (Tab or pad Select, live table mid-match): `recap.js` `createRecap` (the `board` aside, class `moba-scoreboard`); `match-stats.js` `createMatchStats`
- Pause menu (Esc, pad Start, or the top-left menu tile): `menu.js` `createMatchMenu`, `openMenu`, the manual page `pausePage` (Quick cast as a checkbox under the actions), Leave game to the splash `quit`; tile from `src/core/corner-nav.js`; `menu.css`; `tune.js` `hud`
- Onboarding cues (floor arrow, hero ring, You sticker, Ball and goal pointer): `onboarding.js` `createOnboarding`; `look.js` `onboarding`
- Dead-world grey-out and respawn timer: `recap.js` `createRecap` (`moba-dead-world`); `combat.js` `respawn`; `tune.js` `respawn`
- Combat log: `src/core/debug.js` `createCombatLog`

## Match: heroes and kits

- Hero, ability, map and mechanic folders (how to add one): `extending.md`
- Hero table and kit definitions: `heroes.js` `heroDefinition`, `HEROES`, `freshAbilityState`; `ability.js` `abilityOf`, `castAbility`; `tune.js` `heroes`, `hero`; `heroes.md`
- Casting, cast points, release, skill press buffer (latest press wins; stop/cancel abort and refund; abilities have no backswing): `casting.js` `casts`, `castWait`, `release`, `cancelChannel`, `stepHeroState`; `tune.js` `cast`
- Basic attack: `combat.js` `basicAttack`; `casting.js` `aimBasic`; `tune.js` `attack`
- Replicated unit statuses (shields, Stagger bank/repayment, strongest-wins slows, stun, freeze, prone, motion and Tag out guard): `statuses.js` `createStatuses`, `statusDefinition`, `statusBar`, `moveSpeed`, `blocked`, `stateUntil`; folder `statuses` declarations with `label`, `tags`, `states`, `stack` (default refresh by key/source, opt-in `maxStacks`), `bar`, hooks and tick-based `periodic`; `sim.apply`, `sim.remove`, `sim.cleanse`. One state gate table owns `move`, `cast`, `shield`, `catch`, `ballPickup` and `still`; frozen blocks Ball pickup like stun, prone still permits catching, Tag out cleanses stun/freeze/slow/motion but not prone. Minions honour the Ball's stun in `lane.js` `units`. Engine declarations `core.stun` and `core.motion` resolve before abilities; `displacement.js` carries motion's host-only path through its endpoint tick, then `onExpire` replans. Active `damageTaken` modifiers multiply live before `onDamageTaken`; absorb drains oldest first afterwards. `sim-snapshot.js`, `lane-replica.js`, `lobby-replica.js` carry the ordered records and stable ids; `packStatuses` omits motion paths. HUD, health bars, hit logs, `scripts/bench/report.js` and Brew's bot read declaration labels. Pocket/Bag returns still keep damage only, as before; retaining statuses on caught returns belongs to a separate behaviour change.
- Damage and hit resolution: `combat.js` `hit`; `skillshot.js` `stepShot`, `interceptShot`
- Skillshot shapes and sweeps: `skillshot.js` `stepShot`, `closest`; `obstacles.js` `sweepHit`, `sweepObstacles`; `skills-view.js` `lineReach`, `bouncedLinePath` (held Ricochet preview traces the sim's `stepShot`); `view.js` thin dotted Ricochet path (`look.js` `abilityView.bouncedAimRadius`, `bouncedAimSpacing`)
- Ability telegraphs for enemies (ground line tell): `skills-view.js` `createSkillsView`; `look.js` `abilityView`; `heroes.md`
- Fletcher, ranged poke. Q Loose (arrow shot), W Rain (zone), E Vault (dash): `abilities/{loose,vault,rain}/`, `heroes/fletcher/`; `heroes.md`
- Mitts, keeper. Q Toss (throw caught shots), W Catch (stance), E Dive (dash): `heroes/mitts/mitts.js`, `abilities/{toss,catch,dive}/`; glove and pocket poses in `heroes/mitts/mitts-view.js` `animate`; Toss/return punch in `feedback.js` (ability `effects.punch`, `toss-tune.js` `feedback`), puffs and sound recipes in `look.js` (uses `toss.shot`, `toss.hit`, `return.shot`, `return.hit` in `sound-table.js`); the catch window's fan in `abilities/catch/catch.js` `look`
- Mitts glove slap (basic): `abilities/gloveSlap/`
- Catching and the Pocket (caught shots held and thrown back): `projectiles.js` `openCatch`, `throwCaught`, `resolveInterception` (the pocket takes the caught shot's team); `casting.js` `traitContext`; `tune.js` `catching`, `momentum`
- P. Pong (id `pong`, was Carom): `heroes/pong/` (stone-beaked costume with paddle and back net in `costume.js`, tune, `index.js`), Q Ricochet `abilities/bank/` (bounces, data in its tune; drawn as a cream celluloid ball in `view.js`), W Cushion `abilities/cushion/` (a short wall of posts at the cursor via `sim.addCover`, drawn as one net on two end posts per cast in `skills-view.js`), E Swap `abilities/swap/` (trade places with your live Ricochet shot, or where it stopped for `linger`; greyed tile via `ready`). Bots: `fight-bots.js` swaps out when hurt or in on a low target, and walls a target with no cover to bank off. Trick Shot, Kiss's bounce and Backboard are not built; design in `heroes.md`.
- Coach, captain (id `coach`, was Skip): `heroes/coach/` (flat bar and megaphone placeholder); basic `abilities/tennisBall/`, Q `abilities/pass/` (first hero, ally heal or enemy slow), W `abilities/tagOut/` (ally swap and cleanse, temporary damage reduction), E `abilities/redLight/` (freeze moving enemy heroes). Out, not gone: `coach-cutout.js` reads dead-player intents, walks the touchline and launches `abilities/outThrow/` from inside the wall; hero hits shorten death by two seconds. Costume, cutout and dashed tether: `coach-view.js`; bots: `coach-bots.js`, via hero `bot`/`botDead` hooks in `bots.js`. Kit numbers and sound recipes live in the folder tune files. R Back in! waits for M5.
- Brew, bruiser (id `brew`): `heroes/brew/`, palm strike `abilities/palmStrike/`, Q Flying kick `abilities/flyingKick/` (first-unit dash), W Stagger `abilities/stagger/` (deferred pool and even repayment), E Swig `abilities/swig/` (interruptible rooted shield channel). Shield absorption: `statuses.js` `absorb`, called by `combat.js` `hit`; shield and pool bars: `health-bars.js`; replication: `sim-snapshot.js`, `lane-replica.js`, `lobby-replica.js`. Hero-specific bot decisions: `heroes/brew/brew-bot.js`, dispatched in `bots.js`.
- Hook, initiator (id `hook`): `heroes/hook/` (crescent and yo-yo placeholder); basic `abilities/yoYoFlick/`, Q `abilities/throw/` (first body, damage and drag; caught returns keep damage only), W `abilities/tangle/` (cone and slow), E `abilities/aroundTheWorld/` (radial hero knockback). Reusable `displacement.js` `createDisplacement`, `stepUnitDisplacement`, `sim.displace` moves heroes/minions over a duration, clips at cover/bounds and cancels cast/channel/dash; `core.motion` statuses carry its host-only path; `sim-snapshot.js` and `lane-replica.js` replicate the status without that path. Bots: clear-line Throw, nearby cone payoff, radial peel against a crowd in `fight-bots.js`.
- Hero costumes and silhouettes: `hero-view.js` `dressHero`, costumes in `heroes/<id>/<id>-view.js` (`dress`, optional `animate`); `look.js` `silhouettes`; `look.md`
- Level, XP and stat growth: `tooltip.js` `levelProgress`; `combat.js` `hit`; `tune.js` `levels`
- Globes (health pickups): `lane-rewards.js` `createRewards` (`reward` drops them, `stepGlobes`); `lane-view.js` `createLaneView`; `tune.js` `globes`
- Scripted test hero: `scripted.js` `createScriptedHero`; `tune.js` `scripted`

## Match: lane, minions, towers

- Lane: minion waves, towers, fort, core: `lane.js` `createLane` (the step order and the minion and gun brain: targeting, help, leash, attacks, march), `lane-waves.js` (spawns, routes), `lane-structures.js` (`after` vulnerability, deaths, reinforcements), `lane-rewards.js` (XP, levels, kill credit, globes); `mechanics/lane.js` `lane` (drawn by `lane-view.js`, projected by `lane-replica.js`, both wired in `sim.js`), mechanics `mechanics/structures/`, `mechanics/minions/`; `tune.js` `waves`, `minions`, `tower`, `fort`, `core`; `moba.md`
- Wave timing and spawns: `lane-waves.js` `waveInterval`, `createWaves`, `route`; `mechanics/minions/`; `tune.js` `waves`
- Lane bots (the minions' walk and fights under guns): `lane-bots.js` `laneBots`; `maps/paths.js` `laneRoute`
- Lane drawing (minions, towers, fort, core): `lane-view.js` `createLaneView`; `look.js` `laneView`
- Team stamps on the ground: `stamps.js` `createStamps`
- Match end rules (objective, late-game gun damage, winner): `lane.js` `createLane` (phase, gun damage), `lane-structures.js` `structureDown` (winner); `tune.js` `match`; late time in `maps/<id>/<id>-tune.js` (`map.late` for Overthrow, `flagfall.late` for Flagfall), read through the current layout
- Base healing: `lane.js` `createLane` `step`; `tune.js` `base`
- Lane replica for online: `lane-replica.js` `createLaneReplica`, `projectLaneSnapshot`; `network.md`

## Match: the Ball

- Ball (neutral objective, carried to score on structures): `ball.js` `createBall`; `mechanics/ball/` (view `ball-view.js` through `mechanics/ball/ball-view.js`); `tune.js` `ball`; `moba.md`
- Ball throw (Q W E R Z, pad A, or left click while carrying): `ball.js` `control`; `src/core/intents.js` `pointClick`; `src/core/controls.js` `throwClick`; `onboarding.js`; `tooltip.js` `ballCard`
- Ball drawing and trail: `ball-view.js` `createBallView`; `tune.js` `ballView`
- Ball confetti on pop: `feedback.js` `createFeedback`; `look.js` `ballConfetti`
- Ball bot behaviour (who fetches, who carries): `ball-bots.js`; `tune.js` `bots`

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
- Look references: `docs/pages/vibes/` (the picked directions), `docs/pages/archive/` (superseded, history only); `look.md`
- Docs pages on the live site (`/docs/pages/…`, same paths as in dev): every `docs/pages/**/*.html` in `vite.config.js` `build.rollupOptions.input`; sibling files and `docs/page.css` copied by the `docsPages` plugin

## Match: view, feedback, sound

- Match scene root: `view.js` `createView`; `index.js`
- Feedback (facts turn into sound, popups, shake, hit flash): `feedback.js` `createFeedback`; `index.js` `validFact`; `look.js` `juice`, `out`, `squeak`
- Sounds: `sound-table.js` `uses`, `facts` (every use and fact, one line each); `sounds.js` `createSounds`, `play`; `look.js` `sounds`; `src/core/audio.js`, `src/core/music.js`
- Sound board, swaps and kept sounds (audition, swap files into a running game, keep them): `docs/pages/sound/board.js`; `src/core/sound-swap.js` `setSwap`, `swapOf`; `src/core/audio.js` `swapped`, `ui`; `vite.config.js` `soundKeep`; `src/core/sfx/kept.json`
- Mix bus (bus levels, caps, music duck): `src/core/audio.js` `onBus`; `src/core/tune.js` `mix`; `sound-table.js` `BUS`; `sounds.js` `playOwn`
- Sound library and shortlists (`bun run sound:sync` mirrors Dropbox, measures and rebuilds every shortlist): `scripts/sound-library.js` `libraryNumbers`, `writeShortlists`, `decode`; `scripts/sound-check.js` (`--files`, `--shortlist`); `src/core/sound-swap.js` `libraryUrl`, `swapUrl`
- Sound numbers and rule check: `docs/pages/sound/numbers.js` `measure`, `check`; `src/core/audio.js` `render`; `scripts/sound-check.js`
- Screen shake, hit flash, impact: `src/core/juice.js` `createJuice`; `look.js` `juice`
- Hero and dummy death animation: `src/core/death.js` `startDeath`
- Style pass (inked outlines, palette): `src/core/stylepass.js`, `src/core/style.js` `PALETTE`; `look.md`

## Match: bots and agents

- Bots: difficulty, roster, intercept maths: `bots.js` `createBots`, `createBot`, `practiceRoster`, `botRandom`, `interceptTime`; `tune.js` `bots`
- Lane walking bot: `lane-bots.js`; fight bot (who to hit): `fight-bots.js` `createFightBot`; dodge bot: `dodge-bots.js` `createDodgeBot`; Ball bot: `ball-bots.js`
- Headless match for simulations: `agent-match.js` `createAgentMatch`, `replayHash`, `readReplay`; `bun run simulate`; `verify.md`
- Agent protocol (observations and actions for LLM or scripted players): `agents.js` `agentRoster`, `observation`, `agentAction`, `createAgentDecisions`; `tune.js` `agents`, `proof`; `verify.md`
- Match replay (record, load, play back): `replay.js` `mobaReplay`, `loadReplay`; `replay.css`; tapes record no map, so replays play on Overthrow only

## Result

- Recap screen (end table, stats, replay shot): `recap.js` `createRecap`; `match-stats.js` `createMatchStats`
- Winner freezes the match and opens the recap: `index.js` `moba` (`sim.lane.match.winner`); `menu.js` `createMatchMenu`

## Debug, Try Mode, proof

- Debug panel and Try Mode folder (lobby and match; match-only actions hidden in lobby): `debug.js` `createDebugLayout`, `createMatchDebug`; `setup.js` `parseTrySetup`; `src/core/debug.js` `createDebugPanel`
- Tuning sliders: `sliders.js` `sliderSections`, `addSliders`, `debugSections`; Match's late slider targets the current map's `debugTune.late` (shared `match` fallback); Terrain section names come from generated `maps/all-maps.js` `playableMaps` and each manifest's `debugTune.name`; other new debug folders go in `debugSections`
- `window.dt` (keys, pad, screen, device, game): `src/core/proof.js` `createProofApi`; `verify.md`
- Simulation tables and bot experiments: `agent-match.js`; `scripts/farm.js`; report tables `scripts/bench/report.js`; `verify.md` Check and headless tools (read that section before writing a probe)
- Feature lookup for builders: `scripts/where.js`; `bun run where <word>` prints feature-map entries and source hits, `--all` removes output limits

## Online rooms

- Online plugin and room panel: `src/plugins/online/index.js` `online`; `src/plugins/online/online-ui.js` `createOnlineUi`; `network.md`
- Room session (host, join, lobby, match): `src/plugins/online/online-session.js` `createOnlineSession`; `src/plugins/online/tune.js` `link`, `input`
- Room list and join codes: `src/plugins/online/lobby-directory.js` `createLobbyDirectory`
- Join by link (`/ABCDE`), Copy link: `src/main.js`; `net.js` `roomCode`; online `index.js` `joinByLink`; `online-ui.js`; `worker/index.js`
- Late joiner takes a bot's seat, leaver hands it back: moba `index.js` `seatLate`, `openSeats`, `removeParticipant`; `sim-heroes.js` `releaseBot`, `adoptBot`; `online-session.js` `onPeerJoin`; `link.js` `SEAT_TIMEOUT`
- Sticker names over heroes and in the room panel: `online/names.js` `playerName`; online `index.js` `showNames`; moba `index.js` `names`; `health-bars.js`
- Refresh mid-match gets the same seat back: `names.js` `seatKey`; `online-session.js` `onPeerJoin` (`left`, `prefer`); moba `seatLate`; online `tune.js` `room.rejoinFor`
- Stale build gets "New version, reload": `net.js` `BUILD`, `staleBuild`; `vite.config.js` `define`; `online-ui.js` `stale`; dev fake `/CODE?build=old`
- Link previews (og tags, key art `public/og.jpg`) and the room's own preview title: `index.html`; `worker/index.js` `roomPage`
- Result card Copy link (a line of the match plus the address bar's link, the room's when shared): moba `menu.js` `share`
- Transport (peer link, envelopes): `src/plugins/online/net.js` `Net`, `plainJoinData`; `src/plugins/online/link.js` `createLink`
- Online parity, snapshot and replica wiring (Cushion cover, gates, camps, flag, guest fog): `sim-snapshot.js` `snapshot` writes host state; `lane-replica.js` `projectLaneSnapshot`, `createLaneReplica` packs/applies lane state; moba `index.js` `FACTS` whitelists feedback and registers guest fog; `lobby-replica.js` handles the lobby; `src/plugins/dodgeball/replica.js` handles dodgeball; `network.md`

## Dodgeball (bonus mode)

Plugin in `src/plugins/dodgeball/`; its snapshots are locked by `tests/characterization.test.js`. Tune keys are in `src/plugins/dodgeball/tune.js`.

- Dodgeball plugin entry: `index.js` `dodgeball` (default export)
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
