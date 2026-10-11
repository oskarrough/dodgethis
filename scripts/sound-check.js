// `bun run sound:check [words…] [--all] [url]`: every sound's numbers (length, attack, tail, peak, rms, timbre
// centroid) against the docs/sound.md rules, rendered offline in a headless browser on the sound board
// (docs/pages/sound/numbers.js). Prints the flagged uses; words pick uses by id, --all prints every use.
// `--files` measures Oskar's library (sounds/osk-sfx/) instead; `--shortlist [words]` ranks library files for each
// use the words pick (every use without words) and writes the top five to sounds/shortlists.json for the board.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { libraryNumbers, writeShortlists } from './sound-library.js'

const args = process.argv.slice(2)
const base = args.find((a) => a.startsWith('http')) ?? 'http://localhost:5173'
const words = args.filter((a) => !a.startsWith('http') && !a.startsWith('--'))
const session = `sound-check-${process.pid}`
const browser = (...rest) =>
	execFileSync('agent-browser', ['--session', session, ...rest], { encoding: 'utf8' })

if (args.includes('--files')) {
	const numbers = await libraryNumbers()
	const shown = Object.entries(numbers).filter(
		([path]) => !words.length || words.some((w) => path.includes(w)),
	)
	for (const [path, n] of shown)
		console.log(
			`${path.padEnd(48)} ${n.length} ms · attack ${n.attack} · tail ${n.tail} · peak ${n.peak} · rms ${n.rms} · ${n.centroid} Hz`,
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
const shown = rows.filter((r) =>
	words.length ? words.some((w) => r.id.includes(w)) : args.includes('--all') || flags[r.id],
)
const pad = (v, n) => String(v).padStart(n)
console.log(
	`${'use'.padEnd(22)} ${pad('ms', 5)} ${pad('atk', 4)} ${pad('tail', 5)} ${pad('peak', 6)} ${pad('rms', 6)} ${pad('Hz', 6)}`,
)
for (const { id, numbers: n } of shown)
	console.log(
		n
			? `${id.padEnd(22)} ${pad(n.length, 5)} ${pad(n.attack, 4)} ${pad(n.tail, 5)} ${pad(n.peak, 6)} ${pad(n.rms, 6)} ${pad(n.centroid, 6)}  ${(flags[id] ?? []).join('; ')}`
			: `${id.padEnd(22)} silent`,
	)
console.log(`${Object.keys(flags).length} of ${rows.length} uses flagged.`)

if (args.includes('--shortlist')) {
	const lists = await writeShortlists(words.length ? shown : rows)
	for (const id of Object.keys(lists).filter((id) => shown.some((r) => r.id === id)))
		console.log(`${id}: ${lists[id].map((c) => `${c.file} ×${c.gain}`).join(', ')}`)
	console.log(
		`Shortlists for ${words.length ? shown.length : rows.length} uses in sounds/shortlists.json.`,
	)
}
