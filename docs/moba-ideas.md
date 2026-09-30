# MOBA ideas

Pitches for `?mode=moba` beyond [moba-lane.md](moba-lane.md). Nothing here is planned yet. The rule for picking: it has to come out of dodgeball, the playground or a cartoon, and it has to make a moment somebody tells a friend about.

## Build these first

### 1. Catch the Ball [small]

Dodgeball's oldest rule: catch it and the thrower is out, and one of yours comes back in. Right now the lane doc says the defender's only answer to a Ball throw is a dodge. Give them a second one.

- A catch key (F, pad Y). Pressed in the last 0.2 s before the Ball reaches you, facing it within 60°, you're holding it instantly, no 0.75 s pickup. At 18 m/s that's a 3.6 m read, and a whiff locks the key for 3 s so nobody mashes it.
- The thrower is stunned for 1 s under your tower, with a whistle. Your team's longest-dead hero respawns at once at your fort.
- The Ball becomes a real duel: throw early and risk the catch, or walk closer into the guns. Bots catch at a tuned rate, not perfectly.

The moment: you're the last one alive, the enemy winds up at your fort, you catch it, the whistle blows, and your teammate jogs back in behind you. That's the clip.

### 2. Out, not gone [medium]

In Völkerball, the players you knock out go and stand behind your back line and keep throwing at you. Dead in a MOBA means 20 s of staring at a grey screen. Steal the German rule.

- A dead hero appears as a flat grey cardboard cutout on the touchline (|z| = 17), walking along it only, untargetable, with a team-coloured outline.
- It throws a slow rubber ball inward: range 14, 12 m/s, 60 damage, cooldown 3 s. Heroes only. Structures and minions ignore it; hedges and pillars block it.
- Each hit takes 2 s off your death timer. A takedown from the touchline brings you straight back in.
- It's the comeback mechanic that isn't a stat handout. The team that's losing fights has more people on the touchline, and the team that's winning has to cross the flanks under fire from its victims.

The moment: dead, you sprint the touchline, snipe the enemy who's limping home on 40 HP, and pop back in four seconds early.

### 3. The Ball drops in [small]

The Ball shouldn't appear; it should arrive. Smash's falling crates, a gym teacher's lob from the far end of the yard.

- Over the 30 s warning, a printed ink shadow grows in the plaza ring from nothing to the Ball's 1.4 m. In the last 1 s the Ball streaks in from the top of the screen and lands on the spawn tick.
- A hero whose disc overlaps the landing is bonked: 1 s stun, no damage, a "BONK" stamp and circling stars.
- It then bounces once, 3 m toward the team that has lost more structures (seeded on a tie), and the normal 0.75 s pickup starts where it rests.
- Standing dead centre is greedy and loses the race; the edge of the shadow is where you want to be. The shadow is a 30 s tell on a fixed tick, so it costs guests nothing online.

The moment: six heroes jostle on the rim of the shadow, one gets impatient and steps in, and the whole room hears the bonk. Rides on the Ball (built) and 05's juice pass.

### 4. The crane shot [medium]

The front end is a Moebius desert with a huge pale sun; the game is a top-down paper strip. They should be the same world, seen from two heights.

- On the core kill, while `matchOver` holds the sim, the camera pitches from top-down to nearly level and pulls back over 2.5 s. The canvas already clears transparent, so the front end's SVG sky, sun and mesas, mounted behind it, show wherever the map ends.
- The lane turns out to be a printed plate floating over the desert, like dodgeball's original court, with the winners small against the sun and the core's rubble still settling.
- Reverse it at match start: 1.5 s from the sky down onto your hero before 0:00, so no control is lost. Render-only, so it survives shared play, unlike the slow-motion shatter.
- It answers brief 03's question: the looks don't converge or split; the front end is the long shot and the game is the close-up.

The moment: the last Q hits the crystal, the camera rises, and the fight you just played is a thin cream line under a giant sun. Rides on 03's post-match slice and lane slice 6.

## One-liners

- **Sneaker squeaks [small]:** every reversal and hard stop squeaks, pitched by speed, so the instant movement is something you can hear.
- **Ink stamps [small]:** hits print comic words on the ground ("THWOK", "WHIFF" on a near miss) that fade over 20 s, so the lane keeps a record of the fight.
- **The PE teacher [small]:** the announcer is a whistle and a speech bubble. "Hustle!" when a team hides under its tower, "Last one standing!", "Walk it off" on respawn.
- **Picked last [small]:** before the match, two bot captains pick teams on the plaza. Whoever's picked last gets +5% damage for the game, and a sad trombone.
- **High five [small]:** two allies pressing mount beside each other slap hands: a crack, a sticker burst, 2 s of +20% speed for both.
- **Comic-strip recap [medium]:** the match ends on three halftone panels frozen from the biggest `present` facts (a catch, a multi-hit, the core), ready to screenshot.
- **Hot potato [medium]:** a ticking ball sticks to the last hero it touched. Tag an enemy to pass it; it blows at zero for 25% HP.
- **The crowd [medium]:** cardboard kids line the boundary, heads turning to follow the Ball and the loudest fact, "ooh" on a near miss. The fight off-screen is wherever they're all looking; the dead stand among them.
- **Rally [medium]:** a tennis ball crosses the centreline. If it bounces twice on your half, your front structure takes 400; any hit sends it back. Pong, inside a MOBA.
- **The old court [big]:** after 10:00 the plaza lifts into the original floating dodgethis court with void edges. Ball hits knock back 3 m, and anyone knocked off hangs in the air, looks at the camera, and drops.
