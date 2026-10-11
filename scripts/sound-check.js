// `bun run sound:check [words…] [--all] [url]`: every sound's numbers (length, attack, tail, peak, rms, timbre
// centroid) against the docs/sound.md rules, rendered offline in a headless browser on the sound board
// (docs/pages/sound/numbers.js). Prints the flagged uses; words pick uses by id, --all prints every use.
// `--files` measures Oskar's library (sounds/osk-sfx/) instead; `--shortlist <words>` ranks library files for each
// use the words pick and writes the top five to sounds/shortlists.json, where the board offers them.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { libraryNumbers } from './sound-library.js'

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

// Shortlists: score each library file for a use by what its name says (the use's part and its source's family in
// docs/sound.md) and by the rules (front-loaded, short in a fight), then match its level to the built-in sound.
const PART = {
	shot: /attack|throw|sword|woosh|swish|dodge|laser|zap|shoot|pepsound|phaser|whoosh/,
	hit: /impact\/|hit|punch|slap|bite|chop|knife|smack|thud|knock/,
}
const FAMILY = {
	Fletcher: /wood|plank|pluck|string|knife|arrow/,
	Mitts: /soft|punch|leather|cloth|slap|drop/,
	'P. Pong': /tin|plate|tap|pop|cork/,
	Structures: /metal|plate|bell|mining|tin-medium/,
	Ball: /glass|bell/,
	Minions: /generic|monster|wood-light|soft-medium/,
	'Basic attack': /punch|hit|attack|generic/,
}
const SKIP = /^(ambience|instruments|voice\/bot-talk|readouts)\//
if (args.includes('--shortlist')) {
	const library = await libraryNumbers()
	const path = 'sounds/shortlists.json'
	const lists = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}
	const calm = ['Menus', 'Lobby', 'Splash and descent', 'Music', 'Progress']
	const taken = new Map() // source → files already near the top of a sibling use's list
	for (const { id, source, numbers: built } of shown) {
		const part = /\.(shot)$/.test(id) ? 'shot' : 'hit'
		const fight = !calm.includes(source)
		const scored = Object.entries(library)
			.filter(([file, n]) => n && !SKIP.test(file))
			.map(([file, n]) => {
				const why = []
				let score = 0
				if (PART[part].test(file)) {
					score += 3
					why.push(part)
				}
				if (FAMILY[source]?.test(file)) {
					score += 2
					why.push(`${source} family`)
				}
				if (n.attack > 25) score -= Math.min(4, n.attack / 25)
				if (fight && n.tail > 400) score -= 2
				if (n.length > 700) score -= 2
				if (n.peak < -45) score -= 1
				if (taken.get(source)?.has(file)) score -= 1.5 // siblings share a family, not a file
				const gain = built
					? Math.min(1.5, Math.max(0.05, 10 ** ((built.rms - n.rms) / 20) / 0.6))
					: 0.5
				return {
					file,
					score,
					gain: Math.round(gain * 20) / 20,
					why: why.join(', ') || 'numbers only',
				}
			})
			.sort((a, b) => b.score - a.score || library[a.file].attack - library[b.file].attack)
		const stems = new Map()
		lists[id] = scored
			.filter(({ file }) => {
				const stem = file.replace(/-?\d+\.\w+$/, '')
				stems.set(stem, (stems.get(stem) ?? 0) + 1)
				return stems.get(stem) <= 2
			})
			.slice(0, 5)
		if (!taken.has(source)) taken.set(source, new Set())
		for (const c of lists[id].slice(0, 2)) taken.get(source).add(c.file)
		console.log(`${id}: ${lists[id].map((c) => `${c.file} ×${c.gain}`).join(', ')}`)
	}
	writeFileSync(path, JSON.stringify(lists, null, '\t'))
	console.log(`Shortlists for ${shown.length} uses in ${path}.`)
}
