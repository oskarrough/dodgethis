// bun run review -- --title "…" --ask "…" --thread $BB_THREAD_ID <files…> [--link url] [--at ISO]
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parseArgs } from 'node:util'

const root = join(import.meta.dir, '..', 'docs', 'pages', 'review')
const feedPath = join(root, 'feed.json')
const { values, positionals } = parseArgs({
	args: Bun.argv.slice(2).filter((a) => a !== '--'),
	allowPositionals: true,
	options: {
		title: { type: 'string' },
		ask: { type: 'string' },
		thread: { type: 'string' },
		link: { type: 'string', multiple: true },
		at: { type: 'string' },
	},
})
const media = positionals.filter(
	(f) => /\.(png|webp|jpe?g|gif|webm|mp4)$/i.test(f) && existsSync(f),
)
if (!values.title || !media.length) {
	console.error(
		'usage: bun run review -- --title "…" --ask "…" --thread $BB_THREAD_ID <files…> [--link url]',
	)
	process.exit(1)
}
const at = (values.at ? new Date(values.at) : new Date()).toISOString()
const slug = values.title
	.toLowerCase()
	.replace(/[^a-z0-9]+/g, '-')
	.slice(0, 40)
const folder = `${at.slice(0, 10)}-${slug}`
mkdirSync(join(root, 'media', folder), { recursive: true })
for (const f of media) copyFileSync(f, join(root, 'media', folder, basename(f)))

const feed = existsSync(feedPath) ? JSON.parse(readFileSync(feedPath, 'utf8')) : []
feed.unshift({
	at,
	title: values.title,
	thread: values.thread ?? process.env.BB_THREAD_ID ?? '',
	ask: values.ask ?? '',
	media: media.map((f) => `media/${folder}/${basename(f)}`),
	links: values.link ?? [],
})
feed.sort((a, b) => b.at.localeCompare(a.at))
writeFileSync(feedPath, JSON.stringify(feed, null, '\t') + '\n')
console.log('http://office-linux.heron-mermaid.ts.net:5173/docs/pages/review/')
