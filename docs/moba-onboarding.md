# First-match guidance

[onboarding.js](../src/plugins/moba/onboarding.js) owns the match's floor arrow, hero ring, You sticker, timer labels and off-screen Ball pointer. Guidance lives in the world, not in sentences: no objective banner, XP tip, Ball tip or level text. `index.js` connects it to facts and presentation. The camera opens on the local hero at the normal match scale and follows until a player pans; onboarding never changes its lens. Guidance reads rendered positions and interpolated tick time. It never orders a hero, pauses play or changes the simulation.

The floor arrow points toward the enemy and disappears after walking, excluding death and respawn jumps. The hero's ring stays visible while alive; the You sticker returns in a crowd. The timer labels introduce the two countdowns. A local-team level pulses the hero's ring, with a dedicated sound and an HP-gain flash. The Ball pointer follows loose, carried and flying Ball positions and uses the carrier's team colour; carrying, it points at the enemy tower or core to throw at. All callouts are relative to the local participant.

Values live in `tune.onboarding`. Geometry and sticker layout apply on match restart; lifetimes, movement distance, crowd detection and projected positions read live. Arrow fading uses opaque stipple, with its own print height and device-pixel-sized cells.

For fresh-entry proof, wait for both the onboarding root and the absence of `.moba-front`: the match and its HUD are already mounted during loading. A screenshot that only waits for `.moba-onboarding` can still capture the crane's establishing shot. Park the pointer while paused before capture, then resume to trace real orders; an edge-band pointer can detach the camera. Use a frozen production build, not the shared dev server.
