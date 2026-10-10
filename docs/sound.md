# Sound

How the game should sound, for anyone composing music, generating tracks or making sound effects. The look is in [moba-look.md](moba-look.md); sound follows the same direction: cute with swagger, a 90s and early-2000s Japanese console soul, warm light over floating isles.

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
- **UI is soft and dry.** Clicks and focus sounds are quiet wood and paper (`click-*.mp3`), never beeps.
- Shipped files live in `src/core/sfx/` as mp3, and many effects are synthesised in code; a new effect gets a line in [feature-map.md](feature-map.md).
