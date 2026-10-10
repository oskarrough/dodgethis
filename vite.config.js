import { defineConfig } from 'vite'
import wasm from 'vite-plugin-wasm'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

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

export default defineConfig({
	plugins: [wasm(), folderSlash],
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
