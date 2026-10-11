import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
const all = args.includes('--all')
const word = args
	.filter((arg) => arg !== '--all')
	.join(' ')
	.trim()
if (!word || word === '--help') {
	console.log(
		'Usage: bun run where <word or phrase> [--all]\nFeature-map entries and source locations; --all shows every match.',
	)
	process.exit(word ? 0 : 1)
}
const rows = readFileSync(`${root}/docs/feature-map.md`, 'utf8')
	.split('\n')
	.map((text, index) => ({ text, line: index + 1 }))
	.filter(({ text }) => text.startsWith('- ') && text.toLowerCase().includes(word.toLowerCase()))
const shown = all ? rows : rows.slice(0, 6)
for (const row of shown) console.log(`docs/feature-map.md:${row.line}:${row.text}`)
if (shown.length < rows.length)
	console.log(`${rows.length - shown.length} more feature entries; add --all.`)
const needles = new Set([word])
if (word.includes(' '))
	for (const [, symbol] of (shown[0]?.text ?? '').matchAll(/`([A-Za-z_$][\w$]*)`/g))
		needles.add(symbol)
const search = spawnSync(
	'rg',
	[
		'-n',
		'-i',
		'-F',
		...[...needles].flatMap((needle) => ['-e', needle]),
		'--glob',
		'*.js',
		'--glob',
		'*.css',
		'src',
	],
	{ cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
)
if (search.error || search.status > 1) {
	console.error(search.error?.message ?? search.stderr)
	process.exit(1)
}
const owners = new Set()
for (const [, path] of (shown[0]?.text ?? '').matchAll(/`([^`]+\.js)`/g))
	owners.add(path.startsWith('src/') ? path : `src/plugins/moba/${path}`)
const hits = search.stdout.trim().split('\n').filter(Boolean)
// Mapped files first, then definitions; preserve rg's order within each group.
hits.sort(
	(a, b) =>
		Number(owners.has(b.split(':')[0])) - Number(owners.has(a.split(':')[0])) ||
		Number(/:\d+:\s*(?:export\b|(?:const|function|class)\b|[\w$]+:)/.test(b)) -
			Number(/:\d+:\s*(?:export\b|(?:const|function|class)\b|[\w$]+:)/.test(a)),
)
for (const hit of all ? hits : hits.slice(0, 8)) console.log(hit)
if (!all && hits.length > 8)
	console.log(`${hits.length - 8} more source hits; add --all or search an entry symbol.`)
if (!rows.length && !hits.length) {
	console.log(`No feature or source match for ${JSON.stringify(word)}.`)
	process.exitCode = 1
}
