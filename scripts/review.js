// bun run review -- --title "…" --ask "…" --thread $BB_THREAD_ID <files…> [--link url] [--at ISO]
// Copies media, writes docs/pages/<date>-<slug>/index.html and appends a "To review" item to docs/pages/items.json.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parseArgs } from 'node:util'

const pages = join(import.meta.dir, '..', 'docs', 'pages')
const itemsPath = join(pages, 'items.json')
const isVideo = (f) => /\.(webm|mp4)$/i.test(f)

export const slugOf = (item) =>
	`${item.at.slice(0, 10)}-${item.title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.slice(0, 40)}`

export function writePage(item) {
	const dir = join(pages, item.page)
	mkdirSync(dir, { recursive: true })
	const fig = (f) => {
		const name = basename(f)
		const tag = isVideo(f)
			? `<video src="../${f}" controls></video>`
			: `<img src="../${f}" alt="${name}" loading="lazy" />`
		return `<figure>${tag}<figcaption>${name}</figcaption></figure>`
	}
	writeFileSync(
		join(dir, 'index.html'),
		`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${item.title} · dodgethis</title>
<link rel="stylesheet" href="/docs/page.css" />
</head>
<body class="page">
<main>
<h1>${item.title}</h1>
<p><small>${item.status} · ${item.at.slice(0, 10)}${item.thread ? ' · ' + item.thread : ''}</small></p>
<p><b>${item.ask}</b></p>
${item.decision ? `<p>Decided: ${item.decision}</p>` : ''}
<div class="media">${item.media.map(fig).join('\n')}</div>
${item.links.length ? `<p>${item.links.map((l) => `<a href="${l}">${l}</a>`).join(' · ')}</p>` : ''}
<script src="../viewer.js"></script>
</main>
</body>
</html>
`,
	)
}

if (import.meta.main) {
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
	const files = positionals.filter(
		(f) => /\.(png|webp|jpe?g|gif|webm|mp4)$/i.test(f) && existsSync(f),
	)
	if (!values.title || !files.length) {
		console.error(
			'usage: bun run review -- --title "…" --ask "…" --thread $BB_THREAD_ID <files…> [--link url]',
		)
		process.exit(1)
	}
	const item = {
		at: (values.at ? new Date(values.at) : new Date()).toISOString(),
		title: values.title,
		ask: values.ask ?? '',
		status: 'To review',
		decision: '',
		media: [],
		links: values.link ?? [],
		thread: values.thread ?? process.env.BB_THREAD_ID ?? '',
	}
	const slug = slugOf(item)
	item.page = `${slug}/`
	mkdirSync(join(pages, 'review', 'media', slug), { recursive: true })
	for (const f of files) copyFileSync(f, join(pages, 'review', 'media', slug, basename(f)))
	item.media = files.map((f) => `review/media/${slug}/${basename(f)}`)
	const items = existsSync(itemsPath) ? JSON.parse(readFileSync(itemsPath, 'utf8')) : []
	items.unshift(item)
	writeFileSync(itemsPath, JSON.stringify(items, null, '\t') + '\n')
	writePage(item)
	console.log(`http://office-linux.heron-mermaid.ts.net:5173/docs/pages/${item.page}`)
}
