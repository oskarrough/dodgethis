# Changelog

## [Unreleased]

- Added park, sunset, and night-gym scenery for the three difficulties.
- Added quiet music that follows the hub, combat, last-player tension, and results, with a pause-menu toggle.
- Added a brief slowdown on local eliminations and optional controller rumble for impacts, dashes, and perfect shots.
- Bots now visibly draw their bows before releasing a shot.
- Reduced HUD clutter and kept diagnostics behind the debug URL option.
- Batched portal geometry and removed per-frame material discovery to reduce rendering overhead.

- Bow shots now land at the cursor within available reach, with separate target and touchdown markers.
- Characters now step, lean, and draw their bows, with quiet footsteps and a fuller dash sound.
- Dash accepts a tap just before cooldown ends; aiming and collision shapes remain stable.
- Escape or controller Start pauses the match. Resume, retry, next round, and hub navigation share short transitions, and the hub remembers the last difficulty.
- Added bleachers, service lines, and a match scoreboard around a quieter court palette.
- Completed rounds can no longer be replayed to score the same point twice.

- Simplified rendering and spread out AI planning work in crowded matches.
- Added brief court scratches for dashes and directional marks where shots land.

- Fixed a crash when a rendered player was eliminated or fell off the court.

- Reduced crowded-match slowdowns with safe player spawns and cheaper collision queries.
- Added shadows for the full roster in large matches with a single batched draw.
- Added seeded match links, pause and single-step controls, and frame timing reports for reproducing bugs.
