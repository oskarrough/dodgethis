// `bun run sound:check [words…] [--all] [url]`: every sound's numbers (length, attack, tail, peak, rms, timbre
// centroid) against the docs/sound.md rules, rendered offline in a headless browser on the sound board
// (docs/pages/sound/numbers.js). Prints the flagged uses; words pick uses by id, --all prints every use.
import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
const base = args.find((a) => a.startsWith('http')) ?? 'http://localhost:5173'
const words = args.filter((a) => !a.startsWith('http') && !a.startsWith('--'))
const session = `sound-check-${process.pid}`
const browser = (...rest) =>
	execFileSync('agent-browser', ['--session', session, ...rest], { encoding: 'utf8' })

let result
try {
	browser('open', `${base}/docs/pages/sound/?check`)
	result = JSON.parse(JSON.parse(browser('eval', 'soundNumbers().then(JSON.stringify)')))
} finally {
	browser('close')
}
const { rows, flags } = result
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
