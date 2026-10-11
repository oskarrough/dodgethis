import { defineConfig } from 'vite'
import wasm from 'vite-plugin-wasm'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

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
// Review pages (/docs/pages/…) are folders with an index.html; without the
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

// The sound board's Keep button (docs/pages/sound/): a picked file lands in public/sfx/kept/ as Ogg and its swap
// in src/core/sfx/kept.json, so it ships with the next commit. No file and no voice puts the use back on its
// built-in sound.
const soundKeep = {
	name: 'sound-keep',
	apply: 'serve',
	// A Keep must not reload the game mid-match; open pages mirror the change until their next reload.
	handleHotUpdate({ file }) {
		if (file.endsWith('src/core/sfx/kept.json') || file.includes('/public/sfx/kept/')) return []
	},
	configureServer(server) {
		server.middlewares.use('/__sound/keep', async (req, res) => {
			const q = new URL(req.url, 'http://board').searchParams
			const id = q.get('use') ?? ''
			if (req.method !== 'POST' || !/^[\w.-]+$/.test(id)) return res.writeHead(400).end()
			const root = server.config.root
			const listPath = join(root, 'src/core/sfx/kept.json')
			const dir = join(root, 'public/sfx/kept')
			const list = JSON.parse(readFileSync(listPath, 'utf8'))
			const names = (entry) => (entry?.shuffle ?? [entry]).map((s) => s?.kept).filter(Boolean)
			const old = names(list[id])
			const gain = Number(q.get('gain') ?? 0.5)
			if (q.get('name')) {
				const chunks = []
				for await (const chunk of req) chunks.push(chunk)
				const raw = basename(q.get('name')).replace(/[^\w.-]+/g, '-')
				const stem = `${id}--${raw.replace(/\.[^.]+$/, '')}`
				const temp = join(tmpdir(), `sound-keep-${Date.now()}-${raw}`)
				mkdirSync(dir, { recursive: true })
				writeFileSync(temp, Buffer.concat(chunks))
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
		})
	},
}

export default defineConfig({
	plugins: [wasm(), folderSlash, soundKeep],
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
		rollupOptions: { treeshake: false },
	},
})
