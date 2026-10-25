# The cast in ink

[Cast sheet](cast-sheet.png) · [Six heroes on Overthrow](fight-frame.png)

The sheet keeps the eight primitive identities and gives their surfaces weight: cut planes, worn edges and a small face sheltered beneath a brow. The fight frame puts six of them back onto the supplied Overthrow screenshot, at its match camera, so their detail has to survive play distance.

## Materials

| Hero      | Treatment                                                                                   | Existing team accent      |
| --------- | ------------------------------------------------------------------------------------------- | ------------------------- |
| Ibis      | Sea-teal hide and cloth, a short angular beak, three reed arrows and a worn quiver.         | Fletchings                |
| Kappa     | Broad terracotta shell planes and a cream hide glove with squared fingertips and two seams. | Belt                      |
| Carambola | Cream cloth around the existing triangle, stone brow and beak, chipped wooden paddle.       | Waist band                |
| Mandador  | Painted wooden board with a few deep seams and a chipped top edge.                          | Speaking-trumpet          |
| Lasso     | Weathered hide along the open crescent, one brow at one tip, plain worn hide at the other.  | Weighted yo-yo            |
| Oolong    | Driftwood hexagonal drum, broad bark seams, cloth sash and chipped enamel jug.              | Sash                      |
| Undine    | Faceted sea-teal enamel with an ivory chip band and a hard spout lip.                       | None beyond the foot disc |
| Salvia    | Pale bark and cloth on the existing thin bar, a shallow sage emblem and worn corner.        | Speaking-trumpet          |

Every hero keeps the existing team foot disc as well as the single accent above. Red versions replace that accent and disc only. The sheet uses blue throughout to make material differences easier to judge.

## Build limits

These paintings are material and edge targets, not new dimensions. The current view meshes, their bounds, disc sizes and collision remain authoritative. The enlarged views explain the construction; the small copies and fight frame judge readability. Mandador and Salvia remain the current thin bars, Ibis the slim capsule, Lasso the open crescent and Oolong the low hexagon. No added heads or limbs may enlarge their envelopes.

Keep wear to two or three broad chips or seams per hero. Prefer bevelled or notched existing geometry and merged relief over piles of small meshes. Keep every new part in the ink pass with the existing role palette. Facial marks are matte navy and cream; they do not glow. Existing props must retain their animation rigs.

## Build order after direction is judged

1. Ibis and Kappa: establish the cut brow, restrained eyes, edge chips and the worn glove. Check the match view on Overthrow.
2. Carambola and Lasso: preserve the triangle and open crescent; add broad wear and a hooked crescent tip. Check again.
3. Oolong and Undine: keep the drum and jug silhouettes; chip the jug lip and cut the enamel spout. Check again.
4. Mandador and Salvia: use surface carving and cloth relief to distinguish the shared bar envelope. Check again, then the full cast and triangle count.

## Painting record

Generated with the built-in image tool through the art prompt script. The initial sheet and two corrections established the final sheet; the fight frame took one generation. Source game screenshots and private reference art remain in Arbe's supplied folder. The saved prompts record the direction and corrections. No hero source files have changed in this phase.

The sheet template appended front/side views and a no-text rule, contrary to this brief's match-camera cast and named materials. The prompt overrides those instructions explicitly. Five attachments covered all eight existing shapes because Mandador and Salvia currently share their envelope; the beast and Barr references supplied dignity and material direction in words. The fight prompt attaches both references alongside the game, sheet and approved map anchor.

## Built cast

[Match-distance fight view](fight-built.png) · [All eight, close row](lineup.png)

Every hero now carries the same navy brow and two cream slits, tilted toward the upper plane so the face survives the match camera. Ibis has a notched crest and faceted hide; Kappa has a bevelled shell, pale roof and two short horns. Carambola keeps the beak and paddle with broad cloth seams; Lasso gains a hooked tip and a worn hem. Oolong has a chipped enamel jug lip; Undine has cut enamel planes and a pointed spout. Mandador and Salvia show painted wood beneath their seams; Salvia has a split crown and a sage sprig.

The fight view stages six heroes at the painted frame's Overthrow position and match-camera projection; Ibis holds a draw pose. The close row uses the same pitch, moved nearer, with all eight facing the viewer. Both are real game screenshots at 1600 × 900. These are presentation checks, not a recorded combat match.

The one-off geometry audit compared each dressed hero with revision `85b1b6b66c844a58008738fb78d978d9f80b1dc7`: all eight foot-disc radii are exactly unchanged. One of each hero totals 6,938 visible triangles versus 6,756 before, an increase of 182 (2.7%). Visible hero meshes rise from 87 to 120; repeated facial and seam geometry is merged by material. No collision, simulation, team-accent or animation code changed.

The final Overthrow morning shot reports 277,821 triangles and 158 calls. Browser errors are empty. `bun run check` and `bun run test` pass (271 passed, one skipped).

## Salvia's own silhouette

[Lineup](salvia/lineup.png) · [Lineup in grey](salvia/lineup-gray.png) · [Fight view](salvia/fight.png) · [Fight in grey](salvia/fight-gray.png) · [Hero select](salvia/select.png)

The original sheet's shared board identity was rejected in the follow-up. Salvia is now a round herb-gatherer in worn cream cloth, with a pointed sage hood and a bark satchel full of leaves. Her team accent is the small satchel clasp. The broad brow and cream eyes stay in the cast's family. Her hand and satchel rise for Mend; the beam follows the sage bundle. Mandador keeps the painted board, with a hollow flared speaking-trumpet and rolled rim whose mouth moves with the cone.

Salvia's foot-disc radius remains exactly 0.8219100913308282 m; her collider is untouched. Her visible geometry drops from 644 to 530 triangles. Mandador rises from 604 to 616. Both silhouettes separate in grey at match distance. Hero select was checked by switching from Salvia to Mandador and back. Cast origin and reset checks pass, browser errors are empty, and check and test are green (271 passed, one skipped). The earlier paintings and build record above remain as the history of the first direction.
