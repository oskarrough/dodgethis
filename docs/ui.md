# UI

Rules for every screen, learned by reviewing the game screen by screen with Oskar (2026-10-24). [look.md](look.md) sets the direction; this says how to apply it to anything you build. If the two disagree, this doc is the newer word.

## What a screen says

- **Never repeat what is already on screen.** A tooltip explains the thing you hovered; it does not echo its value. The clock's card never prints the clock.
- **One question per card.** A tooltip answers what the player wants to know right now (when is the next wave, what's in it). Tuning numbers (growth per minute, late-game multipliers) belong in the manual or nowhere.
- **No jargon without a referent.** "Late game from 6:00" means nothing unless the game shows what changes at 6:00. Name the effect or cut the line.
- **One reading order.** In a label and value list, the eye goes down the values; labels are quieter than values but never so faint that it zigzags back to decode them.

## How it is built

- **Primitives, not values.** Shared shapes are CSS custom properties, never numbers typed per component, so siblings can't drift (the HUD and front end had 26 `border-radius` values and six border widths). One radius per role (pill, card, tile); one ink line per weight from look.md, thin for readouts and cards, thick for pressables and units; one shadow for what floats and one offset shadow for what you press. A tooltip, a pill and a tile are each one class used everywhere; a variant changes a token, not the recipe.
- **No grey tracked uppercase.** Dimmed, letter-spaced small caps read as generated filler. Labels are sentence case in the ink colour; hierarchy comes from size and weight. Let long values wrap rather than shrink or truncate.
- **One layer order.** Readouts, cards and overlays each have a fixed stacking level as a token; nothing peeks out from behind another readout, and two readouts never share a spot.
