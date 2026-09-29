# MOBA look

Art direction for `?mode=moba`. [moba-lane.md](moba-lane.md) lists what exists; this says how it should look. Where they differ, this doc wins. The medium is fixed: the comic-sticker pass in `core/stylepass.js`, with stylised primitives, no downloaded assets, and DOM text outside WebGL.

**At a glance.** A skillshot game looks great when you can read the whole fight in half a second: the ground stays quiet, units are loud, and every telegraph is the exact shape of its hitbox. In this style that splits the world in two. The ground is _printed_: flat, low contrast, no shading, marks in ink. Anything that can hurt you or be hurt _stands up_: shaded, inked, and team coloured. Saturation is a budget: team red and blue plus ammo gold are the only loud colours, and scenery never uses them. Read from above: the camera sees roofs, hats and the floor under a unit, not faces.

**Rendering contract.** `makeStyleMaterial` writes opaque role IDs and ignores opacity. So anything translucent (tells, domes, the fill of a tint) is a plain colour material in the forward layer with `depthWrite = false`, or else opaque stippling. Blending an ID turns it into a different role; that's why the road draws orange today.

## Ground and lane markings

- The road is a new `road` role, warm paper a notch darker than `cream`. The plaza and the pillar caps stay cream, so friendly tells carry their own ink keyline anyway (see VFX).
- Show ownership with printed kerbs along both road edges: team colour and cream alternating in 1 m blocks, running out to cream at the plaza. They replace the transparent team tint. The bases get diagonal team hatching, so home and healing read without a label. Each structure stands on a printed team pad (radius + 0.5 m, ink rim). The flanks keep `courtShade` with sparse dots, and the plaza keeps its dodgeball print. Keep ground contrast within about 15% value, except the centreline and kerbs.
- Hedges use the new `hedge` role: a deeper, bluer green than the flanks, with a scalloped top, so cover reads as a wall against shots. Pillars stay `scenery` with cream caps.

## Structure silhouettes

Tell the three tiers apart from above. Walls are `scenery`, and team colour goes only where the camera looks most: roofs, flags and the crystal.

- **Tower:** a round drum, a tapered shaft and a team cone flag, 4 m tall; from above, a circle with a point. **Fort:** an octagonal drum with crenel teeth and a team banner, 5 m; from above, a gear. **Core:** a faceted team crystal over a stepped pedestal, 7 m, spinning slowly and bobbing 0.2 m; from above, a diamond.
- **Damage:** two stepped states, shown only by shape. At 66% and at 33%, a new ink crack appears (a split in the geometry, so the normal edges ink it for free), and towers and forts lean another 3°. Never darken a shared role.
- **Occlusion:** at the default camera a 7 m core covers roughly 4.4 m of ground behind it. Ground tells in the forward layer ignore depth, and units behind a structure draw as an ink keyline silhouette in the forward layer (depth test `Greater`).
- **States:** invulnerable shows a dashed cream dome in the forward layer; silenced shows crossed cream tape over the gun. Dead leaves three flat, inked rubble chunks on the pad, with the flag lying beside them.

## Units at 20 m

- A size ladder: minions at 0.6, heroes and brutes at 1.0. Every unit stands on a flat team foot disc with an ink rim; the HotS trick survives any pose. Your own disc gets a cream outer ring.
- Minion roles show in one prop visible from above: shield, stick, cone hat, and a block helmet for the brute. Minions are instanced by team and prop. Their hit flash goes per instance, in `instanceColor`, because `juice.flash` works per material and would light up the whole wave.
- Heroes always show an HP bar with 200 HP ticks. Minions and structures show a short bar only once damaged. Bars are always the team colour, never green. Check in grayscale: outline and foot disc alone must separate hero, minion and structure.

## Ability VFX, hits and deaths

- **Telegraph rule:** drawn on the ground at exactly the hitbox size. Yours is a cream fill with an ink keyline; an enemy's is a red outline with a 30% fill. Every enemy attack or cast shows its tell for at least 0.3 s (build rules). The sparring dummy keeps its 0.4 s (`tune.dummies.tell`). Bot heroes hold aim for that long before they cast, the way a player does, so the tell reports a real delay and the renderer adds none.
- **W** adds two ink speed lines at the start and a scalloped ring where you land. **E** lands with five inked arrows jabbing the ground for 0.4 s and a cream shockwave ring. Basic attacks and tower shots are small team orbs. A tower's tether is a dashed ink-and-team line from its gun to the target; its range ring is dashed ink printed on the ground.
- **Hit:** the target flashes flat cream for 70 ms, and an eight-point ink starburst appears at contact, sized by damage bucket (basic, Q, E, Ball). No hit-stop and no knockback. Pooled DOM numbers show only the damage you deal, 12 at most, fading over 0.6 s.
- **Deaths:** a minion pops into three paper scraps and an ink puff in 0.3 s and leaves no corpse. A hero takes the out pose, then core `death.js`. A structure slumps into rubble over 0.5 s with team confetti. Effects use pooled slots: 64 particles and 16 floor marks, recycled oldest first and cleared on restart.

## UI skin

- The HUD is cream stickers with 3 px ink borders and hard offset shadows, like the slots already have. Cooldowns are an ink sweep plus whole seconds and a gold pop when ready (built). Your HP is a sticker bar above the slots, matching the world bar's colour and ticks.
- Top centre is a scalloped clock sticker, with the next wave or Ball underneath. Beside it, each team gets a row of tower, fort and core icons in inline SVG, drawn in the same silhouettes and greying out as they fall. That row is the lane map. A tooltip is a cream card on hover or focus: the name in `--ui-font` and one line of numbers.

**Budget.** 60 fps on a mid laptop, measured as the p95 of the whole frame (CPU plus GPU) in a crowded fight at 2560 × 1440: six heroes, two waves and a tower. The pass already caps DPR at 1.5. If the frame goes over 16.7 ms, drop DPR to 1.0 first, then halftone on units, then the minion props. Merge static geometry per role, instance minions, and skip shadow maps; a shadow is a printed ink ellipse. The new palette roles are `road` and `hedge`, and nothing else.

## Build order

One thread per slice. Each passes `bun run check` with the dodgeball characterization unchanged, restarts with every pool emptied, and holds even 144 Hz pose steps. Judge the look from default-camera screenshots at 1440 × 900.

1. **Ground** (no gate): `road`, `hedge`, kerbs, hatching and pads. Screenshots: spawn, a tower spot, the plaza, and a held Q line on both the road and the plaza.
2. **Units** (after the lane's waves slice): foot discs, your ring, instanced props, per-instance flash, bars. Screenshots: six heroes and two waves at mid, in colour and grayscale. Test: only the struck minion flashes.
3. **VFX and hits** (after the scripted Q hero): the rendering contract, tells, E impact, tethers, starbursts, pops. Screenshots: a mid-cast 3v3 frame, and an enemy Q tell beside yours.
4. **Structures** (after the full lane): silhouettes, cracks, occlusion, dome, tape, rubble. Screenshots: each tier at 100%, 66%, 33% and dead; invulnerable; a hero and Rain behind each tier.
5. **UI skin** (after the HUD clock): HP sticker, clock, structure rows, tooltips. Screenshots: the full HUD at 1440 × 900 and 1280 × 720, with a tooltip open.
