# Feature map

Every player-facing feature, grouped by screen, one line each: the feature in plain words, then its files and entry symbols, its `tune.js` key and its doc. Grep this file for the word a player would say ("scoreboard", "bollard"), land on the code, then read only that code.

Don't read big files whole. `ast-grep outline <file>` lists a file's symbols with line numbers; `ast-grep run -p '<pattern>' -l js src` finds structure (callers, `tune.x.y` uses). Whoever adds or moves a feature updates its line here. To prove a feature in the running game, use `.claude/skills/verify/SKILL.md`.

Paths are under `src/plugins/moba/` unless they start with `src/`. `tune.js` means `src/plugins/moba/tune.js` (key in backticks); other tune files are named in full. `tune.js` keeps the match rules and assembles the rest, so every `tune.x.y` path is unchanged but the values live elsewhere: `map` and `overthrowTerrain` in `maps/overthrow-tune.js`, `flagfall` in `maps/flagfall-tune.js`, `lobby` in `front/lobby-tune.js`, Mitts's `gloveSlap`, `toss`, `catch`, `dive` in `mitts-tune.js`, Fletcher's `loose`, `rain`, `vault` in `fletcher-tune.js`. Docs live in `docs/`.

## Shell and splash

- Splash with map tiles (Overthrow, Flagfall), their illustrations in `public/splash/`: `front/index.js` `mobaFront`; `front/backdrop.js` `createBackdrop`; `front/tune.js` `tile`, `title`, `dusk`; `moba-front.md`
- Card skin for the splash cards and the lobby hero strip (default `painted`; `wash`, `ink`, `stone` via `?skin=`): `front/skin.js` `applySkin`, `paintedCard`; `front/skin.css` (`.skin-card`, `.skin-sheet`, `.skin-title`); art in `public/splash/`; `front/tune.js` `skin`
- Dodgeball bonus tag under the tiles: `front/index.js` (`bonus` const, `.front-bonus`); `moba-front.md`, `roadmap.md`
- Splash keyboard and pad focus, deny shake, back button: `front/controls.js` `createControls`; `front/tune.js` `deny`, `back`, `move`, `enter`
- Stickers, mute button, corner row, online panel, shell CSS: `index.html`; `src/core/browser.js` `createBrowserApp`
- Boot error screen: `src/core/browser.js` `reportBootError`
- Mode registration, `window.game.moba`: `index.js` `moba` (default export); `src/core/app.js` `createApp`; `plugin-architecture.md`
- Match setup from the URL (`?mode=moba&play&bots=&hero=&seed=&debug`): `setup.js` `parseMatchSetup`, `wantsDirectPlay`, `matchLink`; `moba-agents.md`
- Address bar follows the screen (URL per screen, Back/Forward, reload lands there): `src/address.js` `followScreen`, `addressFor`; boot routing is `main.js` `route`
- Which screen is up (splash, lobby, descent, match, paused, result): `src/core/proof.js` `createProofApi` (`dt.screen()`); `verification.md`

## Lobby

