---
name: hero
description: Make a new dodgethis hero, or rework how an existing one looks or plays, from the idea to a hero that reads at a glance and feels good in the hand. Use whenever a task adds a hero, redesigns one's look or kit, or says a hero is hard to read, samey or sluggish.
---

# Hero

A hero is done when a player can name them from the match camera at a glance and their kit answers the hand at once. A handsome concept sheet proves neither. This is the path; the other skills do the work at each step.

1. **Design.** Write the hero's row in `docs/heroes.md`'s silhouettes table: role, shape from above, one prop, the one team-coloured part. No two rows may share a shape or a prop. For a rework, check the row still holds.
2. **Concept.** Two studies through the `art` skill; skip this for a fix that keeps the shape and the prop. Pick one and say why in a sentence, then name the two or three shapes that must survive at match size.
3. **Build** the hero in `src/modes/moba/heroes/<id>/`.
4. **Read.** In a worktree, `bun install` once and render your own checkout with `DEV_AGENT_PORT=<a free port>`; the shared dev server may be serving someone else's code. Run `bun run shot overthrow --lineup --read` and look at `read.png`: the whole cast in colour, then in grayscale at match size. Fix the build and shoot again until the new hero is clearly their own shape in grayscale.
5. **Feel.** Run `bun run cast <id> --clip` through the `ability-feel` skill, with the basic attack and at least one ability. Every press should answer on its first frame. To look at the clip, tile it into one image: `ffmpeg -i cast.webm -vf "fps=4,scale=480:-1,tile=4x3" -frames:v 1 sheet.png`.
6. **Second eye.** Have a different model critique `read.png` and the clip sheet: `bb thread spawn --project $BB_PROJECT_ID --parent-self --provider codex --prompt-file -` with the image paths and what to judge, then read its answer with `bb thread output <id>`. Fix one round of what it finds, and file the rest in Oskar's inbox (`bb tasks create --project INBOX`) rather than dropping them.

## What has gone wrong before

- A hood that read well on the sheet collapsed into a flap over one shoulder in game, because the cream body showed through around it. Make the hero's own colour cover the crown, the part the camera sees most.
- A long beak pointed through its own health bar when the hero faced away.
- Team colour on a small part seen edge-on goes pale. Give it a face the camera can see; on a prop that turns with the hero, put the accent on top, not on a side.
- The image generator adds red scarves, blue sashes and gold fittings. Leave them out of the build.
