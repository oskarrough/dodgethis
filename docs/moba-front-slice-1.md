# MOBA front slice 1 verification

`?mode=moba` opens the mode screen. Practice cuts directly into the existing MOBA match; Back, Esc and pad B return to the dodgeball hub. Hero select, loading and post-match remain outside this slice. The implementation is in [front/](../src/plugins/moba/front/); the requirements are in [moba-front.md](moba-front.md).

The menu has four pointer-parallax SVG planes, each bounded to 110% of the viewport, with pixel-sized hatching. Two stacked skies crossfade by opacity. Parallax holds still during the crossfade; reduced motion disables both motions. Model-free screens gate WebGL draws without stopping input polling. Run-scoped style presets restore on disposal.

Acceptance was driven against the production preview with synthetic keyboard events and a mocked Gamepad API, plus browser mouse clicks. All three devices started Practice and independently backed out to the hub. A held pad confirm across the cut left the hero with no attack or cast. Practice was pad-focused in screenshots at 1440 × 900, 1280 × 720 and 2560 × 1080.

The idle recording contains a full 10-second hold: zero Layout, Paint, UpdateLayoutTree or RasterTask events, zero WebGL draw calls, and no active animations. The sky recording used 2560 × 1440 at actual browser DPR 2. Raster work occurred at animation setup and teardown, not on each crossfade frame; four SVG planes measured 2816 × 1584. The fixed dodgeball court-and-players frame was byte-identical after a thin-line, hatch and alpha preset-and-restore round trip.

Artifacts are in BB thread storage for `thr_2vvwz379bt`: `front-*-pad.png`, `front-idle-trace.json`, `front-sky-dpr2-trace.json`, `front-flow-results.json`, `front-trace-summary.json` and `style-roundtrip-result.json`. The browser drivers are `verify-front.mjs` and `style-roundtrip.js` in the same directory. The unit checks cover scoped render gating, preset validation/restoration, shared focus, Tab-only navigation, pad back edges and wind cleanup.

Josefin Sans light and regular are static Latin WOFF2 subsets, preloaded from [public/fonts/](../public/fonts/), with the upstream OFL included. Darumadrop remains the display font. `bun run check` checks formatting without rewriting the checkout.
