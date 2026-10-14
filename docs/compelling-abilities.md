# Compelling abilities

What makes an ability worth pressing, for designing new kits and tuning old ones. Distilled from two Reddit threads of Heroes of the Storm players building dream "pick any three abilities" heroes and ranking ultimates (2026-10-14). Their power rankings were argued to bits; what they got excited about was consistent. The hard rules (tells, dodge deadline, interception) live in [heroes.md](heroes.md); this is the taste around them.

## What people get excited about

Nobody gushed over a damage number. They remembered moments:

- **The save.** A heal, shield or bunker that lands when the fight looked lost. Timing is the whole appeal: a fast, reliable save beats a bigger one that arrives late.
- **The catch, then the payoff.** Hook into Blizzard into Throw; Bone Prison into Zombie Wall. Every favourite combo had three beats: grab, hold, cash in. The ability that makes the team's next move obvious ("we caught them, go") was the most loved.
- **Moving the fight.** Medivac Dropship was ranked low and praised high. Bringing allies to a fight, or a fight to your allies, is fun on its own.
- **Something that acts for you.** A water elemental, a bunker to stand in. A second actor on the field doubles your decisions.
- **The brave escape.** Invulnerable dashes and cleanse-and-hide let players take a risk because they own the way out. Aggression with a parachute.
- **A fantasy.** March of the Black King and stage-diving across the map are niche and memorable, because they change how you picture the fight, not how it adds up.

Every one of these is a verb the other players can see. That's the lesson: excitement is visible and social, and lives in the gap between "they're dead" and "no they're not".

## Designing a new ability

1. **Name the moment first.** Write the clip it makes: "Mitts catches the Ball out of the air and the whole lane turns." If you can't, it's a stat, not an ability.
2. **Take a dodgeball verb.** Catch, ricochet, out-not-gone, dodge, the Ball. Each hero owns one rule the others don't use ([heroes.md](heroes.md)); a new ability should sharpen its hero's rule, not borrow another's.
3. **Leave a hole for a teammate.** The best kits are half a combo. A slow, a wall, a pull: something an ally can cash in. Abilities that finish their own setup make teammates spectators.
4. **Give the target a reply.** Every disable has a tell they can read, an exit they can take or a teammate who can answer it. The counterplay is part of the fun, for both sides.
5. **One read, one twist.** It should read at a glance from its tell and do one surprising thing. Two twists is two abilities.
6. **Feel before numbers.** Prove it on an empty floor first: windup, sound, the hit. Then tune.

## Without breaking the game

The threads' wishlists are also a list of what breaks a game:

- **Chained control is earned, not forbidden.** A stun is a stun: no immunity window, no get-out-of-jail card (Oskar, 2026-10-14). What keeps Bone Prison plus Entomb plus Frost Nova from being a cutscene is that each one is telegraphed and dodgeable on its own, so landing the chain is the skill and dodging the first link is the answer.
- **Mobility chains break the map.** "Map-wide kidnapping" (Gorge, then Blink, Dash, Jump) is the threads' funniest build and the one no one should ever face. A hero gets one burst of movement per fight; anything that relocates an enemy is slow, short or loud.
- **Saves need a cost.** A save without a cooldown, cast point or a counter becomes the meta. Make it short, or interruptible, or make it spend something (the Ball, Pocket, position).
- **No cooldowns is a sandbox.** The "free picks, no cooldowns" wish is a party mode, not a balance target. Build it as a toggle if it's ever wanted; don't tune toward it.
- **Synergy is where it breaks.** Single abilities rarely break a game; pairs do. Before shipping, ask what it does next to every other kit's control and dash.

## Tuning what exists

- **Buff the moment, not the stat.** If nobody presses it, the moment is unclear or unreachable: a longer window, a wider catch, a clearer tell. Raw damage is the last lever.
- **Nerf the safety, not the fun.** When something wins too often, cut its escape or its reliability before its punch. People forgive a strong ability they can see coming.
- **One number at a time.** Change a value in its tune file, then `bun run simulate --base` for the delta against the last commit and `--report` for per-ability and death-cause tables. Bots measure balance, not fun; play it too.
- **Watch for the unpicked.** A hero or ability nobody chooses is a design problem before it's a numbers one.
