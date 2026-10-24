# UI

Rules for every screen, learned by reviewing the game screen by screen with Oskar (2026-10-24). [look.md](look.md) sets the direction; this says how to apply it to anything you build. If the two disagree, this doc is the newer word.

## What a screen says

- **Never repeat what is already on screen.** A tooltip explains the thing you hovered; it does not echo its value. The clock's card never prints the clock.
- **Sentence first.** A card leads with one plain sentence that carries the numbers the decision needs ("Shoots an arrow up to 11 m that hits the first unit for 230 damage"). What it leaves out comes after as a short labelled fact (Cooldown 4 s), only if it adds something.
- **Keywords explain themselves.** A game term in a sentence (Slow, Stun, Momentum) is a keyword: ink, a little heavier, dotted underline, never a pill or a team colour. Hover, focus or tap opens its one-sentence definition, with numbers, from the one glossary (`glossary.js`); a card never redefines a term inline.
- **Cards are for the HUD.** A unit in the world shows itself; it gets no hover card and no second nameplate.
- **One question per card.** A tooltip answers what the player wants to know right now (when is the next wave, what's in it). Tuning numbers (growth per minute, late-game multipliers) belong in the manual or nowhere.
- **No jargon without a referent.** "Late game from 6:00" means nothing unless the game shows what changes at 6:00. Name the effect or cut the line.
- **Label every number.** "90 · 5.5 m · 1/s" is three values pretending to be one; give each its own label.
- **Team colour means a side, nothing else.** A level, a stat or a title is ink, never blue or red. Units wear their own colour with team colour as an accent; you are marked in cream (look.md, Units).
- **Plain words.** "Enemy takedowns" with "Your heroes downed" underneath reads backwards; say who did what to whom.
- **One reading order.** In a label and value list, the eye goes down the values; labels are quieter than values but never so faint that it zigzags back to decode them.

## Keep

- Titles inked on a watercolour brush stroke (death recap, result, pause). This is the front end's signature; new pages use it.
- Torn paper edges on sheets and cards (pause, result, Tab scoreboard, death recap). HUD chips and readouts stay smooth.
- The small painted buttons of the result page; every page's actions use them.

## Layout

- **Responsive first.** Tables and pages work from phone width to 2560 px; fix alignment, don't fix widths.

## How it is built

- **Primitives, not values.** Shared shapes are CSS custom properties, never numbers typed per component, so siblings can't drift (the HUD and front end had 26 `border-radius` values and six border widths). One radius per role (pill, card, tile); one ink line per weight from look.md, thin for readouts and cards, thick for pressables and units; one shadow for what floats and one offset shadow for what you press. A tooltip, a pill and a tile are each one class used everywhere; a variant changes a token, not the recipe.
- **Caps only for a few words.** A sentence in capitals reads as shouting; hints and instructions are sentence case.
- **Row rules whisper.** Lines between rows of one list are faint guides; only the rule under a heading is full ink.
- **No grey tracked uppercase.** Dimmed, letter-spaced small caps read as generated filler. Labels are sentence case in the ink colour; hierarchy comes from size and weight. Let long values wrap rather than shrink or truncate.
- **No one-sided borders.** A coloured stripe on one edge of a card is a template tell. A card's edge is the same all the way round.
- **Shadows mean something.** Offset shadows are for things you press; a tooltip floats with a soft shadow, never an offset one.
- **One text style per role.** No italic footnotes or extra voices; a note is set like the summary.
- **Cards don't cover their source.** A tooltip opens beside what you hovered, never over it.
- **One layer order.** Readouts, cards and overlays each have a fixed stacking level as a token; nothing peeks out from behind another readout, and two readouts never share a spot.
