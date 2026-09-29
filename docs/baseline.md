# Pre-refactor baseline

Recorded 2026-09-28 on `main` at d43db09 (only uncommitted docs; `src/` untouched). Dev build via `bun run dev`, driven with `agent-browser`.

- `bun install`: 66 packages, ok. `bun run check` (oxlint, oxfmt, bun test): pass, 190 tests in 25 files, 0 fail.
- Solo: hub, then digit `1` (portal) started a one-human/one-bot round. Move, dash (about 2 m in 200 ms), bow shot and pickup (held arrow 21 → null → 27) all worked. Elimination seen: the bot shot the human, round over, B 1–0.
- Solo not proven: a player shot eliminating the bot (pixel aiming missed twice; the online run covers a hit). The portal was entered with the digit key, not by walking.
- Online: host created a private lobby (THDTA) over public PeerJS signaling; guest joined by code, took Team B, settings disabled for the guest. Host's bow shot eliminated the guest; both tabs showed identical units and A 1–0 at round over. Next round started and a guest key press moved the guest on both tabs. Public "find a game" was not run.
- Already odd: `agent-browser keydown/press` never reaches the game (no `code` on its key events). Keys were sent as synthetic `KeyboardEvent({code})` on `window`; the mouse was real.
- Already odd: one long-lived solo tab, after `game.hub()` and `tune.ai.enabled=false`, rendered a tiny then blank court. A fresh tab did not reproduce it. Cause unknown.
- Port 5173 was taken by another process; the dev server ran on 5174.
- Screenshots: `/home/oskar/.bb/thread-storage/thr_aj9kev8pki/` (`solo-*.png`, `online-*.png`).
