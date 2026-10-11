// `bun run sound:check [words…] [--all] [url]`: every sound's numbers (length, attack, tail, peak, rms, timbre
// centroid) against the docs/sound.md rules, rendered offline in a headless browser on the sound board
// (docs/pages/sound/numbers.js). Prints the flagged uses; words pick uses by id, --all prints every use.
// `--files` measures Oskar's library (sounds/osk-sfx/) instead; `--shortlist [words]` ranks library files for each
// use the words pick (every use without words) and writes the top five to sounds/shortlists.json for the board.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { libraryNumbers, writeShortlists } from './sound-library.js'

const args = process.argv.slice(2)
const base = args.find((arg) => arg.startsWith('http')) ?? 'http://localhost:5173'
const words = args.filter((arg) => !arg.startsWith('http') && !arg.startsWith('--'))
const session = `sound-check-${process.pid}`
const browser = (...rest) =>
	execFileSync('agent-browser', ['--session', session, ...rest], { encoding: 'utf8' })

if (args.includes('--files')) {
	const numbers = await libraryNumbers()
	const shown = Object.entries(numbers).filter(
		([path]) => !words.length || words.some((word) => path.includes(word)),
	)
	for (const [path, measures] of shown)
		console.log(
			`${path.padEnd(48)} ${measures.length} ms · attack ${measures.attack} · tail ${measures.tail} · peak ${measures.peak} · rms ${measures.rms} · ${measures.centroid} Hz`,
		)
	console.log(`${shown.length} of ${Object.keys(numbers).length} library files.`)
	process.exit(0)
}

let result
try {
	browser('open', `${base}/docs/pages/sound/?check`)
	result = JSON.parse(JSON.parse(browser('eval', 'soundNumbers().then(JSON.stringify)')))
} finally {
	browser('close')
}
const { rows, flags } = result
writeFileSync('sounds/builtins.json', JSON.stringify(rows)) // the built-in levels shortlists match, for sound:sync
const shown = rows.filter((row) =>
	words.length
		? words.some((word) => row.id.includes(word))
		: args.includes('--all') || flags[row.id],
)
const pad = (value, width) => String(value).padStart(width)
console.log(
	`${'use'.padEnd(22)} ${pad('ms', 5)} ${pad('atk', 4)} ${pad('tail', 5)} ${pad('peak', 6)} ${pad('rms', 6)} ${pad('Hz', 6)}`,
)
for (const { id, numbers } of shown)
	console.log(
		numbers
			? `${id.padEnd(22)} ${pad(numbers.length, 5)} ${pad(numbers.attack, 4)} ${pad(numbers.tail, 5)} ${pad(numbers.peak, 6)} ${pad(numbers.rms, 6)} ${pad(numbers.centroid, 6)}  ${(flags[id] ?? []).join('; ')}`
			: `${id.padEnd(22)} silent`,
	)
console.log(`${Object.keys(flags).length} of ${rows.length} uses flagged.`)

if (args.includes('--shortlist')) {
	const lists = await writeShortlists(words.length ? shown : rows)
	for (const id of Object.keys(lists).filter((id) => shown.some((row) => row.id === id)))
		console.log(
			`${id}: ${lists[id].map((candidate) => `${candidate.file} ×${candidate.gain}`).join(', ')}`,
		)
	console.log(
		`Shortlists for ${words.length ? shown.length : rows.length} uses in sounds/shortlists.json.`,
	)
}
