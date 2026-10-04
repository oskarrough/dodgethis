# First-match guidance

[onboarding.js](../src/plugins/moba/onboarding.js) owns the match's introductory stickers, floor arrow, hero ring and off-screen Ball pointer. `index.js` connects it to facts and presentation; `follow.js` accepts its opening-frame inset. Guidance reads rendered positions and interpolated tick time. It never orders a hero, pauses play or changes the simulation.

The goal appears above the lane. The floor arrow disappears after walking, excluding death and respawn jumps. The hero's ring stays visible while alive; the You sticker returns in a crowd. The timer labels introduce the two countdowns. Passive team XP gets one silent explanation; a local-team level gets a hero-centred pop, a dedicated sound and an HP-gain flash. The Ball pointer follows loose, carried and flying Ball positions and uses the carrier's team colour. All callouts are relative to the local participant.

Values live in `tune.onboarding`. Geometry and sticker layout apply on match restart; lifetimes, movement distance, crowd detection, frame inset and projected positions read live. Arrow fading uses opaque stipple, with its own print height and device-pixel-sized cells.

For fresh-entry proof, wait for both the onboarding root and the absence of `.moba-front`: the match and its HUD are already mounted during loading. A screenshot that only waits for `.moba-onboarding` can still capture the crane's establishing shot. Park the pointer while paused before capture, then resume to trace real orders; an edge-band pointer can detach the camera. Use a frozen production build, not the shared dev server.