- Lobby screen (walk around, pick, ready, back): `lobby.js` `createLobby`; `tune.js` `lobby`; `moba-lobby.md`
- Back and Play online, the top-left row in both modes' lobbies: `src/core/corner-nav.js` `createCornerNav`; `index.html` `.corner-nav`; used by `lobby.js` `createLobby` and `src/plugins/dodgeball/index.js`
- Seats, roster, ready state: `lobby-state.js` `createReadySeats`; `lobby-heroes.js` `createLobbyHeroes`; `tune.js` `lobby.ready`
- Ready plates inlaid in the saucer's glaze, the Ready label beside yours, the glaze fill: `lobby-props.js` `createLobbyProps`, `plate`; `tune.js` `lobby.ready`; `lobby.js` `createLobby`
- Lobby floor, the glazed saucer in its magnetic cradles: `lobby-floor.js` `createLobbyFloor`, `saucerShape`; its elliptical collider: `obstacles.js` `buildColliders` (`island.round`); `maps/lobby.js` `lobbyLayout`; `tune.js` `lobby.floor`
- Weather bowl, the next map turning in miniature under a sky cap, with its label: `lobby-bowl.js` `createWeatherBowl`; `tune.js` `lobby.bowl`
- Hero stands and the hero strip (pick a hero): `lobby-heroes.js` `heroStands`, `createHeroStrip`; `tune.js` `lobby.pick`
- Hero numbers panel (stats, level slider): `front/numbers.js` `createNumbers`; `front/stats.js` `heroStats`, `numberLines`; `tune.js` `lobby.inspect`
- Difficulty gallery, three standees you shoot to pick: `lobby-props.js` `createDifficultyGallery`; `tune.js` `lobby.gallery`
- Horseshoe magnets with sleepy, calm and angry faces: `lobby-magnets.js` `createMagnets`, `createFaceKit`
- Lobby props in the scene (stands, magnets, ready marks): `lobby-props.js` `createLobbyProps`; `tune.js` `lobby.marks`
- Lobby practice dummies: `dummy-view.js` `dressDummy`; `match.js` `dummies`; `tune.js` `dummies`, `lobby.practice`; `look.js` `dummyView`
- Lobby camera (fits the whole saucer) and intro swoop: `lobby.js` `createLobby` (`fitSaucer`); `lobby-floor.js` `saucerExtent`; `lobby-bowl.js` `bowlExtent`; `tune.js` `lobby.camera`, `lobby.intro`
- Lobby HUD (tooltips on heroes): `lobby.js`; `hud.js` `createHud({ lobby: true })`; `tune.js` `lobby.hud`
- Fall off the floor and respawn: `lobby.js`; `tune.js` `lobby.fall`, `lobby.respawn`
- Lobby sim replica for online: `lobby-replica.js` `createLobbyReplica`, `createUnitReplica`; `network.md`
- Online "someone joined" notice: `tune.js` `lobby.onlineNotice`; `lobby.js`

## Descent

- Crane descent from lobby to match: `front/descent.js` `startLoading`; `front/descent-state.js` `createDescentState`, `descentFrame`; `front/tune.js` `loading`; `moba-front.md`
- Cloud reveal (cloud rolls in on the crane, parts around your hero): `front/clouds.js` `createClouds`; `front/descent.js` `veilFrame`; `front/tune.js` `loading.clouds`
- Descent camera projection and pointer easing: `front/backdrop.js` `projectFrame`, `easePointer`
- Splash plate (day into night), mist drift, parallax, dusk wash on the splash and descent: `front/backdrop.js` `createBackdrop`, `easeShot`; `public/splash/plate-*.webp`; `front/tune.js` `plate`, `mist`, `parallax`, `shot`, `dusk`
- Volley on the splash (balls flying behind the title): `front/backdrop.js`; `front/tune.js` `volley`

## Match: camera, controls, cursor

- Follow camera, one fixed lens on every map, and edge reserve: `follow.js` `createFollow`, `stepCamera`, `clampView`, `viewFootprint`; `tune.js` `follow` (`fov`, `rimShow` clamps how far it pans past the rims)
- Camera controls (lock, pan, zoom): `camera-controls.js` `createCameraControls`; `tune.js` `follow`
- Right-click move and attack-move orders: `orders.js` `issue`, `steer`, `move`, `attackAhead`; `src/core/intents.js` `pointClick`, `createIntents`; `tune.js` `orders`
- Pad stick aim: `targeting.js` `stickAim`; `src/core/intents.js` `stickVector`; `tune.js` `stickAim`
- Keyboard and gamepad reading: `src/core/input.js` `moveVector`, `pollGamepad`, `consumeKeys`, `rumble`; `src/core/intents.js` `readIntent`
- Cursor (move and attack icons): `cursor.js` `createCursor`; `cursors/move.svg`, `cursors/attack.svg`
- Pathfinding around walls: `path.js` `createPathPlanner`, `pursue`; `orders.js` `plan`, `offPath`; `tune.js` `orders`

## Match: HUD

