# Code map

Where things live in `src/plugins/moba/`, so you read one file instead of grepping the folder. `sim.js` (2300 lines) and `tune.js` (1400) are the two files every thread re-read; use the landmarks below with `sed -n` rather than reading them whole. Line numbers drift, so find a landmark with `grep -n "function <name>" src/plugins/moba/sim.js`.

- `tune.js`: every number, one top-level key per system (`map`, `lobby`, `bots`, `hud`, `waves`, `minions`, `damageNumbers`, `hero`, `heroes`, `attack`, `gloveSlap`, `toss`, `catch`, `dive`, `ball`, `sounds`, `juice`…). `grep -n "^	<key>: " tune.js` jumps to one. Sliders for it: `sliders.js`; new debug folders also go in `debugSections`.
- `sim.js`: one `createSim` closure. `makeHero`, `issue` (right-click orders), `steer`/`move`, `casts`/`release`, `control` (per-tick hero logic), `basicAttack`, `hit` (damage), `respawn`, `launchShot`, `step` (the tick), `snapshot`. Heroes are `sim.heroes[i]`, bodies come from `core/body.js` (`body.position`, `body.place(x, y, z)`).
- `heroes.js` + `ability.js`: hero kits. `skillshot.js`: shot shape. `ball.js`/`ball-bots.js`/`ball-view.js`: the Ball.
- Bots: `bots.js` (entry, difficulty) → `lane-bots.js` (where to walk), `fight-bots.js` (who to hit), `dodge-bots.js`, `ball-bots.js`. `agent-match.js` runs a headless match for `bun run simulate`; `agents.js`/`scripted.js` are the agent protocol.
- Maps: `maps/{overthrow,flagfall,lobby}.js` data, `maps/index.js` registry, `maps/paths.js` lanes as paths, `map.js` + `match-terrain.js` build the ground and walls, `obstacles.js` colliders, `path.js` planner, `lane.js` minions and towers, `windbreak.js`/`bollard.js`/`flagfall-water.js` Flagfall props.
- Match view: `view.js` (scene root), `hero-view.js`, `lane-view.js`, `skills-view.js` (telegraphs), `damage-numbers.js`, `health-bars.js`, `feedback.js` (facts → sound, popups, shake), `follow.js` + `camera-controls.js` (camera), `minimap.js`, `hud.js` + `hud.css`, `tooltip.js`, `menu.js` (pause), `recap.js`, `onboarding.js`.
- Lobby: `lobby.js` (the screen: ready, back, hero pick), `lobby-state.js` (seats, roster), `lobby-props.js`, `lobby-floor.js`, `lobby-magnets.js` (difficulty), `lobby-heroes.js`, `lobby.css`. `dt.game.lobby.sim` is its sim.
- Splash and transitions: `front/` (`index.js` splash tiles, `backdrop.js`, `descent.js` the crane, `tune.js` its numbers).
- Online replicas: `lane-replica.js`, `lobby-replica.js`; the transport is `src/plugins/online/`.
- Entry and wiring: `index.js` (mode registration, `window.game.moba`), `setup.js` (`?mode=moba&…` params), `match.js`.
- Whole-app shell: `index.html` holds the splash and shell CSS (stickers, mute, online panel); `src/core/` is the engine (`input.js`/`intents.js` controls, `proof.js` is `window.dt`).
- Docs by question: look `moba-look.md`, lane `moba-lane.md`, Flagfall `moba-map-2.md`, kits `moba-heroes.md`, lobby `moba-lobby.md`, splash `moba-front.md`, recap `moba-recap.md`, simulation and bot experiments `verification.md`.
