# UI

Rules for every screen, learned by reviewing the game screen by screen with Oskar (2026-10-24). [look.md](look.md) sets the direction; this says how to apply it to anything you build. If the two disagree, this doc is the newer word.

## Say less

- **Never repeat what is already on screen.** A tooltip explains the thing you hovered; it does not echo its value. The clock's card never prints the clock.
- **One question per card.** A tooltip answers what the player wants to know right now (when is the next wave, what's in it). Tuning numbers (growth per minute, late-game multipliers) belong in the manual or nowhere.
- **No jargon without a referent.** "Late game from 6:00" means nothing unless the game shows what changes at 6:00. Name the effect or cut the line.

## Labels

- **No grey tracked uppercase.** Dimmed, letter-spaced small caps read as generated filler. Labels are sentence case in the ink colour; hierarchy comes from size and weight, not from greying and spacing out.
- Wrapping is fine. Let a long value wrap rather than shrinking or truncating it.

## Primitives, not values

Shared shapes are CSS custom properties, never numbers typed per component, so siblings can't drift. Today the HUD and front end use 26 different `border-radius` values and six border widths.

- One radius per role: chip/pill, card, tile.
- One ink line per weight from look.md: thin (readouts, cards), thick (pressables, units).
- One shadow for things that float (cards) and one offset shadow for things you press.
- A tooltip, a pill and a tile are each one class used everywhere; a variant changes a token, not the recipe.