- HUD (portrait, ability slots, cooldown rings, level, health): `hud.js` `createHud`, `matchFrame`; `hud.css`; `tune.js` `hud`; `moba-plan.md`
- Top bar (one cream pill: team dots for heroes alive, takedowns, clock, the Ball countdown; fixed width): `hud.js` `createHud` (`moba-top`); `hud.css` Top bar
- Ability slot keys (Q, W, E and pad RB, RT, LB): `hud.js` `KEYS`, `SLOTS`
- Inspect mode (hold I or pad button, hover to read cards): `hud.js` `KEY_INSPECT`, `PAD_INSPECT`, `pickUnit`
- Tooltips and unit cards (hero, tower, minion, Ball, level, kills, clock): `tooltip.js` `createTooltip`, `heroCard`, `abilityCard`, `structureCard`, `minionCard`, `ballCard`, `levelCard`, `killsCard`, `clockCard`; `hud.js` `cardFor`, `updateTip`
- Match clock (its card carries the next wave and the Ball): `tooltip.js` `clock`, `clockCard`; `hud.js`
- Health bars over units: `health-bars.js` `createHealthBars`; `health-bars.css`; `look.js` `healthBars`
- Damage numbers: `damage-numbers.js` `createDamageNumbers`; `look.js` `damageNumbers`
- Edge pips for off-screen allies, enemies, Ball: `pips.js` `edgePip`, `createPips`; `look.js` `pips`
- Minimap, its camera-view outline and click/drag to move the camera: `minimap.js` `createMinimap` (`drawView`, `onFocus` → `follow.focus`); `maps/index.js` `matchRecipe`; `hud.js`; `hud.css` `.moba-minimap`
- Fog of war (on by default, `?fog=0` turns it off; sight, hidden enemies, dimmed ground): `fog.js` `createFog`; `tune.js` `fog`; hooked in `index.js` present
- Flagfall mercenary camps (neutral guards at the camp marks fight back and leash; clearing one sends mercs down the nearest lane; respawn; bots clear them when their lane is quiet): `camps.js` `createCamps`, bots `camp-bots.js` `campBots` (`escort` phase); piece `camps` in `match.js`, on in `maps/index.js` flagfall; `layout.camps` in `maps/flagfall.js`; `tune.js` `camps`; lane hooks `passive`, team `'N'`, `route` in `lane.js`
- Flagfall jungle (rooms, spine walls, brush, camp/flag/gatehouse marks): `maps/flagfall.js` `flagfallLayout`; `tune.js` `flagfall.jungle`; marks and brush mats in `map.js` `buildFlagfall`
- Flagfall gates, two kinds on one mechanic (own team passes, enemies are held out and siege it, shots hit it): the gatehouse, a no-gun stone tower at the fort's chalk bar that the fort waits for (rubble when it falls), and the laser gate, two posts and a hologram beam between fort and core that waits for the fort and that the core waits for (stubs when it falls): `gates.js` `addGates`, `holdGates`, `GATES`; `tune.js` `gatehouse`, `laser`, `flagfall.jungle.gatehouseX`/`laserX`; laser look in `lane-view.js` `makeBody` (`look.laneView.laser`), beam shader shared with the lobby holograms in `hologram.js`; hooked in `maps/flagfall.js`, `sim.js` step, `match.js` structures obstacles (`obstacle: false`), `lane.js` (no gun, `tune[kind].xp`)
- Flagfall centre flag (hoist clock, hold the ring, team XP and per-lane silence; HUD line, minimap dot; bots' nearest two go): `flag.js` `createFlag`; `flag-view.js`; `flag-bots.js` `flagBots`; piece `match.js` `flag`; `minimap.js` objectives; `tune.js` `flagfall.flag`, `bots.flagGo`
- Scoreboard (Tab or pad Select, live table mid-match): `recap.js` `createRecap` (the `board` aside, class `moba-scoreboard`); `match-stats.js` `createMatchStats`; `moba-recap.md`
- Pause menu (Esc, pad Start, or the top-left menu tile): `menu.js` `createMatchMenu`, `openMenu`, the manual page `pausePage` (Quick cast as a checkbox under the actions), Leave game to the splash `quit`; tile from `src/core/corner-nav.js`; `menu.css`; `tune.js` `hud`
- Onboarding cues (floor arrow, hero ring, You sticker, Ball and goal pointer): `onboarding.js` `createOnboarding`; `look.js` `onboarding`; `moba-onboarding.md`
- Dead-world grey-out and respawn timer: `recap.js` `createRecap` (`moba-dead-world`); `combat.js` `respawn`; `tune.js` `respawn`
- Combat log: `src/core/debug.js` `createCombatLog`

## Match: heroes and kits

- Hero, ability, map and piece folders (the mod contract, planned): `mods.md`
- Hero table and kit definitions: `heroes.js` `heroDefinition`, `HEROES`, `freshAbilityState`; `ability.js` `abilityOf`, `castAbility`, `slowFactor`; `tune.js` `heroes`, `hero`; `moba-heroes.md`
- Casting, cast points, release, skill press buffer: `casting.js` `casts`, `castWait`, `release`, `cancelChannel`, `stepHeroState`; `tune.js` `cast`
- Basic attack: `combat.js` `basicAttack`; `casting.js` `aimBasic`; `tune.js` `attack`
- Damage and hit resolution: `combat.js` `hit`; `skillshot.js` `stepShot`, `interceptShot`
- Skillshot shapes and sweeps: `skillshot.js` `stepShot`, `closest`; `obstacles.js` `sweepHit`, `sweepObstacles`; `skills-view.js` `lineReach`
- Ability telegraphs for enemies (ground line tell): `skills-view.js` `createSkillsView`; `look.js` `abilityView`; `moba-heroes.md`
- Fletcher, ranged poke. Q Loose (arrow shot), W Rain (zone), E Vault (dash): `heroes.js` `loose`, `vault`, `rain`; `tune.js` `loose`, `vault`, `rain`; `moba-heroes.md`
- Mitts, keeper. Q Toss (throw caught shots), W Catch (stance), E Dive (dash): `heroes.js` `toss`, `catchStance`, `dive`; `tune.js` `toss`, `catch`, `dive`, `gloveSlap`; `look.js` `mittsView`
- Mitts glove slap (basic): `heroes.js` `gloveSlap`; `tune.js` `gloveSlap`
- Catching and the Pocket (caught shots held and thrown back): `projectiles.js` `openCatch`, `throwCaught`, `resolveInterception`; `casting.js` `traitContext`; `tune.js` `catch`, `catching`, `momentum`
- Carom and Skip: tuned (`tune.js` `heroes`) and designed in `moba-heroes.md`, but not in the `heroes.js` table yet
- Hero costumes and silhouettes: `hero-view.js` `dressHero`; `look.js` `silhouettes`; `moba-look.md`
- Level, XP and stat growth: `tooltip.js` `levelProgress`; `combat.js` `hit`; `tune.js` `levels`
- Globes (health pickups): `lane.js` `createLane`; `lane-view.js` `createLaneView`; `tune.js` `globes`
- Scripted test hero: `scripted.js` `createScriptedHero`; `tune.js` `scripted`

## Match: lane, minions, towers

- Lane: minion waves, towers, fort, core: `lane.js` `createLane`; `match.js` `lane`, `structures`, `minions`; `tune.js` `waves`, `minions`, `tower`, `fort`, `core`; `moba-lane.md`
- Wave timing and spawns: `lane.js`; `match.js` `minions`; `tune.js` `waves`
- Lane bots (the minions' walk and fights under guns): `lane-bots.js` `laneBots`; `maps/paths.js` `laneRoute`
- Lane drawing (minions, towers, fort, core): `lane-view.js` `createLaneView`; `look.js` `laneView`
- Team stamps on the ground: `stamps.js` `createStamps`
- Match end rules (objective, late-game gun damage, winner): `lane.js` `createLane`; `tune.js` `match`
- Base healing: `lane.js` `createLane`; `tune.js` `base`
- Lane replica for online: `lane-replica.js` `createLaneReplica`, `projectLaneSnapshot`; `network.md`

## Match: the Ball

- Ball (neutral objective, carried to score on structures): `ball.js` `createBall`; `match.js` `ball`; `tune.js` `ball`; `moba-lane.md`
- Ball drawing and trail: `ball-view.js` `createBallView`; `tune.js` `ballView`
- Ball confetti on pop: `feedback.js` `createFeedback`; `look.js` `ballConfetti`
- Ball bot behaviour (who fetches, who carries): `ball-bots.js`; `tune.js` `bots`

## Match: maps and props

- How a map's features plug in: `maps/index.js` lists each map's `pieces` (`match.js`: structures, minions, ball, bots, camps, flag); `sim.js` reads a piece's `lane`, `create`, `botHabit`, `obstacles`, `controllers`. Structures become team-blind obstacles via `obstacles` and Rapier colliders via `sim.js` `towerColliders`. Bot goal names live in each habit's `botGoals` and must be unique within a map: lane `retreat commitSiege defend siege advance`, ball `urgent objective escort` (Overthrow), camps `escort` and flag `objective` (Flagfall).
- Overthrow (the first map): `maps/overthrow.js` `overthrowLayout`; `match-terrain.js` `createMatchTerrain`; `tune.js` `overthrowTerrain`, `map`; `moba-lane.md`
- Overthrow by day (cliff, moss lip, rim ink, cloud sea, cloud banks, far spires and arches, waterfalls, haze): `isle.js` `createIsle`; court moss and printed cast shadows: `match-terrain.js`; stone cover and pillars: `map.js` `buildMap` (`stoneCover`); stone towers and core: `lane-view.js` (`structureStyle: 'stone'`); the sun: `tune.js` `overthrowTerrain.light`, `core/stylepass.js` `setPalette`
- Flagfall (the second map): `maps/flagfall.js` `flagfallLayout`, `flagfallLayoutTune`; `tune.js` `flagfall`; `moba-map-2.md`
- Flagfall by night (the shared isle with night `colors`, `light`, `pool`, `haze`, `clouds`; moon, rim garden of leaf fans and glowing orchid bells, specks): `isle.js` `createIsle`; `tune.js` `flagfall`
- Flagfall cover (rim kerb cut at the Dunk gaps, dark-teal leaf-bank hedges, stone walls and drums, lantern posts): `map.js` `buildFlagfall`, `buildMap`; `tune.js` `flagfall.kerb`, `flagfall.glow`, `flagfall.hedge`
- Flagfall dunk (fence gaps, slick, shove into the sea): `combat.js` `shove`, `dunk`; `map.js` `buildFlagfall` (kerb cut, slick print); `feedback.js` `'dunk'`; `core/death.js` `overboard`; bots `fight-bots.js` `slick`, `inland`; `tune.js` `flagfall.gaps`, `flagfall.dunk`, `bots.slick*`
- Flagfall bot rotation across the yard: `lane-bots.js` `advance`; `tune.js` `bots.rotateRange`, `bots.rotateQuiet`
- Flagfall lane split (a human claims the lane they stand in, bots take the others): `bots.js` `createBot` `pickLane`; `tune.js` `bots.laneClaim`
- Map registry and layout recipe: `maps/index.js` `mapLayout`, `matchRecipe`; `tune.js` `map`
- Ground and walls build: `map.js` `buildMap`, `createMapScope`; `match-terrain.js` `createMatchTerrain`
- Colliders and walkable test: `obstacles.js` `buildColliders`, `walkable`, `clampWalkable`, `segmentClear`, `clampMap`
- Look references: `docs/pages/vibes/` (the picked directions), `docs/pages/archive/` (superseded, history only); `moba-look.md`

## Match: view, feedback, sound

- Match scene root: `view.js` `createView`; `index.js`
- Feedback (facts turn into sound, popups, shake, hit flash): `feedback.js` `createFeedback`; `index.js` `validFact`; `look.js` `juice`, `out`, `squeak`
- Sounds: `sounds.js` `createSounds`; `look.js` `sounds`; `src/core/audio.js`, `src/core/music.js`
- Screen shake, hit flash, impact: `src/core/juice.js` `createJuice`; `look.js` `juice`
- Hero and dummy death animation: `src/core/death.js` `startDeath`
- Style pass (inked outlines, palette): `src/core/stylepass.js`, `src/core/style.js` `PALETTE`; `moba-look.md`

## Match: bots and agents

- Bots: difficulty, roster, intercept maths: `bots.js` `createBots`, `createBot`, `practiceRoster`, `botRandom`, `interceptTime`; `tune.js` `bots`
- Lane walking bot: `lane-bots.js`; fight bot (who to hit): `fight-bots.js` `createFightBot`; dodge bot: `dodge-bots.js` `createDodgeBot`; Ball bot: `ball-bots.js`
- Headless match for simulations: `agent-match.js` `createAgentMatch`, `replayHash`, `readReplay`; `bun run simulate`; `verification.md`
- Agent protocol (observations and actions for LLM or scripted players): `agents.js` `agentRoster`, `observation`, `agentAction`, `createAgentDecisions`; `tune.js` `agents`, `proof`; `moba-agents.md`
- Match replay (record, load, play back): `replay.js` `mobaReplay`, `loadReplay`; `replay.css`

## Result

- Recap screen (end table, stats, replay shot): `recap.js` `createRecap`; `match-stats.js` `createMatchStats`; `moba-recap.md`
- Winner freezes the match and opens the recap: `index.js` `moba` (`sim.lane.match.winner`); `menu.js` `createMatchMenu`

## Debug, Try Mode, proof

- Debug panel and Try Mode folder: `debug.js` `createDebugLayout`, `createMatchDebug`; `setup.js` `parseTrySetup`; `src/core/debug.js` `createDebugPanel`
- Tuning sliders: `sliders.js` `sliderSections`, `addSliders`; new debug folders also go in `debugSections`
- `window.dt` (keys, pad, screen, device, game): `src/core/proof.js` `createProofApi`; `verification.md`
- Simulation tables and bot experiments: `agent-match.js`; `verification.md`

## Online rooms

- Online plugin and room panel: `src/plugins/online/index.js` `online`; `src/plugins/online/online-ui.js` `createOnlineUi`; `network.md`
- Room session (host, join, lobby, match): `src/plugins/online/online-session.js` `createOnlineSession`; `src/plugins/online/tune.js` `link`, `input`
- Room list and join codes: `src/plugins/online/lobby-directory.js` `createLobbyDirectory`
- Join by link (`/ABCDE`), Copy link: `src/main.js`; `net.js` `roomCode`; online `index.js` `joinByLink`; `online-ui.js`; `worker/index.js`
- Late joiner takes a bot's seat, leaver hands it back: moba `index.js` `seatLate`, `openSeats`, `removeParticipant`; `sim.js` `releaseBot`, `adoptBot`; `online-session.js` `onPeerJoin`; `link.js` `SEAT_TIMEOUT`
- Sticker names over heroes and in the room panel: `online/names.js` `playerName`; online `index.js` `showNames`; moba `index.js` `names`; `health-bars.js`
- Refresh mid-match gets the same seat back: `names.js` `seatKey`; `online-session.js` `onPeerJoin` (`left`, `prefer`); moba `seatLate`; online `tune.js` `room.rejoinFor`
- Stale build gets "New version, reload": `net.js` `BUILD`, `staleBuild`; `vite.config.js` `define`; `online-ui.js` `stale`; dev fake `/CODE?build=old`
- Link previews (og tags, key art `public/og.jpg`) and the room's own preview title: `index.html`; `worker/index.js` `roomPage`
- Result card Copy link (a line of the match plus the address bar's link, the room's when shared): moba `menu.js` `share`
- Transport (peer link, envelopes): `src/plugins/online/net.js` `Net`, `plainJoinData`; `src/plugins/online/link.js` `createLink`
- Remote players as replicas: `lane-replica.js`, `lobby-replica.js`; `src/plugins/dodgeball/replica.js`

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

`tune.js` (about 900 lines; presentation numbers are in `look.js`) is the file every thread re-reads; use `ast-grep outline` or these landmarks rather than reading it whole.

- `tune.js`: every number, one top-level key per system. `grep -n "^	<key>: " src/plugins/moba/tune.js` jumps to one. Sliders for it: `sliders.js`; new debug folders also go in `debugSections`.
- `sim.js`: `createSim` builds the world, heroes and pieces, wires the systems through one shared `ctx`, and runs `step` (the tick). Heroes are `sim.heroes[i]`; bodies come from `src/core/body.js` (`body.position`, `body.place(x, y, z)`). Each system is a `create…(ctx)` in its own file:
  - `sim.js`: `bodyAt`, `makeHero`, `swapHero`, `step`, `dispose`, `removeHero`, `releaseBot`, `adoptBot`, the public `api`
  - `targeting.js`: `enemiesOf`, `find`, `pick`, `nearestToClick`, `stickAim`: what a click or the stick lands on
  - `control.js`: `control` (a hero's tick: intents to orders, casts and movement), `strafe` (a dummy's)
  - `orders.js`: `plan`, `offPath`, `issue`, `attackAhead`, `steer`, `move`, `face`
  - `casting.js`: `casts`, `release`, `aimBasic`, `traitContext`, `cancelChannel`, `stepHeroState`
  - `combat.js`: `basicAttack`, `hit`, `bench`, `shove`, `dunk`, `respawn`, `dropIn`
  - `projectiles.js`: `stepShots`, `stepZones`, `expireBoards`, `launchShot`, `openCatch`, `throwCaught`, `resolveInterception`
  - `sim-snapshot.js`: `snapshot`; `sim-kit.js`: `SLOTS`, `ticks`, `yawOf`, `dirOf`
- Core engine: `src/core/` (`input.js`/`intents.js` controls, `proof.js` is `window.dt`, `body.js` bodies, `app.js` the clock and modes).
