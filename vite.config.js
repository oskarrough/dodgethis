import { defineConfig } from 'vite'
import wasm from 'vite-plugin-wasm'
import { execFile, execFileSync } from 'node:child_process'
import {
	copyFileSync,
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { syncShowcase } from './scripts/sound-showcase.js'

// Rapier (non-compat) ships its physics engine as a real .wasm file. vite-plugin-wasm
// rewrites Rapier's `import * as wasm from './…_bg.wasm'` into a generated module that
// instantiates the wasm at top level (`const m = await initWasm(…)`). build.target
// 'esnext' gives native top-level await, so vite-plugin-top-level-await isn't needed.
//
// The catch: Rapier's package.json marks almost everything side-effect-free, so
// Rollup's production tree-shaker deletes that `await initWasm(…)` as a pure, unused
// statement — the wasm exports then come back `undefined` and the game fails to boot
// (`Cannot read … 'rawintegrationparameters_new'`). Dev is unaffected (no shaking).
// Module-level `treeshake.moduleSideEffects` can't save a statement-level elimination,
// so tree-shaking is disabled. It costs little here (~12 kB gzip): the app imports
// `* as THREE` everywhere, which already limits what three.js shaking could remove.
//
// The payoff stands: the ~1.5 MB wasm is emitted as its own cacheable, streamable
// asset instead of base64-inlined into the JS — the initial JS bundle drops from
// ~906 kB gzip (the -compat build) to ~180 kB gzip.
// Review pages (/pages/…) are folders with an index.html; without the
// trailing slash Vite's SPA fallback serves the game instead.
const folderSlash = {
	name: 'folder-slash',
	configureServer(server) {
		server.middlewares.use((req, res, next) => {
			const path = req.url.split('?')[0]
			if (
				path !== '/' &&
				!path.endsWith('/') &&
				existsSync(join(server.config.root, path, 'index.html'))
			) {
				res.writeHead(301, { Location: path + '/' + req.url.slice(path.length) })
				return res.end()
			}
			next()
		})
	},
}

// The sound board's Keep button (pages/sound/): a picked file lands in public/sfx/kept/ as Ogg and its swap
// in src/core/sfx/kept.json, so it ships with the next commit. No file and no voice puts the use back on its
// built-in sound.
const soundKeep = {
	name: 'sound-keep',
	apply: 'serve',
	// A Keep must not reload the game mid-match; open pages mirror the change until their next reload.
	handleHotUpdate({ file }) {
		if (
			file.endsWith('src/core/sfx/kept.json') ||
			file.endsWith('pages/sound/approved.json') ||
			file.includes('/public/sfx/kept/')
		)
			return []
	},
	configureServer(server) {
		// Every audio file in Oskar's library (sounds/osk-sfx/) right now, with its folder path, so files dropped in
		// show up on the board's next load without re-measuring.
		server.middlewares.use('/__sound/library', (req, res) => {
			const root = join(server.config.root, 'sounds/osk-sfx')
			const files = existsSync(root)
				? readdirSync(root, { recursive: true })
						.map(String)
						.filter((path) => /\.(mp3|wav|ogg|m4a|flac|aiff?|webm)$/i.test(path))
						.sort()
				: []
			res.setHeader('content-type', 'application/json')
			res.end(JSON.stringify(files))
		})
		// Generate in the dev server only: the API key never reaches the board. Dropbox is the source of truth
		// for sound:sync's --delete mirror, so every candidate must land there as well as locally.
		server.middlewares.use('/__sound/generate', async (req, res) => {
			const reply = (status, body) => {
				res.writeHead(status, { 'content-type': 'application/json' })
				res.end(JSON.stringify(body))
			}
			if (req.method !== 'POST') return reply(405, { error: 'Use POST to generate sounds.' })
			if (!req.headers['content-type']?.startsWith('application/json'))
				return reply(415, { error: 'Send application/json.' })
			if (
				req.headers.origin &&
				(!URL.canParse(req.headers.origin) || new URL(req.headers.origin).host !== req.headers.host)
			)
				return reply(403, { error: 'Generate from the sound board on this server.' })
			let input
			try {
				const chunks = []
				let size = 0
				for await (const chunk of req) {
					size += chunk.length
					if (size > 16384) return reply(413, { error: 'Generation request is too large.' })
					chunks.push(chunk)
				}
				input = JSON.parse(Buffer.concat(chunks).toString())
			} catch {
				return reply(400, { error: 'Invalid JSON.' })
			}
			const { use, text, seconds, influence, count } = input ?? {}
			if (
				typeof use !== 'string' ||
				!/^[a-zA-Z0-9][\w.-]{0,99}$/.test(use) ||
				typeof text !== 'string' ||
				!text.trim() ||
				text.length > 2500 ||
				!Number.isFinite(seconds) ||
				seconds < 0.5 ||
				seconds > 30 ||
				!Number.isFinite(influence) ||
				influence < 0 ||
				influence > 1 ||
				!Number.isInteger(count) ||
				count < 1 ||
				count > 4
			)
				return reply(400, {
					error: 'Use a prompt (1–2500 characters), length 0.5–30 s, influence 0–1 and count 1–4.',
				})
			let key
			try {
				const { loadEnv } = await import('vite')
				key = loadEnv(server.config.mode, server.config.root, 'ELEVENLABS_').ELEVENLABS_API_KEY
				if (!key) return reply(503, { error: 'ELEVENLABS_API_KEY is missing in .env.local.' })
				// https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert
				const results = await Promise.allSettled(
					Array.from({ length: count }, async () => {
						const response = await fetch(
							'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128',
							{
								method: 'POST',
								headers: { 'xi-api-key': key, 'content-type': 'application/json' },
								body: JSON.stringify({
									text: text.trim(),
									duration_seconds: seconds,
									prompt_influence: influence,
									model_id: 'eleven_text_to_sound_v2',
								}),
								signal: AbortSignal.timeout(120000),
							},
						)
						if (!response.ok) {
							const body = await response.text()
							let message = body
							try {
								const detail = JSON.parse(body).detail
								message = detail?.message ?? (typeof detail === 'string' ? detail : body)
							} catch {
								/* An upstream error can be plain text. */
							}
							throw Object.assign(new Error(message), { status: response.status })
						}
						const bytes = Buffer.from(await response.arrayBuffer())
						if (!bytes.length) throw new Error('ElevenLabs returned an empty sound.')
						return bytes
					}),
				)
				const failed = results.find((result) => result.status === 'rejected')
				if (failed) throw failed.reason
				const { DROPBOX, LIBRARY } = await import('./scripts/sound-library.js')
				const folder = `generated/${use}`
				const dropbox = join(DROPBOX, folder)
				const mirror = join(server.config.root, LIBRARY, folder)
				mkdirSync(dropbox, { recursive: true })
				mkdirSync(mirror, { recursive: true })
				const stem =
					text
						.trim()
						.toLowerCase()
						.replace(/[^a-z0-9]+/g, '-')
						.slice(0, 40)
						.replace(/-$/, '') || 'sound'
				const files = []
				let counter = 1
				for (const result of results) {
					while (true) {
						const name = `${stem}-${String(counter++).padStart(3, '0')}.mp3`
						const original = join(dropbox, name)
						const local = join(mirror, name)
						if (existsSync(original) || existsSync(local)) continue
						try {
							writeFileSync(original, result.value, { flag: 'wx' })
						} catch (error) {
							if (error.code === 'EEXIST') continue
							throw error
						}
						try {
							writeFileSync(local, result.value, { flag: 'wx' })
						} catch (error) {
							rmSync(original, { force: true })
							if (error.code === 'EEXIST') continue
							throw error
						}
						files.push(`${folder}/${name}`)
						break
					}
				}
				return reply(200, { files })
			} catch (error) {
				const message = String(error.message ?? 'Sound generation failed.')
				return reply(error.status ?? 502, {
					error: key ? message.replaceAll(key, '[redacted]') : message,
				})
			}
		})
		// The board's Resync button: `bun run sound:sync` mirrors the library from Dropbox and rebuilds shortlists.
		server.middlewares.use('/__sound/sync', (req, res) => {
			if (req.method !== 'POST') return res.writeHead(400).end()
			execFile(
				'bun',
				['run', 'sound:sync'],
				{ cwd: server.config.root },
				(error, stdout, stderr) => {
					res.writeHead(error ? 500 : 200, { 'content-type': 'text/plain' })
					res.end(error ? stderr || error.message : stdout)
				},
			)
		})
		// The board's K on a sound nobody swapped: Oskar heard the built-in sound and it stays. A list of use ids in
		// pages/sound/approved.json, which only the board reads; a Keep or a new swap takes the id back out.
		server.middlewares.use('/__sound/approve', (req, res) => {
			const q = new URL(req.url, 'http://board').searchParams
			const id = q.get('use') ?? ''
			if (req.method !== 'POST' || !/^[\w.-]+$/.test(id)) return res.writeHead(400).end()
			const path = join(server.config.root, 'pages/sound/approved.json')
			const list = new Set(existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [])
			if (q.get('off')) list.delete(id)
			else list.add(id)
			writeFileSync(path, JSON.stringify([...list].sort(), null, '\t') + '\n')
			res.setHeader('content-type', 'application/json')
			res.end(JSON.stringify([...list]))
		})
		// Keeps run one at a time, each reading kept.json afresh, so two quick Keeps can't undo each other.
		let keeping = Promise.resolve()
		server.middlewares.use('/__sound/keep', async (req, res) => {
			const q = new URL(req.url, 'http://board').searchParams
			const id = q.get('use') ?? ''
			if (req.method !== 'POST' || !/^[\w.-]+$/.test(id)) return res.writeHead(400).end()
			const chunks = []
			for await (const chunk of req) chunks.push(chunk)
			const turn = keeping.then(() => keep(q, id, Buffer.concat(chunks), res))
			keeping = turn.catch(() => {})
			await turn.catch((error) => res.writeHead(500).end(String(error)))
		})
		const keep = (q, id, body, res) => {
			const root = server.config.root
			const listPath = join(root, 'src/core/sfx/kept.json')
			const dir = join(root, 'public/sfx/kept')
			const list = JSON.parse(readFileSync(listPath, 'utf8'))
			const names = (entry) => (entry?.shuffle ?? [entry]).map((s) => s?.kept).filter(Boolean)
			const old = names(list[id])
			const gain = Number(q.get('gain') ?? 0.5)
			if (q.get('name')) {
				// Named from the whole library path, so two files both called hit.ogg stay two files; a kept file
				// shipped again keeps its name.
				const source = q.get('name')
				const ext = source.match(/\.[^./]+$/)?.[0] ?? ''
				let base = ext ? source.slice(0, -ext.length) : source
				if (base.startsWith(`${id}--`)) base = base.slice(id.length + 2)
				const raw = `${base.replace(/[^\w.-]+/g, '-')}${ext}`
				const stem = `${id}--${base.replace(/[^\w.-]+/g, '-')}`
				const temp = join(tmpdir(), `sound-keep-${Date.now()}-${raw}`)
				mkdirSync(dir, { recursive: true })
				writeFileSync(temp, body)
				// Ogg ships as it is; anything else becomes Ogg Vorbis, or ships untouched without ffmpeg.
				let file = `${stem}.ogg`
				try {
					if (/\.ogg$/i.test(raw)) writeFileSync(join(dir, file), readFileSync(temp))
					else
						execFileSync('ffmpeg', [
							'-v',
							'error',
							'-y',
							'-i',
							temp,
							'-codec:a',
							'libvorbis',
							'-q:a',
							'4',
							join(dir, file),
						])
				} catch {
					file = `${stem}${raw.match(/\.[^.]+$/)?.[0] ?? ''}`
					writeFileSync(join(dir, file), readFileSync(temp))
				}
				rmSync(temp, { force: true })
				// append=1 adds the file to the use's shuffle instead of replacing its sound.
				const before = q.get('append')
					? (list[id]?.shuffle ?? (list[id]?.kept ? [list[id]] : []))
					: []
				list[id] = before.length
					? { shuffle: [...before, { kept: file, gain }] }
					: { kept: file, gain }
			} else if (q.get('voice')) list[id] = { voice: q.get('voice') }
			else delete list[id]
			const used = new Set(Object.values(list).flatMap(names))
			for (const name of old) if (!used.has(name)) rmSync(join(dir, name), { force: true })
			writeFileSync(listPath, JSON.stringify(list, null, '\t') + '\n')
			res.setHeader('content-type', 'application/json')
			res.end(JSON.stringify(list[id] ?? null))
		}
	},
}

// Production sound board is read-only: swap the live board for the committed showcase.
const soundShowcase = {
	name: 'sound-showcase',
	apply: 'build',
	buildStart() {
		syncShowcase()
	},
	transformIndexHtml: {
		order: 'pre',
		handler(html, context) {
			return context.filename.endsWith('/pages/sound/index.html')
				? html.replace('src="./board.js"', 'src="./showcase.js"')
				: html
		},
	},
}

// Sibling files Vite leaves behind (items.json, <a href> images, classic viewer.js)
// and /pages/page.css so that path still works next to the hashed stylesheet.
const pages = {
	name: 'pages',
	apply: 'build',
	closeBundle() {
		cpSync('pages', join('dist', 'pages'), {
			recursive: true,
			filter: (src) => statSync(src).isDirectory() || !src.endsWith('.html'),
		})
	},
}

// drune.html is a self-contained toy next to the game (plain ES modules, no imports), so it ships
// verbatim: copying it beats teaching the bundler about a page that has no build step.
const drune = {
	name: 'drune',
	apply: 'build',
	closeBundle() {
		copyFileSync('drune.html', join('dist', 'drune.html'))
		cpSync('drune', join('dist', 'drune'), { recursive: true })
	},
}

export default defineConfig({
	plugins: [wasm(), folderSlash, soundKeep, soundShowcase, pages, drune],
	// The build's id, its time: online rooms only seat guests from the same build (online/net.js `BUILD`).
	define: { __BUILD__: String(Date.now()) },
	server: {
		// Vite rejects Host headers it does not recognise. Two dev setups need
		// naming: portless gives each app a stable https://<name>.localhost URL,
		// and `portless run --tailscale` also publishes it on the tailnet so other
		// machines can play a build without a deploy. A leading dot allows the
		// domain and its subdomains. Dev server only — this is not a build setting.
		allowedHosts: ['.localhost', '.ts.net'],
		proxy: { '/api': 'http://127.0.0.1:8787' },
		// The shared agent server (`bun run dev:agent`) never pushes reloads: parallel
		// threads edit one checkout, and a reload mid-proof wipes the page under them.
		// Edits still invalidate modules, so a manual reload serves fresh code.
		hmr: process.env.DEV_AGENT ? false : undefined,
	},
	build: {
		target: 'esnext',
		rollupOptions: {
			treeshake: false,
			// Every pages/**/*.html, so a new page ships without editing this list.
			input: [
				'index.html',
				...readdirSync('pages', { recursive: true })
					.filter((name) => String(name).endsWith('.html'))
					.map((name) => join('pages', name)),
			],
		},
	},
})
