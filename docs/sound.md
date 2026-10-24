# Sound

How the game should sound, for anyone composing music, generating tracks or making sound effects. The look is in [look.md](look.md); sound follows the same direction: cute with swagger, a 90s and early-2000s Japanese console soul, warm light over floating isles.

## Direction

- **Warm and analog, with toy sparkle.** Rhodes, fretless-style bass, Minimoog leads, real-feeling drums, then square-wave arpeggios, vocoder pads and small electronic blips on top. Azymuth's Brazilian jazz-funk is the warmth; Yellow Magic Orchestra is the fun and the machine.
- **Anticipation, not tension.** Menus feel like stretching before a match: carefree, a little restless, never ominous.
- **Readable first.** In a match, sound is information: a hit, a cast, a Ball spawn must be recognisable with the screen off. Music sits under the effects, never on top.
- **Never cheap-cute.** No kazoo, no cartoon boings, no plush squeaks. Charm comes from playing and timbre, not from jokes.

## Music

Music is composed in Oskar's [jukebox](https://jukebox.0sk.ar) (`oskarrough/jukebox`, private) as plain-text `.song` files. `bun run sync-jukebox` copies its parser and synth into `src/core/jukebox/` (edit them there, not here) and the game's songs into `public/music/`; `src/core/music.js` plays them by scene (`SONGS`). The main theme `theme` plays on the splash and in the lobby, and each map names its score with `music` in its map file (`overthrow`, `flagfall`, `altamesa`), which the `play` scene becomes in a match. The old synthesised scenes (`lobby`, `play`, `clutch`, `victory`, `defeat`) still play where no song is set, as in dodgeball and the stings.

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

- **One family per source.** Each hero has a timbre (Ibis: taut string and wood; Kappa: leather and thump); structures are stone and iron; the Ball is bright glass and a low bloom.
- **Short and front-loaded.** The transient lands on the frame the action does; tails stay under 400 ms in a fight. Nothing delays feedback (the feel bar is Melee).
- **Positional and capped.** Effects pan with the world and duck when many play at once; your own hero's sounds sit slightly louder.
- **UI is soft and dry.** Clicks and focus sounds are quiet wood and paper (the `tap/` clicks), never beeps.
- Sample files come from Oskar's library (`sounds/osk-sfx/`, gitignored) and ship as Ogg in `public/sfx/kept/`; many effects are synthesised in code. A new effect gets a line in [feature-map.md](feature-map.md).

## Tooling

- `src/modes/moba/sound-table.js` lists every sound use and which facts set it off (an empty list is silent; `silentByChoice` explains deliberate silence). Ability uses are discovered from their folder's `effects` parts and read live recipes from `sound: { cast, shot, hit, impact }` in `<id>-tune.js`; mark those manifest parts `true`, with `projectile` marking `shot`. Hook, Oolong and Mandador own their recipes there; older abilities still name voices in `look.sounds`. The game plays a use id, never a voice name. Board likes, approved sounds and kept files key on that id, so moving a recipe does not reset picks. Support `contact` facts select their use with `part` (`hit` or `impact`).
- The sound board, http://office-linux.heron-mermaid.ts.net:5173/pages/sound/, plays every use, alone or over a crowded fight (In a fight), and swaps library files (or another built-in sound) into a use. Swaps live in that browser and reach the game open in another tab (splash, lobby, descent or match) on its next event. Keep writes a swap into the repo: the file goes to `public/sfx/kept/` as Ogg (an Ogg ships as it is) and the swap into `src/core/sfx/kept.json`, waiting for a commit.
- The live board at https://dodgethis.0sk.ar/pages/sound/ is read-only: committed picks and each sound's top five candidates, with no dev-server actions or saved review edits. `vite build` ships every `pages/**/*.html` page (and `/pages/page.css`) at the same path as in dev; this board still swaps in `showcase.js`. `scripts/sound-showcase.js` refreshes the tracked snapshot in `public/sfx/showcase/` from `sounds/shortlists.json` on builds and shortlist updates (`sound:check --shortlist`, `sound:sync`), pruning unused library files. Deploy builds without the dev library validate that snapshot instead; include it when committing changed shortlists. Music and sounds without a shortlist still play their current pick.
- The mix bus (`tune.mix` in `src/core/tune.js`, `onBus` in `src/core/audio.js`): every sound plays on one bus (menus, your hero, other heroes, world, music) with its own level, at most a few sounds per bus in any short window, and fight sounds duck the music. Each use's bus comes from its source in the sound table; a hero sound is yours when its fact names you. The board's sliders set it live.
- Oskar's library (`sounds/osk-sfx/`, gitignored, served by the dev server) is where new sounds come from. A new sound goes into Dropbox (Rough Resources/Sounds/osk-sfx/); the board's Resync button runs `bun run sound:sync`, which mirrors it into `sounds/osk-sfx/`, measures new files and rebuilds every shortlist (`sounds/shortlists.json`: name hints for the use and its source's family, the rules above, level matched to the built-in sound). `bun run sound:check --files [words]` prints each library file's numbers.
- The board (`pages/sound/`: `state.js` holds everything, `board.js` the shell, `inspector.js` the deck, `map.js` the sound map, `tools.js`, `palette.js`) is a desktop app: a strip of every sound coloured by status (grey untouched, blue being tried, gold picked), sources, the sound map (every library file by brightness and length; hover plays, click tries it in the selected sound) and the inspector. The deck offers a sound's candidates one card at a time from its shortlist, files near the current one, the whole library or a folder; each key is printed on its button. Nope (X) hides a file for that sound in this browser, Like (S) adds it to the shuffle (one picked at random per play, never the same twice running), Keep (K) ships the liked files or the one playing, or marks an untouched built-in sound as fine (`pages/sound/approved.json`), then moves to the next sound. ⌘K finds any sound, tool or file. Generate (under the deck) asks ElevenLabs for new candidates from a prompt prefilled from the use (`ELEVENLABS_API_KEY` in `.env.local`, gitignored; `POST /__sound/generate` in `vite.config.js`); files land in Dropbox and the mirror under `generated/<use>/` and become the deck's pile.
- Agents can't hear: they prove a sound change with numbers. `bun run sound:check` renders every use offline and prints the ones breaking the rules above (attack under 25 ms, fight tails under 400 ms, menus under −18 dB, one timbre family per fight source); `bun run sound:check <words>` prints the uses matching them, `--all` every use. The board shows the same numbers per row and for every file Oskar adds.
