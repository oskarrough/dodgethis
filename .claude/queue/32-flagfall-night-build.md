After: the Overthrow day-isle build lands (it shares match-terrain.js and map.js).
Goal: restyle Flagfall's match to docs/pages/flagfall-night/ (02-fight.webp): moonlit violet isle, two lanes behind hedges, cliffs into night cloud, glowing Dunk gaps, a big moon. Fix the concept's flaw in code: the court is a clear value step lighter than the void, team blue stays distinct from the violet, flowers actually glow. Rules: docs/moba-look.md five-point block. Reuse what the Overthrow build made (sky, haze, light, structures) with night values.
Done means: a Flagfall match looks like that frame with a lighter court, layout, colliders, Dunk and gameplay unchanged.
Evidence: one crowded-fight screenshot at 1440 beside the concept, via `bun run review`.
Constraints: Overthrow untouched; commit locally after each slice.
