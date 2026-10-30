# Kappa and Lasso

Kappa keeps her terracotta shell plates, cream catching hand, separate thumb, finger bumps and two short horns. The approved concept supplies the broad worn shell and heavy brow, rather than its camouflage or crab claw. The belt remains her sole permanent team accent.

Lasso's two generated studies are `lasso/hide.webp` and `lasso/enamel.webp`. Both were inspected. The enamel study wins: its broad pale outer ridge reads more clearly at match size than the hide study's many shoulder plates. The implementation uses muted violet enamel, an open crescent and hooked tip, with a pale ridge and an ink groove around the team-coloured weight. No generated image is used as a game asset.

The shared generation brief is in `lasso/prompt.md`. The hide variant requested a dark driftwood crescent with segmented cream shoulder plates and a blue weight. The enamel variant requested a muted violet enamel crescent with a continuous pale stone outer ridge and a red weight. Both requested open right-side gaps, a heavy brow, small cream eyes, no additional props, and three-quarter, overhead and match-size views.

`proof/lineup.webp` is a real Overthrow match-camera capture with both heroes, frozen for comparison. The shell plates, open crescent and team discs read distinctly. It is a static silhouette proof, not an ability or hero-select interaction test. Existing animation hooks and gameplay contracts were retained.

The final full check passes. The coordinator authorised the two additional files `src/core/style.js` and `src/modes/moba/heroes/lasso/lasso.js`: the palette now has `enamelViolet` (`#9b8ca8`), assigned to Lasso. The style pass derives its role IDs, shader array length and colour uniforms from the palette, so no renderer changes were needed. The updated screenshot was inspected and shows the violet roof, smaller crescent and wider team weight. Camera-facing sides remain dark under the existing shared lighting. Kappa's palm is thinner, her finger bumps taller and her thumb gap wider.
