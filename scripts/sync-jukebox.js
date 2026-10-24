// Copies the jukebox (oskarrough/jukebox, private) into the game: its score parser and synth into
// src/core/jukebox/, and the game's songs into public/music/. Compose there, then run
// `bun run sync-jukebox` (JUKEBOX=path if the checkout isn't next to this one) and commit.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const from = process.env.JUKEBOX ?? join(root, '../jukebox')
const CODE = ['score.js', 'synth.js', 'player.js', 'effects.js']
// The scenes in src/core/music.js that play these, by file name in the jukebox's music/.
export const SONGS = ['dodgethis-theme', 'altamesa', 'overthrow', 'flagfall']

const code = join(root, 'src/core/jukebox')
const music = join(root, 'public/music')
mkdirSync(code, { recursive: true })
mkdirSync(music, { recursive: true })
for (const file of CODE) {
	const text = readFileSync(join(from, 'src', file), 'utf8')
	writeFileSync(
		join(code, file),
		`// Copied from oskarrough/jukebox by scripts/sync-jukebox.js; change it there.\n${text}`,
	)
}
for (const song of SONGS)
	copyFileSync(join(from, 'music', `${song}.song`), join(music, `${song}.song`))
console.log(`Copied ${CODE.length} files and ${SONGS.length} songs from ${from}`)
