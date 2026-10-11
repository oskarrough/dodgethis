# Sound

How the game should sound, for anyone composing music, generating tracks or making sound effects. The look is in [look.md](look.md); sound follows the same direction: cute with swagger, a 90s and early-2000s Japanese console soul, warm light over floating isles.

## Direction

- **Warm and analog, with toy sparkle.** Rhodes, fretless-style bass, Minimoog leads, real-feeling drums, then square-wave arpeggios, vocoder pads and small electronic blips on top. Azymuth's Brazilian jazz-funk is the warmth; Yellow Magic Orchestra is the fun and the machine.
- **Anticipation, not tension.** Menus feel like stretching before a match: carefree, a little restless, never ominous.
- **Readable first.** In a match, sound is information: a hit, a cast, a Ball spawn must be recognisable with the screen off. Music sits under the effects, never on top.
- **Never cheap-cute.** No kazoo, no cartoon boings, no plush squeaks. Charm comes from playing and timbre, not from jokes.

## Music

Today the game synthesises its own music in `src/core/music.js` (scenes `lobby`, `play`, `clutch`, `victory`, `defeat`, each with its own tempo). Generated tracks replace scenes one at a time; each must loop seamlessly and carry no vocals.

| Scene                      | Feel                                            | Tempo |
| -------------------------- | ----------------------------------------------- | ----- |
| Splash and lobby           | Sunset over floating isles; ready for something | ~112  |
| Match                      | Same palette, driving, more drums and bass      | ~120  |
| Clutch (late, close match) | Tighter, faster, the hook returns higher        | ~138  |
| Victory / defeat           | Short stings, under 10 s, then the lobby theme  | —     |

### Splash and lobby prompt

```
Instrumental, loopable menu theme for a hero brawler. 112 BPM, D major with lydian lifts.

Azymuth-style Brazilian jazz-funk meets Yellow Magic Orchestra synth-pop. Fender Rhodes
chords with lush 9ths and 11ths, a melodic fretless-style bass that walks and sings,
light samba-tinged drum kit with shaker and cuíca accents, soft Minimoog lead doing
glassy portamento melodies. Over it, bright square-wave arpeggios, a cheeky pentatonic
synth hook, vocoder "ahh" pads and a few toy-like electronic blips.

Mood: sunset over floating islands, carefree but anticipating something. It builds
a gentle readiness, like stretching before a match, without ever getting tense.

Structure: 8-bar Rhodes-and-bass intro, A section with the synth hook, B section
where the chords lift and a Moog solo floats over, short breakdown to just
arpeggio and shaker, then back to A. Seamless loop point, no fade-out, no vocals.
Clean analog warmth, wide stereo, gentle tape saturation.
```

## Sound effects

- **One family per source.** Each hero has a timbre (Fletcher: taut string and wood; Mitts: leather and thump); structures are stone and iron; the Ball is bright glass and a low bloom.
- **Short and front-loaded.** The transient lands on the frame the action does; tails stay under 400 ms in a fight. Nothing delays feedback (the feel bar is Melee).
- **Positional and capped.** Effects pan with the world and duck when many play at once; your own hero's sounds sit slightly louder.
- **UI is soft and dry.** Clicks and focus sounds are quiet wood and paper (the `tap/` clicks), never beeps.
- Sample files come from Oskar's library (`sounds/osk-sfx/`, gitignored) and ship as Ogg in `public/sfx/kept/`; many effects are synthesised in code. A new effect gets a line in [feature-map.md](feature-map.md).

## Tooling

- Every use the game makes a sound for is a line in `src/plugins/moba/sound-table.js`, and every fact says which uses it sets off (an empty list is a silent fact). The game plays a use by id, never a voice name; a new sound is a new line there.
- The sound board, http://office-linux.heron-mermaid.ts.net:5173/docs/pages/sound/, plays every use, a crowded fight, and swaps Oskar's own files (or another built-in sound) into a use. Swaps live in that browser and reach the game open in another tab (splash, lobby, descent or match) on its next event. Keep writes a swap into the repo: the file goes to `public/sfx/kept/` as Ogg (an Ogg ships as it is) and the swap into `src/core/sfx/kept.json`, waiting for a commit.
- The mix bus (`tune.mix` in `src/core/tune.js`, `onBus` in `src/core/audio.js`): every sound plays on one bus (menus, your hero, other heroes, world, music) with its own level, at most a few sounds per bus in any short window, and fight sounds duck the music. Each use's bus comes from its source in the sound table; a hero sound is yours when its fact names you. The board's sliders set it live.
- Oskar's library (`sounds/osk-sfx/`, gitignored, served by the dev server) is where new sounds come from. `bun run sound:check --files [words]` prints each library file's numbers; `bun run sound:check --shortlist <uses>` ranks the library for those uses (name hints for the use and its source's family, the rules above, level matched to the built-in sound) and writes the top five to `sounds/shortlists.json`. The board offers them first in each sound's list; Oskar picks by ear and Keeps.
- Agents can't hear: they prove a sound change with numbers. `bun run sound:check` renders every use offline and prints the ones breaking the rules above (attack under 25 ms, fight tails under 400 ms, menus under −18 dB, one timbre family per fight source); `bun run sound:check <words>` prints the uses matching them, `--all` every use. The board shows the same numbers per row and for every file Oskar adds.
