# Salinas

Close uses warm sandstone and broad brine ledges; it reads too close to Altamesa.
Bold uses bleached salt shelves, spare iron windpumps and violet sunset bands; this is the build target.

The brine in the painting leans too red. The build uses pale apricot and dusty rose, kept clear of team red. The court stays lighter than the painted target, with muted mineral decals and thin salt joints.

## Build order

1. Bootstrap Flagfall's two lanes at 80% length. Keep the lanes 7.5 m wide so full-sized heroes can pass full-sized fort colliders. Smoke-test movement before painting.
2. Bind low sunset light and haze to the live tune. Print long violet shadows; keep the cliff clear near the rim.
3. Use carve.js for salt-stone walls, caps and plinth relief. Use rim-dress.js with an optional pale cap role for white salt tops over mauve columns.
4. Batch windpump frames, fan blades, sheds, salt heaps and brine pans outside the rim. Smaller shelves cascade below the larger working platforms.
5. Draw a large low cream sun with glows(), warm cloud bands and distant hazed salt isles. Keep the sun in the void visible at the shipped camera.
6. Use floor-print.js with the painted salt tile and floor-decals.js with the keyed sheet. Skip cell 8: its incomplete rosette still reads as a ring. No floor glow.

## Dry-run observations

The map skill omitted the bootstrap needed to take a new map's first screenshot, and shrinking layout metres while keeping unit and structure radii fixed can close every navigable lane. Both are now documented. The first Salinas smoke failed; widening its lanes restored all bot movement without changing shared navigation.

The kerb hook has no height argument. The caller supplies layout and the map must derive its height. The first stone shot failed to boot until this was corrected; the shot tool retried successfully.

The leftovers checker reads tracked files. Newly created source files must be snapshotted with jj status before the checker can see their readers. This produced a false unread-workings report during the rim pass.

The art prompt tool has no decal kind. Its sheet kind appends character-sheet instructions, so the decal recipe now uses an explicitly overridden inlay brief. The keyer needed fuzz 40 for the faint mineral scuffs. A generated ring-like cell was skipped despite the prompt forbidding rings.

Mapped pale floor tiles need enough floor.vary to reveal their joints. The sunset disc must write depth or the cloud plane can paint over it. Both corrections are in the skills.

Only rim-dress.js changed outside Salinas: an optional cap role splits upward ruin faces into a pale batch. Existing maps retain their original code path.

## Timing

UTC checkpoints from this run; intervals include work and checks, not just execution time. Preparation before the first recorded checkpoint is not included.

| Stage                                             | Start    | End      | Wall time |
| ------------------------------------------------- | -------- | -------- | --------- |
| Bootstrap, targets, decals, tile and movement fix | 08:40:16 | 08:49:35 | 9m 19s    |
| Light and haze                                    | 08:49:35 | 08:50:07 | 32s       |
| Carved stone and rim                              | 08:50:07 | 08:53:13 | 3m 06s    |
| Sky, floor, terrace revision and final comparison | 08:53:13 | 08:59:49 | 6m 36s    |
| Existing-map rechecks and final validation        | 08:59:49 | 09:03:08 | 3m 19s    |

Two target generations, one decal generation, one tile generation. One light screenshot pass, one stone pass with an automatic boot retry, one rim pass and two sky/floor passes. The image tool completed each generation in 17–26 seconds.

Per-step token consumption was not exposed by the available BB CLI. Its reported context occupancy is not consumption and cannot supply an honest token-cost measurement. A future measured run needs per-call input/output/cache usage from the provider or a usage export; this is the remaining instrumentation gap in issue #131.

## Handoff

The final Salinas start frame draws 135,402 triangles in 169 calls, with no browser errors. Altamesa (322,876 triangles), Flagfall (242,705) and Overthrow (273,669) were re-shot and inspected after the shared rim extension; their existing appearance is preserved.

`bun run check` passed. `bun run test` passed with 271 tests passing, one skipped and none failing, including all map movement smoke tests. The work remains uncommitted for Arbe's review.
