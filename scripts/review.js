// bun run review -- --title "…" --ask "…" --thread $BB_THREAD_ID <files…> [--link url] [--at ISO]
//   [--pair before.png after.png]  one side-by-side image, labelled before and after
//   [--body notes.md]              prose shown under the ask (markdown)
//   [--update <slug>]              change an existing page in place: new media and text replace the old
// Copies media, writes pages/<date>-<slug>/index.html and appends a "To review" item to pages/items.json.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parseArgs } from 'node:util'
import { lanPort } from './dev-agent-lan.js'

const pages = join(import.meta.dir, '..', 'pages')
const itemsPath = join(pages, 'items.json')
const isVideo = (file) => /\.(webm|mp4)$/i.test(file)

export const slugOf = (item) =>
	`${item.at.slice(0, 10)}-${item.title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.slice(0, 40)}`

export function writePage(item) {
	const directory = join(pages, item.page)
	mkdirSync(directory, { recursive: true })
	const figure = (file) => {
		const name = basename(file)
		const tag = isVideo(file)
			? `<video src="../${file}" controls></video>`
			: `<img src="../${file}" alt="${name}" loading="lazy" />`
		return `<figure>${tag}<figcaption>${name}</figcaption></figure>`
	}
	writeFileSync(
		join(directory, 'index.html'),
		`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${item.title} · dodgethis</title>
<link rel="stylesheet" href="/pages/page.css" />
</head>
<body class="page">
<main>
<h1>${item.title}</h1>
<p><small>${item.status} · ${item.at.slice(0, 10)}${item.thread ? ' · ' + item.thread : ''}</small></p>
<p><b>${item.ask}</b></p>
${item.body ? Bun.markdown.html(item.body) : ''}
${item.decision ? `<p>Decided: ${item.decision}</p>` : ''}
<div class="media">${item.media.map(figure).join('\n')}</div>
${item.links.length ? `<p>${item.links.map((link) => `<a href="${link}">${link}</a>`).join(' · ')}</p>` : ''}
<script src="../viewer.js"></script>
</main>
</body>
</html>
`,
	)
}

const mediaFile = /\.(png|webp|jpe?g|gif|webm|mp4)$/i

// Before and after in one picture, side by side, each labelled.
function pairImage(before, after, out) {
	const run = Bun.spawnSync(
		[
			'montage',
			'-background',
			'#1a1a1a',
			'-fill',
			'white',
			'-pointsize',
			'28',
			'-tile',
			'2x1',
			'-geometry',
			'+8+8',
			'-label',
			'before',
			before,
			'-label',
			'after',
			after,
			out,
		],
		{ stderr: 'pipe' },
	)
	if (run.exitCode !== 0) throw new Error(`montage failed: ${run.stderr.toString().trim()}`)
}

if (import.meta.main) {
	// --pair takes two paths, which parseArgs cannot; lift them out first
	const argv = Bun.argv.slice(2).filter((argument) => argument !== '--')
	const at = argv.indexOf('--pair')
	const pair = at >= 0 ? argv.splice(at, 3).slice(1) : null
	const { values, positionals } = parseArgs({
		args: argv,
		allowPositionals: true,
		options: {
			title: { type: 'string' },
			ask: { type: 'string' },
			thread: { type: 'string' },
			link: { type: 'string', multiple: true },
			at: { type: 'string' },
			body: { type: 'string' },
			update: { type: 'string' },
		},
	})
	const root = join(import.meta.dir, '..')
	const items = existsSync(itemsPath) ? JSON.parse(readFileSync(itemsPath, 'utf8')) : []
	// --update takes the folder name or any unique part of it
	const want = values.update?.replace(/^pages\//, '').replace(/\/$/, '')
	const matches = want
		? items.filter((entry) => entry.page.replace(/\/$/, '') === want).length
			? items.filter((entry) => entry.page.replace(/\/$/, '') === want)
			: items.filter((entry) => entry.page.includes(want))
		: []
	if (want && matches.length !== 1) {
		console.error(
			matches.length
				? `review: "${want}" matches ${matches.length} pages, e.g. ${matches
						.slice(0, 3)
						.map((entry) => entry.page)
						.join(' ')}`
				: `review: no page matching "${want}" in pages/items.json`,
		)
		process.exit(1)
	}
	const existing = matches[0] ?? null
	const files = positionals.filter((file) => mediaFile.test(file) && existsSync(file))
	const slug = existing ? existing.page.replace(/\/$/, '') : null
	const stage = join(process.env.TMPDIR || '/tmp', 'dodgethis-review-pairs')
	mkdirSync(stage, { recursive: true })
	if (pair) {
		const [before, after] = pair
		if (
			!before ||
			!after ||
			![before, after].every((file) => existsSync(file) && mediaFile.test(file))
		) {
			console.error('review: --pair needs two existing images: --pair before.png after.png')
			process.exit(1)
		}
		const out = join(
			stage,
			`${basename(before).replace(/\.\w+$/, '')}-vs-${basename(after).replace(/\.\w+$/, '')}.png`,
		)
		pairImage(before, after, out)
		files.unshift(out)
	}
	if (!existing && (!values.title || !files.length)) {
		console.error(
			'usage: bun run review -- --title "…" --ask "…" --thread $BB_THREAD_ID <files…> [--pair a.png b.png] [--body notes.md] [--link url]\n       bun run review -- --update <slug> [--title …] [--ask …] [--body notes.md] [files…]',
		)
		process.exit(1)
	}
	const body = values.body ? readFileSync(values.body, 'utf8').trim() : undefined
	const item = existing ?? {
		at: (values.at ? new Date(values.at) : new Date()).toISOString(),
		title: values.title,
		ask: values.ask ?? '',
		status: 'To review',
		decision: '',
		media: [],
		links: values.link ?? [],
		thread: values.thread ?? process.env.BB_THREAD_ID ?? '',
	}
	if (existing) {
		if (values.title) item.title = values.title
		if (values.ask !== undefined) item.ask = values.ask
		if (values.link) item.links = values.link
	}
	if (body !== undefined) item.body = body
	const pageSlug = slug ?? slugOf(item)
	item.page = `${pageSlug}/`
	if (files.length) {
		const mediaDir = join(pages, 'media', pageSlug)
		// read first: on --update the new media may sit in the folder that is about to be cleared
		const copies = files.map((file) => [basename(file), readFileSync(file)])
		if (existing) rmSync(mediaDir, { recursive: true, force: true })
		mkdirSync(mediaDir, { recursive: true })
		for (const [name, data] of copies) writeFileSync(join(mediaDir, name), data)
		item.media = files.map((file) => `media/${pageSlug}/${basename(file)}`)
	}
	if (!existing) items.unshift(item)
	writeFileSync(itemsPath, JSON.stringify(items, null, '\t') + '\n')
	// JSON.stringify spreads short arrays over lines; oxfmt (bun run check) wants them on one
	Bun.spawnSync(['bunx', 'oxfmt', itemsPath])
	writePage(item)
	// A --lan server for this checkout gets the page checked and its tailnet link; else the live link
	const port = lanPort(root)
	if (port) {
		const check = Bun.spawnSync(
			['bun', join(import.meta.dir, 'dev-agent-lan.js'), port, `/pages/${item.page}`],
			{ stdout: 'inherit', stderr: 'inherit' },
		)
		process.exit(check.exitCode)
	}
	console.log(`https://dodgethis.0sk.ar/pages/${item.page} (live once pushed to main)`)
}
